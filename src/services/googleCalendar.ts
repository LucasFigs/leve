/**
 * Integração com Google Agenda (Google Calendar API).
 *
 * Sincroniza tarefas e compromissos com data/horário criados e editados no Leve
 * diretamente na conta do Google Agenda do usuário.
 */
import { useSyncExternalStore } from 'react';
import type { Recurrence, Task } from '../domain/types';
import { addDays } from '../domain/dates';
import { actions, getState, subscribe } from '../store/store';
import { toast } from '../store/ui';

const CLIENT_ID =
  import.meta.env.VITE_GOOGLE_CLIENT_ID ||
  '862478611976-heidd1qqrghiar660jiujnge4ehmoctl.apps.googleusercontent.com';

const SCOPES = [
  'https://www.googleapis.com/auth/calendar.events',
  'https://www.googleapis.com/auth/calendar.readonly',
].join(' ');

const STORAGE_KEY_STATE = 'leve.gcal.state.v1';
const STORAGE_KEY_TOKEN = 'leve.gcal.token.v1';

export interface GoogleCalendarItem {
  id: string;
  summary: string;
  primary?: boolean;
}

export interface GoogleCalendarState {
  connected: boolean;
  email?: string;
  calendarId: string;
  autoSync: boolean;
  status: 'idle' | 'syncing' | 'synced' | 'error';
  lastSync?: number;
  error?: string;
  calendars: GoogleCalendarItem[];
}

interface StoredToken {
  accessToken: string;
  expiresAt: number;
}

/* ------------------------------------------------------------------ */
/* Estado e Armazenamento Local                                        */
/* ------------------------------------------------------------------ */

function readStoredState(): GoogleCalendarState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_STATE);
    if (raw) {
      return {
        calendarId: 'primary',
        autoSync: true,
        status: 'idle',
        calendars: [],
        ...JSON.parse(raw),
      };
    }
  } catch {
    /* noop */
  }
  return {
    connected: false,
    calendarId: 'primary',
    autoSync: true,
    status: 'idle',
    calendars: [],
  };
}

let gcalState: GoogleCalendarState = readStoredState();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function updateGcalState(patch: Partial<GoogleCalendarState>) {
  gcalState = { ...gcalState, ...patch };
  try {
    localStorage.setItem(STORAGE_KEY_STATE, JSON.stringify(gcalState));
  } catch {
    /* noop */
  }
  emit();
}

export function useGoogleCalendar<T = GoogleCalendarState>(
  selector: (s: GoogleCalendarState) => T = (s) => s as unknown as T,
): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => selector(gcalState),
  );
}

export const isGoogleCalendarConnected = () => gcalState.connected;
export const getGoogleCalendarState = () => gcalState;

function getStoredToken(): string | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TOKEN);
    if (!raw) return null;
    const token = JSON.parse(raw) as StoredToken;
    if (Date.now() >= token.expiresAt) {
      localStorage.removeItem(STORAGE_KEY_TOKEN);
      return null;
    }
    return token.accessToken;
  } catch {
    return null;
  }
}

function saveToken(accessToken: string, expiresIn: number) {
  const expiresAt = Date.now() + Math.max(300, expiresIn - 120) * 1000;
  localStorage.setItem(STORAGE_KEY_TOKEN, JSON.stringify({ accessToken, expiresAt }));
}

/* ------------------------------------------------------------------ */
/* Google Identity Services (GIS) Loader                              */
/* ------------------------------------------------------------------ */

let gisPromise: Promise<void> | null = null;

function loadGis(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve();
  if ((window as any).google?.accounts?.oauth2) return Promise.resolve();
  if (gisPromise) return gisPromise;

  gisPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src*="accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', () => reject(new Error('Falha ao carregar Google OAuth')));
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Não foi possível carregar a biblioteca do Google.'));
    document.head.appendChild(script);
  });

  return gisPromise;
}

/* ------------------------------------------------------------------ */
/* Conexão e Autenticação OAuth 2.0                                   */
/* ------------------------------------------------------------------ */

export async function connectGoogleCalendar(): Promise<boolean> {
  updateGcalState({ status: 'syncing', error: undefined });
  try {
    await loadGis();
    const google = (window as any).google;
    if (!google?.accounts?.oauth2) {
      throw new Error('Google Identity Services não está disponível.');
    }

    return new Promise((resolve) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: async (resp: { access_token?: string; error?: string; expires_in?: number }) => {
          if (resp.error || !resp.access_token) {
            updateGcalState({
              status: 'error',
              error: resp.error === 'access_denied' ? 'Acesso negado no Google.' : 'Não foi possível conectar.',
            });
            resolve(false);
            return;
          }

          saveToken(resp.access_token, resp.expires_in || 3600);

          // Obtém lista de calendários e perfil
          const calendars = await fetchCalendarList(resp.access_token);
          const email = await fetchUserEmail(resp.access_token, calendars);

          updateGcalState({
            connected: true,
            email,
            calendars,
            calendarId: gcalState.calendarId || 'primary',
            status: 'synced',
            error: undefined,
            lastSync: Date.now(),
          });

          toast('Google Agenda conectado com sucesso!');

          // Sincroniza tarefas com data existentes
          syncAllUpcomingTasks().catch(() => {});
          resolve(true);
        },
        error_callback: (err: unknown) => {
          console.warn('Erro na autorização do Google:', err);
          updateGcalState({ status: 'error', error: 'Erro ao abrir autorização do Google.' });
          resolve(false);
        },
      });

      client.requestAccessToken({ prompt: 'consent' });
    });
  } catch (err) {
    const msg = (err as Error)?.message || 'Erro ao conectar ao Google.';
    updateGcalState({ status: 'error', error: msg });
    return false;
  }
}

export function disconnectGoogleCalendar() {
  const token = getStoredToken();
  if (token && (window as any).google?.accounts?.oauth2?.revoke) {
    try {
      (window as any).google.accounts.oauth2.revoke(token);
    } catch {
      /* noop */
    }
  }
  localStorage.removeItem(STORAGE_KEY_TOKEN);
  updateGcalState({
    connected: false,
    email: undefined,
    status: 'idle',
    error: undefined,
    calendars: [],
  });
  toast('Google Agenda desconectado.');
}

export function setGoogleTargetCalendar(calendarId: string) {
  updateGcalState({ calendarId });
  toast('Calendário de destino atualizado.');
}

export function toggleGoogleAutoSync(autoSync: boolean) {
  updateGcalState({ autoSync });
  if (autoSync) syncAllUpcomingTasks().catch(() => {});
}

/* ------------------------------------------------------------------ */
/* Chamadas à Google Calendar API v3                                  */
/* ------------------------------------------------------------------ */

async function fetchCalendarList(token: string): Promise<GoogleCalendarItem[]> {
  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return [{ id: 'primary', summary: 'Principal', primary: true }];
    const data = await res.json();
    return (data.items || []).map((item: any) => ({
      id: item.id,
      summary: item.summary,
      primary: !!item.primary,
    }));
  } catch {
    return [{ id: 'primary', summary: 'Principal', primary: true }];
  }
}

async function fetchUserEmail(token: string, calendars: GoogleCalendarItem[]): Promise<string | undefined> {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.email) return data.email;
    }
  } catch {
    /* fallback */
  }
  const primary = calendars.find((c) => c.primary);
  return primary && primary.id.includes('@') ? primary.id : undefined;
}

async function getValidToken(): Promise<string | null> {
  const existing = getStoredToken();
  if (existing) return existing;
  if (!gcalState.connected) return null;

  // Token expirado: tenta renovar silenciosamente
  try {
    await loadGis();
    const google = (window as any).google;
    if (!google?.accounts?.oauth2) return null;

    return new Promise((resolve) => {
      const client = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (resp: any) => {
          if (resp.access_token) {
            saveToken(resp.access_token, resp.expires_in || 3600);
            updateGcalState({ error: undefined });
            resolve(resp.access_token);
          } else {
            updateGcalState({ status: 'error', error: 'Sessão do Google expirada. Conecte novamente.' });
            resolve(null);
          }
        },
      });
      client.requestAccessToken({ prompt: '' });
    });
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Formatação e Conversão de Tarefa → Evento Google                    */
/* ------------------------------------------------------------------ */

function recurrenceToRRule(r: Recurrence): string | undefined {
  const parts: string[] = [];
  const freq = r.freq === 'interval' ? 'DAILY' : r.freq.toUpperCase();
  parts.push(`FREQ=${freq}`);

  if (r.interval && r.interval > 1) {
    parts.push(`INTERVAL=${r.interval}`);
  }

  if (r.weekdays && r.weekdays.length > 0) {
    const daysMap = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
    const byDay = r.weekdays.map((d) => daysMap[d]).filter(Boolean).join(',');
    if (byDay) parts.push(`BYDAY=${byDay}`);
  }

  if (r.count) {
    parts.push(`COUNT=${r.count}`);
  } else if (r.until) {
    const clean = r.until.replace(/-/g, '');
    parts.push(`UNTIL=${clean}T235959Z`);
  }

  return `RRULE:${parts.join(';')}`;
}

function taskToGoogleEventPayload(task: Task, timeZone: string) {
  const isDone = task.status === 'done';
  const summary = isDone ? `✓ ${task.title}` : task.title;

  const notes = task.notes ? task.notes.trim() : '';
  const badges: string[] = [];
  if (task.kind === 'event') badges.push('Compromisso');
  if (task.priority === 'essential') badges.push('Prioridade: Essencial');
  if (task.priority === 'important') badges.push('Prioridade: Importante');
  const description = [notes, badges.join(' · ')].filter(Boolean).join('\n\n');

  const payload: any = {
    summary,
    description: description || undefined,
  };

  const date = task.date ?? task.recurrence?.anchor;
  if (!date) return null;

  if (task.time) {
    // Horário específico
    const startIso = `${date}T${task.time}:00`;
    const durMin = task.duration || 30;
    const [h, m] = task.time.split(':').map(Number);
    const endMinutes = h * 60 + m + durMin;
    const endH = Math.floor(endMinutes / 60) % 24;
    const endM = endMinutes % 60;
    const extraDays = Math.floor(endMinutes / (24 * 60));
    const endDate = extraDays > 0 ? addDays(date, extraDays) : date;
    const pad = (n: number) => String(n).padStart(2, '0');
    const endIso = `${endDate}T${pad(endH)}:${pad(endM)}:00`;

    payload.start = { dateTime: startIso, timeZone };
    payload.end = { dateTime: endIso, timeZone };
  } else {
    // Dia inteiro
    payload.start = { date };
    payload.end = { date: addDays(date, 1) }; // No Google Calendar, o fim de evento de dia inteiro é exclusivo
  }

  if (task.recurrence) {
    const rrule = recurrenceToRRule(task.recurrence);
    if (rrule) payload.recurrence = [rrule];
  }

  return payload;
}

/* ------------------------------------------------------------------ */
/* Operações de Sincronização                                         */
/* ------------------------------------------------------------------ */

export async function syncTaskToGoogle(task: Task): Promise<void> {
  if (!gcalState.connected || !gcalState.autoSync) return;
  const token = await getValidToken();
  if (!token) return;

  const calendarId = encodeURIComponent(gcalState.calendarId || 'primary');
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';

  // Se a tarefa não tem data nem recorrência, ou foi arquivada, remove do Google Calendar se já existia
  if ((!task.date && !task.recurrence) || task.status === 'archived') {
    if (task.googleEventId) {
      await deleteGoogleEvent(task.googleEventId);
      actions.update(task.id, { googleEventId: undefined });
    }
    return;
  }

  const payload = taskToGoogleEventPayload(task, timeZone);
  if (!payload) return;

  try {
    if (task.googleEventId) {
      // Atualiza evento existente
      const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${task.googleEventId}`;
      const res = await fetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 404) {
        // Evento foi excluído no Google: recria
        const createRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
        if (createRes.ok) {
          const created = await createRes.json();
          actions.update(task.id, { googleEventId: created.id });
        }
      }
    } else {
      // Cria novo evento
      const res = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        const created = await res.json();
        actions.update(task.id, { googleEventId: created.id });
      }
    }

    updateGcalState({ lastSync: Date.now(), error: undefined });
  } catch (err) {
    console.warn('Erro ao sincronizar com Google Agenda:', err);
  }
}

export async function deleteGoogleEvent(googleEventId: string): Promise<void> {
  if (!gcalState.connected) return;
  const token = await getValidToken();
  if (!token) return;

  const calendarId = encodeURIComponent(gcalState.calendarId || 'primary');
  try {
    await fetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${googleEventId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    /* noop */
  }
}

/** Sincroniza todas as tarefas ativas com data para o Google Agenda. */
export async function syncAllUpcomingTasks(): Promise<number> {
  if (!gcalState.connected) return 0;
  updateGcalState({ status: 'syncing' });

  const tasks = getState().tasks.filter((t) => (t.date || t.recurrence) && t.status !== 'archived');
  let count = 0;

  for (const t of tasks) {
    try {
      await syncTaskToGoogle(t);
      count++;
    } catch {
      /* continue */
    }
  }

  updateGcalState({ status: 'synced', lastSync: Date.now() });
  toast(`${count} ${count === 1 ? 'item sincronizado' : 'itens sincronizados'} com o Google Agenda`);
  return count;
}

/* ------------------------------------------------------------------ */
/* Observador de Alterações Automático no Store                        */
/* ------------------------------------------------------------------ */

function taskFingerprint(t: Task): string {
  return `${t.title}|${t.notes ?? ''}|${t.date ?? ''}|${t.time ?? ''}|${t.duration ?? ''}|${t.status}|${t.kind}|${JSON.stringify(t.recurrence ?? '')}`;
}

let syncTimeout: ReturnType<typeof setTimeout> | undefined;
const queuedTasks = new Set<string>();
const queuedDeletions = new Set<string>();

function processQueue() {
  if (!gcalState.connected || !gcalState.autoSync) {
    queuedTasks.clear();
    queuedDeletions.clear();
    return;
  }

  const tasksToSync = Array.from(queuedTasks);
  const eventsToDelete = Array.from(queuedDeletions);
  queuedTasks.clear();
  queuedDeletions.clear();

  (async () => {
    for (const eventId of eventsToDelete) {
      await deleteGoogleEvent(eventId);
    }
    const state = getState();
    for (const taskId of tasksToSync) {
      const task = state.tasks.find((t) => t.id === taskId);
      if (task) await syncTaskToGoogle(task);
    }
  })().catch(() => {});
}

export function initGoogleCalendarListener(): () => void {
  let prevTasks = new Map<string, Task>(getState().tasks.map((t) => [t.id, t]));

  const unsubscribe = subscribe(() => {
    if (!gcalState.connected || !gcalState.autoSync) return;
    const currentTasks = getState().tasks;
    const currentMap = new Map<string, Task>(currentTasks.map((t) => [t.id, t]));

    // Detecta tarefas criadas ou modificadas
    for (const task of currentTasks) {
      const prev = prevTasks.get(task.id);
      if (!prev) {
        if (task.date || task.recurrence) queuedTasks.add(task.id);
      } else {
        if (taskFingerprint(prev) !== taskFingerprint(task)) {
          queuedTasks.add(task.id);
        }
      }
    }

    // Detecta tarefas excluídas
    for (const [id, prev] of prevTasks.entries()) {
      if (!currentMap.has(id)) {
        if (prev.googleEventId) queuedDeletions.add(prev.googleEventId);
      }
    }

    prevTasks = currentMap;

    clearTimeout(syncTimeout);
    syncTimeout = setTimeout(processQueue, 700);
  });

  return () => {
    unsubscribe();
    clearTimeout(syncTimeout);
  };
}

