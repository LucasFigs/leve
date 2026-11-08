/** Estado efêmero de interface (não persistido). */
import { useSyncExternalStore } from 'react';
import type { Task } from '../domain/types';
import type { CaptureDefaults } from './store';

export type Tab = 'today' | 'agenda' | 'habits' | 'inbox' | 'tasks' | 'projects' | 'profile';
export type AgendaView = 'day' | 'week' | 'month';

export type Sheet =
  | { type: 'quickAdd'; defaults?: CaptureDefaults }
  | { type: 'task'; id: string; date?: string; mode?: 'edit' }
  /** tarefa nova, ainda não salva (capturar e já detalhar) */
  | { type: 'newTask'; task: Task }
  | { type: 'eventMissed'; id: string; date: string }
  | { type: 'plan'; date: string }
  | { type: 'review' }
  | { type: 'week' }
  | { type: 'replan'; id: string; date: string }
  | { type: 'breakdown'; id: string; thenFocus?: boolean }
  | { type: 'habitCalendar'; id: string }
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
  /** dia aberto no accordion da visão semana (exclusivo — só um por vez) */
  agendaOpenDay?: string | null;
  agendaProfileRestore?: boolean;
  toasts: Toast[];
  /** Retorno contextual da foto de perfil; não é persistido. */
  profileReturn?: {tab:Tab;openProjectId?:string;agendaDate?:string;agendaView:AgendaView;agendaOpenDay?:string|null;scrollY:number;agendaScrollTop:number};
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

/** Fecha tudo, inclusive a folha de onde esta foi aberta (ex.: reagendou a tarefa — pronto). */
export function closeAllSheets() {
  setUI({ sheet: undefined, sheetStack: [] });
}

export function goTo(tab: Tab) {
  setUI({
    tab,
    profileReturn: tab === 'profile' ? ui.profileReturn : undefined,
    agendaProfileRestore: false,
    sheet: undefined,
    sheetStack: [],
    openProjectId: tab === 'projects' ? undefined : ui.openProjectId,
    // A agenda sempre abre no dia/semana/mês atual
    agendaDate: tab === 'agenda' ? undefined : ui.agendaDate,
  });
  if (typeof window !== 'undefined') window.scrollTo({ top: 0 });
}

export function openProfile() {
  if (ui.tab === 'profile') return;
  const profileReturn = {tab:ui.tab,openProjectId:ui.openProjectId,agendaDate:ui.agendaDate,agendaView:ui.agendaView,agendaOpenDay:ui.agendaOpenDay,
    scrollY:typeof window==='undefined'?0:window.scrollY,agendaScrollTop:typeof document==='undefined'?0:document.querySelector('.agenda-body')?.scrollTop??0};
  goTo('profile');
  setUI({profileReturn});
}

export function returnFromProfile() {
  const target=ui.profileReturn;
  if(!target){goTo('today');return;}
  const {scrollY,agendaScrollTop,...context}=target;
  setUI({...context,profileReturn:undefined,sheet:undefined,sheetStack:[],agendaProfileRestore:context.tab==='agenda'&&context.agendaView==='week'});
  if(typeof window!=='undefined')requestAnimationFrame(()=>{
    if(ui.tab!==target.tab)return;
    window.scrollTo({top:scrollY});
    const body=document.querySelector('.agenda-body');if(body)body.scrollTop=agendaScrollTop;
    document.querySelector<HTMLButtonElement>('.topbar [aria-label="Conta e perfil"]')?.focus({preventScroll:true});
  });
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
