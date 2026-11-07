/** Google Agenda descontinuado: somente consulta e desconexão de vínculos antigos. */
import { useSyncExternalStore } from 'react';
import type { Recurrence, Task } from '../domain/types';
import { addDays } from '../domain/dates';
import { calendarBackend } from './googleCalendarBackend';
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
    needsRevocation?: boolean;
    calendars: GoogleCalendarItem[];
}
const initial = (): GoogleCalendarState => ({ connected: false, calendarId: 'primary', autoSync: false, status: 'idle', calendars: [] });
let state = initial(), version = 0, requests = new AbortController(), pending: Promise<void> | undefined;
const listeners = new Set<() => void>();
const update = (patch: Partial<GoogleCalendarState>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
function clearLegacyAuthorization() { for (const key of ['leve.gcal.token.v1', 'leve.gcal.state.v1', 'leve.gcal.pending.v1'])
    try {
        localStorage.removeItem(key);
    }
    catch { /* offline/storage bloqueado */ } }
clearLegacyAuthorization();
export function useGoogleCalendar<T = GoogleCalendarState>(select: (s: GoogleCalendarState) => T = s => s as unknown as T) { return useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => select(state)); }
export const getGoogleCalendarState = () => state;
export const isGoogleCalendarConnected = () => state.connected;
export function resetGoogleCalendarSession() { version++; requests.abort(); requests = new AbortController(); pending = undefined; clearLegacyAuthorization(); state = initial(); listeners.forEach(fn => fn()); }
/** Compatibilidade com chamadores antigos: consulta autenticada, sem token, calendário ou store. */
export function restoreGoogleCalendarConnection(): Promise<void> {
    if (pending)
        return pending;
    const current = version;
    pending = (async () => {
        try {
            const result = await calendarBackend('status', {}, requests.signal);
            if (current !== version)
                return;
            update({ connected: !!result.connected, email: result.connected ? result.email : undefined, autoSync: false, status: state.needsRevocation ? 'error' : 'idle', error: state.needsRevocation ? state.error : undefined });
        }
        catch {
            if (current === version)
                update({ status: 'error', error: 'Não foi possível consultar o vínculo antigo. Tente novamente quando estiver online ou gerencie o acesso na sua Conta Google.' });
        }
        finally {
            if (current === version)
                pending = undefined;
        }
    })();
    return pending;
}
export async function disconnectGoogleCalendar(): Promise<boolean> {
    const current = version;
    update({ status: 'syncing', error: undefined });
    try {
        const result = await calendarBackend('disconnect', {}, requests.signal);
        if (current !== version)
            return false;
        if (result.disconnected !== true) {
            update({ status: 'error', error: 'Não foi possível confirmar a desconexão. Gerencie o acesso na sua Conta Google.' });
            return false;
        }
        if (result.revoked !== true || result.retired !== true) {
            resetGoogleCalendarSession();
            update({ needsRevocation: true, status: 'error', error: 'Vínculo removido do Leve, mas não foi possível confirmar a revogação. Retire o acesso nas configurações da sua Conta Google.' });
            return false;
        }
        resetGoogleCalendarSession();
        return true;
    }
    catch {
        if (current === version)
            update({ status: 'error', error: 'Não foi possível confirmar a desconexão. O acesso pode continuar autorizado. Tente novamente ou retire o acesso na sua Conta Google.' });
        return false;
    }
}
// Entradas legadas são inertes; não autorizam OAuth nem consomem filas.
export async function connectGoogleCalendar(): Promise<boolean> { return false; }
export function setGoogleTargetCalendar(_calendarId: string) { }
export function toggleGoogleAutoSync(_autoSync: boolean) { }
export async function syncTaskToGoogle(_task: Task, _token?: string): Promise<boolean> { return false; }
export async function deleteGoogleEvent(_eventId: string, _token?: string, _destination?: string): Promise<boolean> { return false; }
export async function syncAllUpcomingTasks(_interactive = false, _quiet = false): Promise<number> { return 0; }
export function initGoogleCalendarListener(): () => void { return () => { }; }
/** Conversores puros preservados para compatibilidade e eventual avaliação futura. Não enviam eventos. */
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
        if (byDay)
            parts.push(`BYDAY=${byDay}`);
    }
    if (r.count) {
        parts.push(`COUNT=${r.count}`);
    }
    else if (r.until) {
        const clean = r.until.replace(/-/g, '');
        parts.push(`UNTIL=${clean}T235959Z`);
    }
    return `RRULE:${parts.join(';')}`;
}
/**
 * Converte data e hora para formato RFC 3339 completo com fuso horário local.
 * Exemplo: 2026-10-17T14:30:00-03:00
 */
export function toRfc3339(dateStr: string, timeStr: string, durMin: number = 30): {
    start: string;
    end: string;
} {
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
        return (`${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T` +
            `${pad(dt.getHours())}:${pad(dt.getMinutes())}:00${sign}${offH}:${offM}`);
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
    if (task.kind === 'event')
        badges.push('Compromisso');
    if (task.priority === 'essential')
        badges.push('Prioridade: Essencial');
    if (task.priority === 'important')
        badges.push('Prioridade: Importante');
    const description = [notes, badges.join(' · ')].filter(Boolean).join('\n\n');
    const payload: any = {
        summary,
        description: description || undefined,
    };
    const date = task.date ?? task.recurrence?.anchor;
    if (!date)
        return null;
    if (task.time) {
        // Horário específico com RFC 3339 completo (inclui fuso horário explícito)
        const { start, end } = toRfc3339(date, task.time, task.duration || 30);
        payload.start = { dateTime: start, timeZone };
        payload.end = { dateTime: end, timeZone };
    }
    else {
        // Dia inteiro: no Google Calendar, o fim de evento de dia inteiro é exclusivo (dia seguinte)
        payload.start = { date };
        payload.end = { date: addDays(date, 1) };
    }
    if (task.recurrence) {
        const rrule = recurrenceToRRule(task.recurrence);
        if (rrule) {
            payload.recurrence = [rrule];
            if (task.skipDates?.length) {
                const dates = [...new Set(task.skipDates)].sort().map(d => d.replace(/-/g, ''));
                payload.recurrence.push(task.time
                    ? `EXDATE;TZID=${timeZone}:${dates.map(d => `${d}T${task.time!.replace(':', '')}00`).join(',')}`
                    : `EXDATE;VALUE=DATE:${dates.join(',')}`);
            }
        }
    }
    return payload;
}
