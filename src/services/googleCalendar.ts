/**
 * Integração com Google Agenda (Google Calendar API).
 *
 * Sincroniza tarefas e compromissos com data/horário criados e editados no Leve
 * diretamente na conta do Google Agenda do usuário.
 */
import { useSyncExternalStore } from 'react';
import type { Recurrence, Task } from '../domain/types';
import { addDays } from '../domain/dates';
import { actions, getState, subscribe, isReplacingState } from '../store/store';
import { toast } from '../store/ui';

import { calendarBackend } from './googleCalendarBackend';

const STORAGE_KEY_STATE = 'leve.gcal.state.v1';
const STORAGE_KEY_TOKEN = 'leve.gcal.token.v1';
const OAUTH_PENDING_KEY = 'leve.gcal.pending.v1';

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

// Nunca restaurar uma autorização de outra sessão/conta do navegador.
let gcalState: GoogleCalendarState = { connected: false, calendarId: 'primary', autoSync: true, status: 'idle', calendars: [] };
try { localStorage.removeItem(STORAGE_KEY_TOKEN); localStorage.removeItem(STORAGE_KEY_STATE); } catch { /* storage indisponível */ }
let memoryToken: StoredToken | undefined;
let sessionVersion = 0;
let requests = new AbortController();

async function googleFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const version = sessionVersion;
  const response = await fetch(url, { ...init, signal: requests.signal });
  if (version !== sessionVersion) throw new Error('Sessão do Google encerrada.');
  return response;
}
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

function updateGcalState(patch: Partial<GoogleCalendarState>) {
  gcalState = { ...gcalState, ...patch };
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
  return memoryToken && Date.now() < memoryToken.expiresAt ? memoryToken.accessToken : null;
}

function saveToken(accessToken: string, expiresIn: number) {
  // Margem segura de 30 segundos antes da expiração de 3600s (~1 hora)
  const safeMarginSec = Math.min(30, Math.max(5, Math.floor(expiresIn * 0.05)));
  const expiresAt = Date.now() + Math.max(1, expiresIn - safeMarginSec) * 1000;
  memoryToken = { accessToken, expiresAt };
}

let tokenRefreshPromise: Promise<string | null> | null = null;
let lastSilentAuthFailure = 0;
const SILENT_AUTH_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutos de espera após falha silenciosa

/** Inicia autorização por redirecionamento, compatível com PWA sem depender de popups. */
export async function connectGoogleCalendar(): Promise<boolean> {
  const version = sessionVersion;
  updateGcalState({ status: 'syncing', error: undefined });
  try {
    const result = await calendarBackend('begin', {}, requests.signal);
    if (version !== sessionVersion) return false;
    if (!result.url || !result.proof || !result.state || new URL(result.url).origin !== 'https://accounts.google.com') throw new Error('Resposta de autorização inválida.');
    // Prova de origem de uso único, por dez minutos; não é um token de acesso/renovação.
    // Precisa sobreviver ao redirecionamento e à volta ao PWA.
    localStorage.setItem(OAUTH_PENDING_KEY, JSON.stringify({ proof: result.proof, state: result.state, expires: Date.now() + 600000 }));
    window.location.assign(result.url);
    return true;
  } catch (err) {
    if (version === sessionVersion) updateGcalState({ status: 'error', error: (err as Error).message });
    return false;
  }
}

/** Logout limpa memória; somente Desconectar remove e revoga o vínculo no servidor. */
export async function disconnectGoogleCalendar(): Promise<boolean> {
  const version = sessionVersion;
  updateGcalState({ status: 'syncing', error: undefined });
  try {
    const result = await calendarBackend('disconnect', {}, requests.signal);
    if (version !== sessionVersion) return false;
    resetGoogleCalendarSession();
    toast(result.revoked === false ? 'Vínculo removido do Leve. Confira também as permissões na sua Conta Google.' : 'Google Agenda desconectado.');
    return true;
  } catch (err) {
    if (version === sessionVersion) updateGcalState({ status: 'error', error: (err as Error).message });
    return false;
  }
}

/** Antes de logout ou troca de conta: cancela operações sem excluir eventos remotos. */
export function resetGoogleCalendarSession() {
  sessionVersion++;
  requests.abort();
  requests = new AbortController();
  memoryToken = undefined;
  tokenRefreshPromise = null;
  restorePromise = null;
  clearTimeout(syncTimeout);
  queuedTasks.clear();
  queuedDeletions.clear();
  lastSilentAuthFailure = 0;
  try { localStorage.removeItem(STORAGE_KEY_TOKEN); localStorage.removeItem(STORAGE_KEY_STATE); } catch { /* noop */ }
  updateGcalState({ connected: false, calendarId: 'primary', autoSync: true, email: undefined, calendars: [], status: 'idle', error: undefined, lastSync: undefined });
}

async function preferences(patch: { calendarId?: string; autoSync?: boolean }) {
  const version = sessionVersion;
  try {
    const result = await calendarBackend('preferences', patch, requests.signal);
    if (version !== sessionVersion) return;
    if (result.connected === false) throw new Error('Conecte novamente o Google Agenda.');
    updateGcalState(patch);
    if (patch.autoSync) void syncAllUpcomingTasks().catch(() => {});
  } catch (err) {
    if (version === sessionVersion) updateGcalState({ status: 'error', error: (err as Error).message });
  }
}
export function setGoogleTargetCalendar(calendarId: string) { void preferences({ calendarId }); }
export function toggleGoogleAutoSync(autoSync: boolean) { void preferences({ autoSync }); }

let restorePromise: Promise<void> | null = null;
export function restoreGoogleCalendarConnection(): Promise<void> {
  if (restorePromise) return restorePromise;
  const version = sessionVersion;
  restorePromise = (async () => {
    try {
      const location = window.location;
      const savedAttempt = localStorage.getItem(OAUTH_PENDING_KEY);
      if (savedAttempt) {
        try { if (JSON.parse(savedAttempt).expires < Date.now()) localStorage.removeItem(OAUTH_PENDING_KEY); }
        catch { localStorage.removeItem(OAUTH_PENDING_KEY); }
      }
      const callback = new URLSearchParams(location?.hash?.slice(1));
      if (callback.has('gcal_code')) {
        window.history.replaceState(null, '', location.pathname + location.search);
        const stored = localStorage.getItem(OAUTH_PENDING_KEY);
        localStorage.removeItem(OAUTH_PENDING_KEY);
        const pending = stored ? JSON.parse(stored) : null;
        if (!pending || pending.expires < Date.now() || pending.state !== callback.get('gcal_state')) throw new Error('Volte ao app onde iniciou a conexão e tente conectar novamente.');
        await calendarBackend('complete', { code: callback.get('gcal_code'), state: pending.state, proof: pending.proof }, requests.signal);
        if (version !== sessionVersion) return;
        toast('Google Agenda conectado. O vínculo será mantido ao reabrir o app.');
      }
      if (location?.search && new URLSearchParams(location.search).has('gcal')) {
        const params = new URLSearchParams(location.search);
        const result = params.get('gcal'); params.delete('gcal');
        window.history.replaceState(null, '', location.pathname + (params.size ? `?${params}` : '') + location.hash);
        if (result === 'error') throw new Error('A conexão com o Google não foi concluída. Tente novamente.');
      }
      const connection = await calendarBackend('status', {}, requests.signal);
      if (version !== sessionVersion) return;
      if (!connection.connected) { if (gcalState.connected) resetGoogleCalendarSession(); return; }
      const restoredNow = !gcalState.connected;
      updateGcalState({ connected: true, email: connection.email, calendarId: connection.calendarId || 'primary', autoSync: connection.autoSync ?? true });
      const token = await getValidToken();
      if (!token || version !== sessionVersion) return;
      const calendars = await fetchCalendarList(token);
      if (version !== sessionVersion) return;
      updateGcalState({ calendars });
      if (restoredNow && gcalState.autoSync && getState().settings.onboarded) await syncAllUpcomingTasks(false, true);
    } catch (err) {
      if (version === sessionVersion) updateGcalState({ status: 'error', error: (err as Error).message });
    } finally {
      if (version === sessionVersion) restorePromise = null;
    }
  })();
  return restorePromise;
}

async function fetchCalendarList(token: string): Promise<GoogleCalendarItem[]> {
  const version = sessionVersion;
  try {
    const res = await googleFetch('https://www.googleapis.com/calendar/v3/users/me/calendarList', { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) throw new Error('Não foi possível listar os calendários do Google.');
    const data = await res.json();
    if (version !== sessionVersion) return [];
    return (data.items || []).map((item: { id: string; summary: string; primary?: boolean }) => ({ id: item.id, summary: item.summary, primary: !!item.primary }));
  } catch (err) {
    if (version === sessionVersion) updateGcalState({ status: 'error', error: (err as Error).message });
    return [{ id: 'primary', summary: 'Principal', primary: true }];
  }
}

async function getValidToken(interactive = false): Promise<string | null> {
  const existing = getStoredToken();
  if (existing) return existing;
  if (!gcalState.connected) return null;
  if (!interactive && lastSilentAuthFailure && Date.now() - lastSilentAuthFailure < SILENT_AUTH_COOLDOWN_MS) return null;
  if (tokenRefreshPromise) return tokenRefreshPromise;
  const version = sessionVersion;
  tokenRefreshPromise = (async () => {
    try {
      const result = await calendarBackend('token', {}, requests.signal);
      if (version !== sessionVersion) return null;
      if (!result.connected || !result.accessToken || !result.expiresIn) throw new Error('Conecte novamente o Google Agenda.');
      saveToken(result.accessToken, result.expiresIn);
      lastSilentAuthFailure = 0;
      updateGcalState({ status: 'idle', error: undefined });
      return result.accessToken;
    } catch (err) {
      if (version === sessionVersion) {
        lastSilentAuthFailure = Date.now();
        updateGcalState({ status: 'error', error: (err as Error).message, ...((err as { status?: number }).status === 409 ? { connected: false } : {}) });
      }
      return null;
    } finally {
      if (version === sessionVersion) tokenRefreshPromise = null;
    }
  })();
  return tokenRefreshPromise;
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

/**
 * Converte data e hora para formato RFC 3339 completo com fuso horário local.
 * Exemplo: 2026-10-17T14:30:00-03:00
 */
export function toRfc3339(dateStr: string, timeStr: string, durMin: number = 30): { start: string; end: string } {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [rawH, rawM] = (timeStr || '09:00').split(':').map(Number);
  const h = isNaN(rawH) ? 0 : Math.max(0, Math.min(23, rawH));
  const min = isNaN(rawM) ? 0 : Math.max(0, Math.min(59, rawM));

  const startDate = new Date(y, m - 1, d, h, min, 0);
  const duration = Math.max(5, durMin || 30);
  const endDate = new Date(startDate.getTime() + duration * 60 * 1000);

  const formatWithOffset = (dt: Date): string => {
    const offsetMin = -dt.getTimezoneOffset();
    const sign = offsetMin >= 0 ? '+' : '-';
    const absOffset = Math.abs(offsetMin);
    const offH = String(Math.floor(absOffset / 60)).padStart(2, '0');
    const offM = String(absOffset % 60).padStart(2, '0');
    const pad = (n: number) => String(n).padStart(2, '0');

    return (
      `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T` +
      `${pad(dt.getHours())}:${pad(dt.getMinutes())}:00${sign}${offH}:${offM}`
    );
  };

  return {
    start: formatWithOffset(startDate),
    end: formatWithOffset(endDate),
  };
}

export function taskToGoogleEventPayload(task: Task, timeZone: string) {
  // Uma série recorrente mestre no Google Agenda não deve ter '✓' geral no título
  const isDone = !task.recurrence && task.status === 'done';
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
    // Horário específico com RFC 3339 completo (inclui fuso horário explícito)
    const { start, end } = toRfc3339(date, task.time, task.duration || 30);
    payload.start = { dateTime: start, timeZone };
    payload.end = { dateTime: end, timeZone };
  } else {
    // Dia inteiro: no Google Calendar, o fim de evento de dia inteiro é exclusivo (dia seguinte)
    payload.start = { date };
    payload.end = { date: addDays(date, 1) };
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

export async function syncTaskToGoogle(task: Task, existingToken?: string): Promise<boolean> {
  const version = sessionVersion;
  if (!gcalState.connected) return false;
  const token = existingToken || (await getValidToken(false));
  if (!token || version !== sessionVersion || !gcalState.connected) {
    return false;
  }

  const calendarId = encodeURIComponent(gcalState.calendarId || 'primary');
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';

  // Se a tarefa não tem data nem recorrência, ou foi arquivada, remove do Google Calendar se já existia
  if ((!task.date && !task.recurrence) || task.status === 'archived') {
    if (task.googleEventId) {
      await deleteGoogleEvent(task.googleEventId, token);
      if (version === sessionVersion) actions.update(task.id, { googleEventId: undefined });
    }
    return true;
  }

  const payload = taskToGoogleEventPayload(task, timeZone);
  if (!payload) return false;

  try {
    let res: Response;

    if (task.googleEventId) {
      // Atualiza evento existente
      const url = `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(task.googleEventId)}`;
      res = await googleFetch(url, {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 404) {
        // Evento foi excluído no Google: recria
        res = await googleFetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });
      }
    } else {
      // Cria novo evento
      res = await googleFetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });
    }

    if (!res.ok) {
      let errorMsg = `Erro ${res.status}`;
      try {
        const errJson = await res.json();
        if (errJson?.error?.message) {
          errorMsg = errJson.error.message;
        }
      } catch {
        /* fallback */
      }

      if (version !== sessionVersion) return false;

      console.error('[Google Calendar API Error]', res.status);

      if (res.status === 401) {
        memoryToken = undefined;
        updateGcalState({ status: 'error', error: 'Sessão do Google expirada. Clique em Sincronizar para reconectar.' });
      } else if (res.status === 403) {
        const isApiDisabled = errorMsg.toLowerCase().includes('has not been used') || errorMsg.toLowerCase().includes('disabled');
        const msg = isApiDisabled
          ? 'Google Calendar API desativada. Ative-a no Google Cloud Console.'
          : `Permissão negada no Google Agenda: ${errorMsg}`;
        updateGcalState({ status: 'error', error: msg });
      } else {
        updateGcalState({ status: 'error', error: `Falha ao salvar no Google Agenda (${res.status}): ${errorMsg}` });
      }

      return false;
    }

    const created = await res.json();
    if (version !== sessionVersion) return false;
    if (created?.id && created.id !== task.googleEventId) {
      actions.update(task.id, { googleEventId: created.id });
    }

    updateGcalState({ lastSync: Date.now(), error: undefined, status: 'synced' });
    return true;
  } catch (err) {
    if (version !== sessionVersion) return false;
    const msg = (err as Error)?.message || 'Erro ao sincronizar com Google Agenda.';
    console.error('[Google Calendar Network Error]', err);
    updateGcalState({ status: 'error', error: msg });
    return false;
  }
}

export async function deleteGoogleEvent(googleEventId: string, existingToken?: string): Promise<void> {
  const version = sessionVersion;
  if (!gcalState.connected) return;
  const token = existingToken || (await getValidToken(false));
  if (!token || version !== sessionVersion || !gcalState.connected) return;

  const calendarId = encodeURIComponent(gcalState.calendarId || 'primary');
  try {
    await googleFetch(`https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(googleEventId)}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    /* noop */
  }
}

/** Sincroniza todas as tarefas ativas com data para o Google Agenda. */
export async function syncAllUpcomingTasks(interactive = false, quiet = false): Promise<number> {
  const version = sessionVersion;
  if (!gcalState.connected) return 0;
  updateGcalState({ status: 'syncing', error: undefined });

  const token = await getValidToken(interactive);
  if (version !== sessionVersion) return 0;
  if (!token) {
    updateGcalState({
      status: 'error',
      error: gcalState.error || 'Não foi possível renovar a conexão. Tente sincronizar novamente.',
    });
    return 0;
  }

  const tasks = getState().tasks.filter((t) => (t.date || t.recurrence) && t.status !== 'archived');
  let count = 0;
  let hasErrors = false;

  for (const t of tasks) {
    if (version !== sessionVersion) return count;
    try {
      const ok = await syncTaskToGoogle(t, token);
      if (ok) {
        count++;
      } else {
        hasErrors = true;
      }
    } catch {
      hasErrors = true;
    }
  }

  if (version !== sessionVersion) return count;
  if (hasErrors) {
    updateGcalState({ status: 'error' });
    if (!quiet) toast(gcalState.error || 'Alguns itens não foram sincronizados. Tente novamente.');
  } else {
    updateGcalState({ status: 'synced', lastSync: Date.now() });
    if (!quiet && tasks.length === 0) {
      toast('Nenhuma tarefa com data para sincronizar.');
    } else if (!quiet) {
      toast(`${count} ${count === 1 ? 'item sincronizado' : 'itens sincronizados'} com o Google Agenda`);
    }
  }

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
  const version = sessionVersion;
  if (!gcalState.connected || !gcalState.autoSync) {
    queuedTasks.clear();
    queuedDeletions.clear();
    return;
  }

  // Se já sabemos que a sessão falhou recentemente, não fica bombardeando em background
  if (gcalState.status === 'error' && Date.now() - lastSilentAuthFailure < SILENT_AUTH_COOLDOWN_MS) {
    return;
  }

  const tasksToSync = Array.from(queuedTasks);
  const eventsToDelete = Array.from(queuedDeletions);
  queuedTasks.clear();
  queuedDeletions.clear();

  (async () => {
    // Valida o token uma única vez para toda a fila em segundo plano (não interativo)
    const token = await getValidToken(false);
    if (!token || version !== sessionVersion) return;

    for (const eventId of eventsToDelete) {
      if (version !== sessionVersion) return;
      await deleteGoogleEvent(eventId, token);
    }
    const state = getState();
    for (const taskId of tasksToSync) {
      if (version !== sessionVersion) return;
      const task = state.tasks.find((t) => t.id === taskId);
      if (task) await syncTaskToGoogle(task, token);
    }
  })().catch(() => {});
}

export function initGoogleCalendarListener(): () => void {
  let prevTasks = new Map<string, Task>(getState().tasks.map((t) => [t.id, t]));

  const unsubscribe = subscribe(() => {
    if (isReplacingState() || !gcalState.connected || !gcalState.autoSync) {
      prevTasks = new Map(getState().tasks.map((t) => [t.id, t]));
      return;
    }
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

