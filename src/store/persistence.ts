/**
 * Camada de persistência. Local-first: salva no aparelho imediatamente.
 * Uma implementação remota (sync entre dispositivos) pode seguir a mesma interface.
 */
import type { AppState } from '../domain/types';
import { isObject, isTask, isProject, isMeta } from '../domain/validation';

export interface Repository {
  load(): AppState | undefined;
  save(state: AppState): void;
  clear(): void;
}

const KEY = 'leve.state.v1';
let preserveInvalidData = false;

export const localRepository: Repository = {
  load() {
    let raw: string | null = null;
    try {
      raw = localStorage.getItem(KEY);
      if (!raw) return undefined;
      const state: unknown = JSON.parse(raw);
      if (isObject(state) && state.version === 1 && Array.isArray(state.tasks) && state.tasks.every(isTask) &&
        Array.isArray(state.projects) && state.projects.every(isProject) && isMeta(state)) return state as unknown as AppState;
      // Preserva o original para recuperação, sem entregar estruturas inválidas à UI.
      preserveInvalidData = true;
      localStorage.setItem('leve.recovery.v1', raw);
      preserveInvalidData = false;
      return undefined;
    } catch {
      if (raw) {
        preserveInvalidData = true;
        try { localStorage.setItem('leve.recovery.v1', raw); preserveInvalidData = false; } catch { /* preserva original se armazenamento estiver cheio */ }
      }
      return undefined;
    }
  },
  save(state) {
    if (preserveInvalidData) return;
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* armazenamento indisponível: segue só em memória */
    }
  },
  clear() {
    preserveInvalidData = false;
    try {
      localStorage.removeItem(KEY);
      localStorage.removeItem('leve.recovery.v1');
    } catch {
      /* noop */
    }
  },
};
