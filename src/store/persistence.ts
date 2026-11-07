/** Persistência local conservadora: nunca substitui um snapshot desconhecido. */
import { useSyncExternalStore } from 'react';
import type { AppState } from '../domain/types';
import { isObject, isTask, isProject, isMeta, isGoogleDeletions } from '../domain/validation';

export const STATE_KEY = 'leve.state.v1';
export type StorageIssue = 'recovery' | 'storage' | 'journal' | 'conflict' | undefined;
let issue: StorageIssue;
let original: string | null = null;
let expected: string | null | undefined;
const listeners = new Set<() => void>();
function report(next: StorageIssue) {
  if (issue === next) return;
  issue = next; listeners.forEach(fn => fn());
}
export const storageIssue = () => issue;
export const reportJournalFailure = () => report('journal');
export const journalSaved = () => { if (issue === 'journal') report(undefined); };
export const useStorageIssue = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, storageIssue);
export function reportStorageConflict(raw: string | null) {
  original = raw; report('conflict');
}
/** Exportação explícita; não inclui sessão nem credenciais. */
export function recoveryExport(current: AppState) {
  return JSON.stringify({ format: 'leve-recovery-v1', current, preservedSnapshot: original }, null, 2);
}

export const localRepository = {
  /** Arquivo inerte da outbox encerrada, separado por conta e sem tokens. */
  preserveRetiredGoogleDeletions(owner: string, entries: NonNullable<AppState['googleDeletions']>): boolean {
    if (!entries.length) return true;
    try {
      const key = `leve.gcal.retired-outbox.v1.${encodeURIComponent(owner)}`;
      const raw = localStorage.getItem(key);
      const previous = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(previous) || !isGoogleDeletions(previous)) { report('recovery'); return false; }
      const unique = new Map([...previous, ...entries].map(entry => [JSON.stringify([entry.calendarId, entry.eventId]), entry]));
      localStorage.setItem(key, JSON.stringify([...unique.values()]));
      return true;
    } catch { report('storage'); return false; }
  },
  retiredGoogleDeletions(owner: string): NonNullable<AppState['googleDeletions']> {
    try {
      const raw = localStorage.getItem(`leve.gcal.retired-outbox.v1.${encodeURIComponent(owner)}`);
      const entries = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(entries) || !isGoogleDeletions(entries)) { report('recovery'); return []; }
      return entries;
    } catch { report('storage'); return []; }
  },
  load(): AppState | undefined {
    try {
      const primary = localStorage.getItem(STATE_KEY);
      const legacyRecovery = localStorage.getItem('leve.recovery.v1');
      if (legacyRecovery) { original = legacyRecovery; report('recovery'); }
      const raw = primary;
      expected = primary;
      if (!raw) return undefined;
      const state: unknown = JSON.parse(raw);
      if (isObject(state) && state.version === 1 && Array.isArray(state.tasks) && Array.isArray(state.projects)) {
        if (state.tasks.every(isTask) && state.projects.every(isProject) && isMeta(state) && isGoogleDeletions(state.googleDeletions)) return state as unknown as AppState;
        original = raw; report('recovery');
        return { version: 1, tasks: state.tasks.filter(isTask), projects: state.projects.filter(isProject),
          ...(isMeta(state) ? { settings: state.settings, dismissed: state.dismissed ?? {}, focus: state.focus } : { settings: {}, dismissed: {} }),
        } as AppState;
      }
      original = raw; report('recovery');
    } catch {
      try { original = localStorage.getItem(STATE_KEY); } catch { /* bloqueado */ }
      report(original ? 'recovery' : 'storage');
    }
    return undefined;
  },
  save(state: AppState): boolean {
    if (issue === 'recovery' || issue === 'conflict') return false;
    try {
      const raw = localStorage.getItem(STATE_KEY);
      if (expected !== undefined && raw !== expected) { reportStorageConflict(raw); return false; }
      const next = JSON.stringify(state);
      if (next !== raw) localStorage.setItem(STATE_KEY, next);
      expected = next;
      if (issue !== 'journal') report(undefined);
      return true;
    } catch { report('storage'); return false; }
  },
  clear() {
    try {
      localStorage.removeItem(STATE_KEY);
      // Cópias de recuperação de versões anteriores não são apagadas automaticamente.
      expected = null; original = null; report(undefined);
      return true;
    } catch { report('storage'); return false; }
  },
};
