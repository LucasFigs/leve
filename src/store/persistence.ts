/** Persistência local conservadora: nunca substitui um snapshot desconhecido. */
import { useSyncExternalStore } from 'react';
import type { AppState } from '../domain/types';
import { isObject, isTask, isProject, isMeta } from '../domain/validation';

export const STATE_KEY = 'leve.state.v1';
export type StorageIssue = 'recovery' | 'storage' | 'conflict' | undefined;
let issue: StorageIssue;
let original: string | null = null;
let expected: string | null | undefined;
const listeners = new Set<() => void>();
function report(next: StorageIssue) {
  if (issue === next) return;
  issue = next; listeners.forEach(fn => fn());
}
export const storageIssue = () => issue;
export const useStorageIssue = () => useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, storageIssue);
export function reportStorageConflict(raw: string | null) {
  original = raw; report('conflict');
}
/** Exportação explícita; não inclui sessão nem credenciais. */
export function recoveryExport(current: AppState) {
  return JSON.stringify({ format: 'leve-recovery-v1', current, preservedSnapshot: original }, null, 2);
}

export const localRepository = {
  load(): AppState | undefined {
    try {
      const raw = localStorage.getItem(STATE_KEY);
      expected = raw;
      if (!raw) return undefined;
      const state: unknown = JSON.parse(raw);
      if (isObject(state) && state.version === 1 && Array.isArray(state.tasks) && Array.isArray(state.projects)) {
        if (state.tasks.every(isTask) && state.projects.every(isProject) && isMeta(state)) return state as unknown as AppState;
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
      localStorage.setItem(STATE_KEY, next);
      expected = next;
      report(undefined);
      return true;
    } catch { report('storage'); return false; }
  },
  clear() {
    try {
      localStorage.removeItem(STATE_KEY);
      // Cópias de recuperação de versões anteriores não são apagadas automaticamente.
      expected = null; original = null; report(undefined);
    } catch { report('storage'); }
  },
};
