/**
 * Lembretes de horário: avisa um pouco antes de tarefas e compromissos com hora marcada.
 *
 * Aqui é o aviso local, com o app aberto (ou há pouco em segundo plano). Com o app fechado quem
 * avisa é o servidor, por push (ver services/push.ts) — os dois usam a mesma regra e a mesma “tag”,
 * então o mesmo aviso nunca aparece duas vezes.
 */
import { nowMin, todayISO } from '../domain/dates';
import { dueReminders } from '../domain/reminders';
import { getState } from '../store/store';
import { openSheet, toast } from '../store/ui';

const SENT_KEY = 'leve.reminders.sent';

export const remindersSupported = () => typeof window !== 'undefined' && 'Notification' in window;
export const reminderPermission = (): NotificationPermission | 'unsupported' =>
  remindersSupported() ? Notification.permission : 'unsupported';

/** Pede permissão ao sistema (precisa ser chamado a partir de um toque do usuário). */
export async function requestReminderPermission(): Promise<boolean> {
  if (!remindersSupported()) return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

/** Lembretes já enviados hoje (para não repetir a cada verificação). */
function loadSent(today: string): Set<string> {
  try {
    const raw = JSON.parse(localStorage.getItem(SENT_KEY) ?? '{}');
    return new Set(raw.date === today ? raw.keys : []);
  } catch {
    return new Set();
  }
}

function saveSent(today: string, keys: Set<string>) {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify({ date: today, keys: [...keys] }));
  } catch {
    /* noop */
  }
}

async function notify(title: string, body: string, tag: string, data: { taskId: string; date: string }) {
  if (reminderPermission() !== 'granted') return;
  const opts: NotificationOptions = { body, tag, icon: '/icon-192.png', badge: '/icon-192.png', data };
  try {
    // No celular (Android) a notificação precisa sair pelo service worker
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) {
      await reg.showNotification(title, opts);
      return;
    }
  } catch {
    /* cai no modo simples */
  }
  try {
    const n = new Notification(title, opts);
    n.onclick = () => {
      window.focus();
      openSheet({ type: 'task', id: data.taskId, date: data.date });
    };
  } catch {
    /* noop */
  }
}

/** Verifica o que está para começar e avisa uma vez por item. */
export function checkReminders() {
  const { settings, tasks } = getState();
  if (!settings.reminders) return;
  const today = todayISO();
  const now = nowMin();
  const sent = loadSent(today);
  let changed = false;
  for (const r of dueReminders(tasks, settings, today, now)) {
    if (sent.has(r.key)) continue;
    sent.add(r.key);
    changed = true;
    notify(r.title, r.body, r.key, { taskId: r.taskId, date: r.date });
    if (document.visibilityState === 'visible') {
      toast(`${r.left > 0 ? `Em ${r.left} min` : 'Agora'}: ${r.title}`, { label: 'Abrir', run: () => openSheet({ type: 'task', id: r.taskId, date: r.date }) });
    }
  }
  if (changed) saveSent(today, sent);
}

/** Liga a verificação periódica; devolve a função que desliga. */
export function startReminders(): () => void {
  const id = setInterval(checkReminders, 30_000);
  const onVisible = () => document.visibilityState === 'visible' && checkReminders();
  document.addEventListener('visibilitychange', onVisible);
  // Toque na notificação (vinda do service worker) abre a tarefa
  const onMessage = (e: MessageEvent) => {
    if (e.data?.type === 'open-task' && e.data.taskId) openSheet({ type: 'task', id: e.data.taskId, date: e.data.date });
  };
  navigator.serviceWorker?.addEventListener('message', onMessage);
  // App aberto pelo toque num push (estava fechado): /?task=ID&date=AAAA-MM-DD
  const q = new URLSearchParams(location.search);
  const taskId = q.get('task');
  if (taskId) {
    history.replaceState(null, '', location.pathname);
    if (getState().tasks.some((t) => t.id === taskId)) openSheet({ type: 'task', id: taskId, date: q.get('date') ?? undefined });
  }
  checkReminders();
  return () => {
    clearInterval(id);
    document.removeEventListener('visibilitychange', onVisible);
    navigator.serviceWorker?.removeEventListener('message', onMessage);
  };
}
