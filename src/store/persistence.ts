/**
 * Camada de persistência. Local-first: salva no aparelho imediatamente.
 * Uma implementação remota (sync entre dispositivos) pode seguir a mesma interface.
 */
import type { AppState } from '../domain/types';

export interface Repository {
  load(): AppState | undefined;
  save(state: AppState): void;
  clear(): void;
}

const KEY = 'leve.state.v1';

export const localRepository: Repository = {
  load() {
    try {
      const raw = localStorage.getItem(KEY);
      return raw ? (JSON.parse(raw) as AppState) : undefined;
    } catch {
      return undefined;
    }
  },
  save(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch {
      /* armazenamento indisponível: segue só em memória */
    }
  },
  clear() {
    try {
      localStorage.removeItem(KEY);
    } catch {
      /* noop */
    }
  },
};
