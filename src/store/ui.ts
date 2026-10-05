/** Estado efêmero de interface (não persistido). */
import { useSyncExternalStore } from 'react';
import type { CaptureDefaults } from './store';

export type Tab = 'today' | 'agenda' | 'inbox' | 'projects' | 'profile';
export type AgendaView = 'day' | 'week' | 'month';

export type Sheet =
  | { type: 'quickAdd'; defaults?: CaptureDefaults }
  | { type: 'task'; id: string; date?: string }
  | { type: 'plan'; date: string }
  | { type: 'review' }
  | { type: 'week' }
  | { type: 'replan'; id: string; date: string }
  | { type: 'breakdown'; id: string; thenFocus?: boolean }
  | { type: 'project'; id?: string }
  | { type: 'search' }
  | { type: 'account' };

export interface Toast {
  id: number;
  message: string;
  action?: { label: string; run: () => void };
}

export interface UIState {
  tab: Tab;
  sheet?: Sheet;
  /** pilha para abrir uma folha a partir de outra */
  sheetStack: Sheet[];
  openProjectId?: string;
  agendaView: AgendaView;
  agendaDate?: string;
  toasts: Toast[];
}

let ui: UIState = { tab: 'today', sheetStack: [], agendaView: 'day', toasts: [] };
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setUI(patch: Partial<UIState> | ((u: UIState) => Partial<UIState>)) {
  ui = { ...ui, ...(typeof patch === 'function' ? patch(ui) : patch) };
  emit();
}

export function useUI<T>(selector: (u: UIState) => T): T {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => selector(ui),
  );
}

export const getUI = () => ui;

export function openSheet(sheet: Sheet, opts: { stack?: boolean } = {}) {
  setUI((u) => ({ sheet, sheetStack: opts.stack && u.sheet ? [...u.sheetStack, u.sheet] : [] }));
}

export function closeSheet() {
  setUI((u) => {
    const stack = [...u.sheetStack];
    const prev = stack.pop();
    return { sheet: prev, sheetStack: stack };
  });
}

export function goTo(tab: Tab) {
  setUI({ tab, sheet: undefined, sheetStack: [], openProjectId: tab === 'projects' ? undefined : ui.openProjectId });
  if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
}

let toastSeq = 0;
export function toast(message: string, action?: Toast['action']) {
  const t: Toast = { id: ++toastSeq, message, action };
  setUI((u) => ({ toasts: [...u.toasts.slice(-1), t] }));
  setTimeout(() => dismissToast(t.id), action ? 5000 : 3200);
}

export function dismissToast(id: number) {
  setUI((u) => ({ toasts: u.toasts.filter((t) => t.id !== id) }));
}
