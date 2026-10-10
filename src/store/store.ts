import { useSyncExternalStore } from 'react';
import type { AppState, Project, Settings, Subtask, Task } from '../domain/types';
import { addDays, nowMin, todayISO } from '../domain/dates';
import { durationOf, overdueTasks } from '../domain/selectors';
import { nextFreeSlot, reflowDay, type DayPlan, type WeekAssignment } from '../domain/planner';
import { occurrencesBefore } from '../domain/recurrence';
import type { Suggestion } from '../domain/organize';
import { assistant } from '../services/assistant';
import { localRepository } from './persistence';

export const uid = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  theme: 'system',
  dayStart: '08:00',
  dayEnd: '20:00',
  defaultDuration: 30,
  protectLunch: true,
  lunchStart: '12:00',
  lunchEnd: '13:00',
  nudges: true,
  reminders: false,
  reminderLead: 10,
  onboarded: false,
};

export const emptyState = (): AppState => ({
  version: 1,
  tasks: [],
  projects: [],
  settings: { ...DEFAULT_SETTINGS },
  dismissed: {},
});

/* ------------------------------------------------------------------ */
/* Núcleo do store                                                     */
/* ------------------------------------------------------------------ */

let state: AppState = hydrate();
let undoStack: AppState[] = [];
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;

function hydrate(): AppState {
  const loaded = localRepository.load();
  if (!loaded) return emptyState();
  return { ...emptyState(), ...loaded, settings: { ...DEFAULT_SETTINGS, ...loaded.settings } };
}

function emit() {
  listeners.forEach((l) => l());
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => localRepository.save(state), 120);
}

function set(updater: (s: AppState) => AppState, opts: { undoable?: boolean } = {}) {
  if (opts.undoable) undoStack = [...undoStack.slice(-19), state];
  state = updater(state);
  emit();
}

export function getState() {
  return state;
}

/** Substitui o estado inteiro (dados vindos da nuvem, troca de conta). */
export function replaceState(next: AppState, opts: { resetUndo?: boolean } = {}) {
  if (opts.resetUndo) undoStack = [];
  state = next;
  emit();
}

export function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useStore<T>(selector: (s: AppState) => T): T {
  return useSyncExternalStore(subscribe, () => selector(state), () => selector(state));
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key && e.key.startsWith('leve.')) {
      state = hydrate();
      listeners.forEach((l) => l());
    }
  });
  window.addEventListener('pagehide', () => localRepository.save(state));
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const patchTask = (id: string, patch: Partial<Task> | ((t: Task) => Partial<Task>)) =>
  (s: AppState): AppState => ({
    ...s,
    tasks: s.tasks.map((t) =>
      t.id === id ? { ...t, ...(typeof patch === 'function' ? patch(t) : patch), updatedAt: Date.now() } : t,
    ),
  });

const findTask = (id: string) => state.tasks.find((t) => t.id === id);

export function newTask(partial: Partial<Task> & { title: string }): Task {
  const now = Date.now();
  return {
    id: uid(),
    kind: 'task',
    status: 'inbox',
    subtasks: [],
    postponed: 0,
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

const without = (list: string[] | undefined, date: string) => {
  const next = (list ?? []).filter((d) => d !== date);
  return next.length ? next : undefined;
};
const withDate = (list: string[] | undefined, date: string) => [...new Set([...(list ?? []), date])];

/**
 * Tira uma ocorrência da série e a transforma numa tarefa avulsa (exceção).
 * A série passa a pular aquela data; a cópia guarda de onde veio.
 */
function detach(s: AppState, id: string, date: string, patch: Partial<Task> = {}): AppState {
  const t = s.tasks.find((x) => x.id === id);
  if (!t?.recurrence) return s;
  const done = !!t.doneDates?.includes(date);
  const missed = !!t.missedDates?.includes(date);
  const now = Date.now();
  const copy: Task = {
    ...t,
    id: uid(),
    recurrence: undefined,
    doneDates: undefined,
    skipDates: undefined,
    missedDates: undefined,
    date,
    status: done || missed ? 'done' : 'active',
    completedAt: done || missed ? now : undefined,
    missed: missed || undefined,
    seriesId: t.id,
    seriesDate: date,
    postponed: 0,
    focusMinutes: undefined,
    subtasks: t.subtasks.map((x) => ({ ...x })),
    createdAt: now,
    updatedAt: now,
    ...patch,
  };
  const series = patchTask(id, (t) => ({
    skipDates: withDate(t.skipDates, date),
    doneDates: without(t.doneDates, date),
    missedDates: without(t.missedDates, date),
  }))(s);
  return { ...series, tasks: [copy, ...series.tasks] };
}

/** Encerra a série no dia anterior a `date` e começa outra (com `draft`) a partir dali. */
function splitSeries(s: AppState, id: string, date: string, draft: Task): AppState {
  const t = s.tasks.find((x) => x.id === id);
  const r = t?.recurrence;
  if (!t || !r) return s;
  if (date <= r.anchor) return patchTask(id, { ...draft, id })(s);
  const before = (list?: string[]) => {
    const l = list?.filter((d) => d < date);
    return l?.length ? l : undefined;
  };
  const after = (list?: string[]) => {
    const l = list?.filter((d) => d >= date);
    return l?.length ? l : undefined;
  };
  const past = occurrencesBefore(r, date);
  const old = patchTask(id, {
    recurrence: { ...r, until: addDays(date, -1), count: undefined },
    doneDates: before(t.doneDates),
    skipDates: before(t.skipDates),
    missedDates: before(t.missedDates),
  })(s);
  const now = Date.now();
  const nr = draft.recurrence;
  const next: Task = nr
    ? {
        ...draft,
        id: uid(),
        recurrence: {
          ...nr,
          // Mantém a contagem total: se eram 10 vezes e 4 já passaram, faltam 6
          anchor: nr.anchor !== r.anchor ? nr.anchor : date,
          count: nr.count && nr.count === r.count ? Math.max(1, r.count - past) : nr.count,
        },
        doneDates: after(t.doneDates),
        skipDates: after(t.skipDates),
        missedDates: after(t.missedDates),
        createdAt: now,
        updatedAt: now,
      }
    : // Deixou de repetir: a partir daqui vira uma tarefa só, nesta data
      { ...draft, id: uid(), date: draft.date ?? date, doneDates: undefined, skipDates: undefined, missedDates: undefined, createdAt: now, updatedAt: now };
  return { ...old, tasks: [next, ...old.tasks] };
}

export type SeriesScope = 'one' | 'following' | 'all';

/* ------------------------------------------------------------------ */
/* Ações                                                               */
/* ------------------------------------------------------------------ */

export interface CaptureDefaults {
  date?: string;
  time?: string;
  projectId?: string;
}

export const actions = {
  /** Captura rápida: interpreta o texto e decide para onde vai. */
  capture(text: string, defaults: CaptureDefaults = {}, ignore: Set<string> = new Set()): Task | undefined {
    if (!text.trim()) return;
    const task = actions.buildCapture(text, defaults, ignore);
    set((s) => ({ ...s, tasks: [task, ...s.tasks] }));
    return task;
  },

  /** Monta a tarefa a partir do texto da captura, sem salvar (para detalhar antes). */
  buildCapture(text: string, defaults: CaptureDefaults = {}, ignore: Set<string> = new Set()): Task {
    const raw = text.trim();
    const p = assistant.interpret(raw, { defaultDuration: state.settings.defaultDuration });
    const has = (k: string) => !ignore.has(k);
    const date = (has('date') ? p.date : undefined) ?? defaults.date;
    const time = (has('time') ? p.time : undefined) ?? defaults.time;
    const recurrence = has('recurrence') ? p.recurrence : undefined;
    const kind = has('kind') ? p.kind : 'task';
    const organized = !!(date || time || recurrence || defaults.projectId || kind === 'event');
    // Se o usuário descartou alguma interpretação, o texto volta inteiro para o título
    const title = ignore.size ? raw.charAt(0).toUpperCase() + raw.slice(1) : p.title;
    return newTask({
      title,
      kind,
      status: organized ? 'active' : 'inbox',
      date: recurrence ? undefined : date ?? (time ? todayISO() : undefined),
      time,
      due: has('due') ? p.due : undefined,
      dayPart: p.dayPart,
      duration: p.duration,
      priority: has('priority') ? p.priority : undefined,
      recurrence,
      category: p.category,
      energy: p.energy,
      projectId: defaults.projectId,
    });
  },

  add(task: Task) {
    set((s) => ({ ...s, tasks: [task, ...s.tasks] }), { undoable: true });
  },

  update(id: string, patch: Partial<Task>) {
    set(patchTask(id, patch));
  },

  /** Salva a edição de uma tarefa de uma vez (com desfazer). */
  saveTask(id: string, task: Task) {
    set(patchTask(id, { ...task, id }), { undoable: true });
  },

  /** Salva as definições de uma captura do Inbox de uma vez e a tira de lá. */
  organize(id: string, patch: Partial<Task>) {
    set(patchTask(id, { ...patch, status: 'active' }), { undoable: true });
  },

  /** Salva a edição de uma tarefa recorrente: só esta ocorrência, esta e as seguintes, ou a série toda. */
  saveSeries(id: string, draft: Task, scope: SeriesScope, date: string) {
    set((s) => {
      if (scope === 'all') return patchTask(id, { ...draft, id })(s);
      if (scope === 'following') return splitSeries(s, id, date, draft);
      const { title, notes, kind, priority, time, duration, due, projectId, subtasks } = draft;
      return detach(s, id, date, { title, notes, kind, priority, time, duration, due, projectId, subtasks });
    }, { undoable: true });
  },

  /** Exclui só uma ocorrência, esta e as seguintes, ou a série inteira. */
  removeSeries(id: string, scope: SeriesScope, date: string) {
    const r = findTask(id)?.recurrence;
    if (!r || scope === 'all' || (scope === 'following' && date <= r.anchor)) return actions.remove(id);
    set(
      patchTask(id, (t) =>
        scope === 'one'
          ? { skipDates: withDate(t.skipDates, date), doneDates: without(t.doneDates, date), missedDates: without(t.missedDates, date) }
          : {
              recurrence: { ...r, until: addDays(date, -1), count: undefined },
              doneDates: t.doneDates?.filter((d) => d < date),
              skipDates: t.skipDates?.filter((d) => d < date),
              missedDates: t.missedDates?.filter((d) => d < date),
            },
      ),
      { undoable: true },
    );
  },

  /** Compromisso: marca se aconteceu (ou não) naquele dia; sem `outcome`, desmarca. */
  markEvent(id: string, date: string, outcome?: 'held' | 'missed') {
    set(
      patchTask(id, (t): Partial<Task> => {
        if (t.recurrence) {
          return {
            doneDates: outcome === 'held' ? withDate(t.doneDates, date) : without(t.doneDates, date),
            missedDates: outcome === 'missed' ? withDate(t.missedDates, date) : without(t.missedDates, date),
          };
        }
        return outcome
          ? { status: 'done', completedAt: Date.now(), missed: outcome === 'missed' || undefined }
          : { status: 'active', completedAt: undefined, missed: undefined };
      }),
      { undoable: true },
    );
  },

  /** Conclui a tarefa (ou a ocorrência do dia, se recorrente). */
  complete(id: string, date = todayISO()) {
    const t = findTask(id);
    if (!t) return;
    set(
      patchTask(id, (t) =>
        t.recurrence
          ? { doneDates: [...new Set([...(t.doneDates ?? []), date])] }
          : { status: 'done', completedAt: Date.now(), date: t.date ?? todayISO() },
      ),
      { undoable: true },
    );
  },

  reopen(id: string, date = todayISO()) {
    set(
      patchTask(id, (t) =>
        t.recurrence
          ? { doneDates: without(t.doneDates, date), missedDates: without(t.missedDates, date) }
          : { status: 'active', completedAt: undefined, missed: undefined },
      ),
    );
  },

  remove(id: string) {
    set((s) => ({ ...s, tasks: s.tasks.filter((t) => t.id !== id) }), { undoable: true });
  },

  archive(id: string) {
    set(patchTask(id, { status: 'archived' }), { undoable: true });
  },

  /** Replanejamento de uma tarefa não concluída. */
  postpone(id: string, mode: 'later' | 'tomorrow' | 'unschedule' | 'custom', custom?: { date?: string; time?: string }, occurrence = todayISO()): string {
    const t = findTask(id);
    if (!t) return '';
    const today = todayISO();
    const tomorrow = addDays(today, 1);
    let label = '';

    if (t.recurrence) {
      // Recorrentes: só esta ocorrência sai da série; as outras continuam iguais
      if (mode === 'later') {
        const slot = nextFreeSlot(state.tasks, today, durationOf(t), state.settings, { after: nowMin(), excludeId: id });
        if (!slot) return 'Sem horário livre hoje';
        set((s) => detach(s, id, occurrence, { date: today, time: slot, postponed: 1 }), { undoable: true });
        return `Só esta vez: movida para ${slot}`;
      }
      if (mode === 'custom') {
        const d = custom?.date ?? today;
        set((s) => detach(s, id, occurrence, { date: d, time: custom?.time, postponed: 1 }), { undoable: true });
        return 'Só esta vez foi remarcada';
      }
      set(patchTask(id, (t) => ({ skipDates: withDate(t.skipDates, occurrence) })), { undoable: true });
      return 'Pulada esta vez';
    }

    let patch: Partial<Task> = {};
    if (mode === 'later') {
      const slot = nextFreeSlot(state.tasks, today, durationOf(t), state.settings, { after: nowMin(), excludeId: id });
      if (slot) {
        patch = { date: today, time: slot };
        label = `Movida para ${slot}`;
      } else {
        const slotTomorrow = nextFreeSlot(state.tasks, tomorrow, durationOf(t), state.settings, { excludeId: id });
        patch = { date: tomorrow, time: slotTomorrow };
        label = 'Sem espaço hoje — movida para amanhã';
      }
    } else if (mode === 'tomorrow') {
      patch = { date: tomorrow, time: undefined };
      label = 'Movida para amanhã';
    } else if (mode === 'unschedule') {
      patch = { time: undefined, date: t.date && t.date < today ? today : t.date };
      label = 'Mantida sem horário';
    } else {
      patch = { date: custom?.date ?? t.date ?? today, time: custom?.time };
      label = 'Horário atualizado';
    }
    set(
      (s) => {
        let next = patchTask(id, (t) => ({ ...patch, status: 'active', missed: undefined, completedAt: undefined, postponed: t.postponed + 1 }))(s);
        // Recalcula o restante do dia
        const updates = reflowDay(next.tasks, next.settings);
        for (const u of updates) next = patchTask(u.id, { time: u.time })(next);
        return next;
      },
      { undoable: true },
    );
    return label;
  },

  /** Reencaixa tarefas de hoje cujo horário já passou. */
  reflowToday(): number {
    const updates = reflowDay(state.tasks, state.settings);
    if (!updates.length) return 0;
    set(
      (s) => updates.reduce((acc, u) => patchTask(u.id, (t) => ({ time: u.time, postponed: t.postponed + 1 }))(acc), s),
      { undoable: true },
    );
    return updates.length;
  },

  bringOverdueToToday() {
    const today = todayISO();
    const ids = new Set(overdueTasks(state.tasks, today).map((t) => t.id));
    set(
      (s) => ({
        ...s,
        tasks: s.tasks.map((t) =>
          ids.has(t.id) ? { ...t, date: today, time: undefined, postponed: t.postponed + 1, updatedAt: Date.now() } : t,
        ),
      }),
      { undoable: true },
    );
    return ids.size;
  },

  /* ---------- Subtarefas ---------- */
  addSubtasks(id: string, titles: string[]) {
    const subs: Subtask[] = titles.filter(Boolean).map((title) => ({ id: uid(), title, done: false }));
    set(patchTask(id, (t) => ({ subtasks: [...t.subtasks, ...subs] })));
  },
  toggleSubtask(id: string, sid: string) {
    set(patchTask(id, (t) => ({ subtasks: t.subtasks.map((s) => (s.id === sid ? { ...s, done: !s.done } : s)) })));
  },
  renameSubtask(id: string, sid: string, title: string) {
    set(patchTask(id, (t) => ({ subtasks: t.subtasks.map((s) => (s.id === sid ? { ...s, title } : s)) })));
  },
  /** Substitui a lista de passos de uma vez (com desfazer). */
  setSubtasks(id: string, subtasks: Subtask[]) {
    set(patchTask(id, { subtasks }), { undoable: true });
  },
  removeSubtask(id: string, sid: string) {
    set(patchTask(id, (t) => ({ subtasks: t.subtasks.filter((s) => s.id !== sid) })));
  },

  /* ---------- Organização ---------- */
  applySuggestions(sugs: Suggestion[]) {
    set(
      (s) => {
        const byId = new Map(sugs.map((x) => [x.taskId, x]));
        return {
          ...s,
          tasks: s.tasks.map((t) => {
            const g = byId.get(t.id);
            if (!g) return t;
            return {
              ...t,
              status: 'active',
              date: g.date,
              time: g.time ?? t.time,
              priority: g.priority,
              duration: g.duration,
              updatedAt: Date.now(),
            };
          }),
        };
      },
      { undoable: true },
    );
  },

  /** Aplica o plano; `deferIds` são as tarefas que não couberam e o usuário escolheu mover para o dia seguinte. */
  applyDayPlan(plan: DayPlan, deferIds: string[] = []) {
    const tomorrow = addDays(plan.date, 1);
    const times = new Map(plan.placements.map((p) => [p.task.id, p.time]));
    const deferred = new Set(deferIds);
    set(
      (s) => ({
        ...s,
        tasks: s.tasks.map((t) => {
          if (times.has(t.id)) {
            return t.recurrence
              ? { ...t, time: times.get(t.id), updatedAt: Date.now() }
              : { ...t, status: 'active', date: plan.date, time: times.get(t.id), updatedAt: Date.now() };
          }
          if (deferred.has(t.id) && !t.recurrence) {
            return { ...t, date: tomorrow, time: undefined, postponed: t.postponed + 1, updatedAt: Date.now() };
          }
          return t;
        }),
      }),
      { undoable: true },
    );
  },

  applyWeek(assignments: WeekAssignment[]) {
    const map = new Map(assignments.map((a) => [a.task.id, a.date]));
    set(
      (s) => ({
        ...s,
        tasks: s.tasks.map((t) => (map.has(t.id) ? { ...t, status: 'active', date: map.get(t.id), updatedAt: Date.now() } : t)),
      }),
      { undoable: true },
    );
  },

  /* ---------- Projetos ---------- */
  addProject(name: string, emoji: string, color: string): Project {
    const p: Project = { id: uid(), name: name.trim(), emoji, color, createdAt: Date.now() };
    set((s) => ({ ...s, projects: [...s.projects, p] }));
    return p;
  },
  updateProject(id: string, patch: Partial<Project>) {
    set((s) => ({ ...s, projects: s.projects.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  },
  removeProject(id: string) {
    set(
      (s) => ({
        ...s,
        projects: s.projects.filter((p) => p.id !== id),
        tasks: s.tasks.map((t) => (t.projectId === id ? { ...t, projectId: undefined } : t)),
      }),
      { undoable: true },
    );
  },

  /* ---------- Foco ---------- */
  startFocus(taskId: string, date = todayISO(), target?: number) {
    set((s) => ({ ...s, focus: { taskId, date, startedAt: Date.now(), elapsedBefore: 0, running: true, target } }));
  },
  pauseFocus() {
    set((s) =>
      s.focus?.running
        ? { ...s, focus: { ...s.focus, running: false, elapsedBefore: s.focus.elapsedBefore + Date.now() - s.focus.startedAt } }
        : s,
    );
  },
  resumeFocus() {
    set((s) => (s.focus && !s.focus.running ? { ...s, focus: { ...s.focus, running: true, startedAt: Date.now() } } : s));
  },
  extendFocus(minutes: number) {
    set((s) => (s.focus ? { ...s, focus: { ...s.focus, target: (s.focus.target ?? 0) + minutes } } : s));
  },
  endFocus() {
    const f = state.focus;
    if (!f) return 0;
    const ms = f.elapsedBefore + (f.running ? Date.now() - f.startedAt : 0);
    const minutes = Math.round(ms / 60000);
    set((s) => {
      const next = { ...s, focus: undefined };
      return minutes > 0 ? patchTask(f.taskId, (t) => ({ focusMinutes: (t.focusMinutes ?? 0) + minutes }))(next) : next;
    });
    return minutes;
  },

  /* ---------- Preferências ---------- */
  updateSettings(patch: Partial<Settings>) {
    set((s) => ({ ...s, settings: { ...s.settings, ...patch } }));
  },
  dismiss(key: string) {
    set((s) => ({ ...s, dismissed: { ...s.dismissed, [key]: todayISO() } }));
  },
  /** Remove tarefas e projetos criados pela antiga opção “dados de exemplo”. */
  removeDemo(): number {
    const isDemo = (id: string) => id.startsWith('demo-');
    const n = state.tasks.filter((t) => isDemo(t.id)).length + state.projects.filter((p) => isDemo(p.id)).length;
    if (!n) return 0;
    set(
      (s) => ({
        ...s,
        tasks: s.tasks.filter((t) => !isDemo(t.id)).map((t) => (t.projectId && isDemo(t.projectId) ? { ...t, projectId: undefined, updatedAt: Date.now() } : t)),
        projects: s.projects.filter((p) => !isDemo(p.id)),
      }),
      { undoable: true },
    );
    return n;
  },

  finishOnboarding(name: string) {
    set((s) => ({ ...s, settings: { ...s.settings, name: name.trim(), onboarded: true } }));
  },
  reset() {
    localRepository.clear();
    undoStack = [];
    state = emptyState();
    emit();
  },

  undo(): boolean {
    const prev = undoStack.pop();
    if (!prev) return false;
    state = { ...prev, settings: state.settings, focus: state.focus };
    emit();
    return true;
  },
};
