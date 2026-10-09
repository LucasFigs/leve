/**
 * Planejamento automático realista: nunca preenche 100% do dia.
 * Reserva folga para imprevistos, pausas e transições.
 */
import type { DayItem, DayPart, Settings, Task } from './types';
import { addDays, diffDays, minToTime, nowMin, roundUpTo, timeToMin, todayISO } from './dates';
import { durationOf, itemsForDate, overdueTasks, unscheduledTasks } from './selectors';
import { scoreItem } from './priority';

export const TRANSITION_MIN = 10;
export const BREAK_AFTER_MIN = 90;
export const BREAK_MIN = 15;
/** fração do tempo livre que pode ser planejada */
export const LOAD_FACTOR = 0.8;

type Block = [number, number];

export interface Placement {
  task: Task;
  time: string;
  duration: number;
}

export interface PlanBreak {
  time: string;
  duration: number;
  label: string;
}

export interface DayPlan {
  date: string;
  start: number;
  end: number;
  fixed: DayItem[];
  placements: Placement[];
  breaks: PlanBreak[];
  deferred: Task[];
  freeMinutes: number;
  plannedMinutes: number;
}

function mergeBlocks(blocks: Block[]): Block[] {
  const sorted = [...blocks].sort((a, b) => a[0] - b[0]);
  const out: Block[] = [];
  for (const b of sorted) {
    const last = out[out.length - 1];
    if (last && b[0] <= last[1]) last[1] = Math.max(last[1], b[1]);
    else out.push([b[0], b[1]]);
  }
  return out;
}

function freeGaps(start: number, end: number, busy: Block[]): Block[] {
  const gaps: Block[] = [];
  let cursor = start;
  for (const [s, e] of mergeBlocks(busy)) {
    if (e <= cursor) continue;
    if (s >= end) break;
    if (s > cursor) gaps.push([cursor, Math.min(s, end)]);
    cursor = Math.max(cursor, e);
  }
  if (cursor < end) gaps.push([cursor, end]);
  return gaps;
}

function windowFor(date: string, settings: Settings, now = nowMin()) {
  let start = timeToMin(settings.dayStart);
  const end = timeToMin(settings.dayEnd);
  if (date === todayISO()) start = Math.max(start, roundUpTo(now + 5, 15));
  return { start, end };
}

function busyFor(items: DayItem[], exclude: Set<string>): Block[] {
  return items
    .filter((i) => i.time && !exclude.has(i.task.id))
    .map((i) => [timeToMin(i.time!), timeToMin(i.time!) + i.duration] as Block);
}

/** Horário de almoço protegido (em minutos), se ativado. */
export function lunchBlock(settings: Settings): Block | undefined {
  if (!settings.protectLunch) return undefined;
  const s = timeToMin(settings.lunchStart || '12:00');
  const e = timeToMin(settings.lunchEnd || '13:00');
  return e > s ? [s, e] : undefined;
}

/** Primeiro horário livre do dia que comporte `duration`. */
export function nextFreeSlot(
  tasks: Task[], date: string, duration: number, settings: Settings,
  opts: { after?: number; before?: number; excludeId?: string } = {},
): string | undefined {
  const items = itemsForDate(tasks, date, settings.defaultDuration);
  const win = windowFor(date, settings);
  const start = Math.max(win.start, opts.after ?? 0);
  const end = Math.min(win.end, opts.before ?? Infinity);
  const busy = busyFor(items, new Set(opts.excludeId ? [opts.excludeId] : []));
  const lunch = lunchBlock(settings);
  if (lunch) busy.push(lunch);
  for (const [s, e] of freeGaps(start, end, busy.map(([a, b]) => [a - 5, b + 5] as Block))) {
    const slot = roundUpTo(s, 5);
    if (e - slot >= duration) return minToTime(slot);
  }
  return undefined;
}

export const DAY_PARTS: { part: DayPart; label: string; from: number; to: number }[] = [
  { part: 'morning', label: 'Manhã', from: 0, to: 720 },
  { part: 'afternoon', label: 'Tarde', from: 720, to: 1080 },
  { part: 'evening', label: 'Noite', from: 1080, to: 1440 },
];

export interface PartSlot {
  part: DayPart;
  label: string;
  /** primeiro horário livre que comporta a tarefa */
  slot?: string;
  /** período fora do seu dia (configurado no Perfil) ou já passou */
  outside: boolean;
}

/** Para cada período do dia (manhã/tarde/noite), o primeiro horário livre que comporta a tarefa. */
export function slotsByPart(tasks: Task[], date: string, duration: number, settings: Settings, excludeId?: string): PartSlot[] {
  const win = windowFor(date, settings);
  return DAY_PARTS.map(({ part, label, from, to }) => {
    const outside = Math.max(from, win.start) >= Math.min(to, win.end);
    const slot = outside ? undefined : nextFreeSlot(tasks, date, duration, settings, { after: from, before: to, excludeId });
    return { part, label, slot, outside };
  });
}

export type CapacityStatus = 'ok' | 'tight' | 'over' | 'ended';

export interface DayCapacity {
  /** minutos livres que ainda restam no dia (fora compromissos, horários marcados e almoço) */
  free: number;
  /** minutos de tarefas sem horário que precisam caber no tempo livre */
  unscheduled: number;
  /** minutos de tarefas (com e sem horário) que ainda faltam */
  left: number;
  status: CapacityStatus;
}

/** O que falta fazer hoje cabe no tempo livre? (folga de 20% para imprevistos) */
export function dayCapacity(tasks: Task[], date: string, settings: Settings, now = nowMin()): DayCapacity {
  const items = itemsForDate(tasks, date, settings.defaultDuration).filter((i) => !i.done);
  const { start, end } = windowFor(date, settings, now);
  const busy: Block[] = items.filter((i) => i.time).map((i) => [timeToMin(i.time!), timeToMin(i.time!) + i.duration]);
  const lunch = lunchBlock(settings);
  if (lunch) busy.push(lunch);
  const free = start >= end ? 0 : freeGaps(start, end, busy).reduce((s, [a, b]) => s + b - a, 0);
  const work = items.filter((i) => i.task.kind !== 'event');
  const unscheduled = work.filter((i) => !i.time).reduce((s, i) => s + i.duration, 0);
  const left = work
    .filter((i) => !i.time || timeToMin(i.time) + i.duration > start)
    .reduce((s, i) => s + i.duration, 0);
  const status: CapacityStatus =
    start >= end ? 'ended' : unscheduled <= free * LOAD_FACTOR ? 'ok' : unscheduled <= free ? 'tight' : 'over';
  return { free, unscheduled, left, status };
}

/** “Organizar meu dia” */
export function planDay(tasks: Task[], date: string, settings: Settings, now = nowMin()): DayPlan {
  const today = todayISO();
  const fallback = settings.defaultDuration;
  const items = itemsForDate(tasks, date, fallback);
  const { start, end } = windowFor(date, settings, now);

  // O que pode ser movido
  const movable: DayItem[] = [];
  const fixed: DayItem[] = [];
  for (const i of items) {
    if (i.done) continue;
    const passed = date === today && i.time && timeToMin(i.time) < start;
    if (i.task.kind === 'event' || (i.time && !passed)) fixed.push(i);
    else movable.push(i);
  }
  if (date === today) {
    for (const t of overdueTasks(tasks, today)) {
      movable.push({ task: t, date: t.date ?? today, duration: durationOf(t, fallback), done: false, missed: false, recurring: false });
    }
  }
  for (const t of unscheduledTasks(tasks)) {
    if (t.kind === 'event') continue;
    if (t.priority === 'essential' || (t.due && diffDays(t.due, date) <= 1)) {
      movable.push({ task: t, date, duration: durationOf(t, fallback), done: false, missed: false, recurring: false });
    }
  }

  const seen = new Set<string>();
  const uniqueMovable = movable.filter((i) => !seen.has(i.task.id) && !!seen.add(i.task.id));

  const busy: Block[] = fixed.map((i) => [timeToMin(i.time!), timeToMin(i.time!) + i.duration]);
  const breaks: PlanBreak[] = [];
  const lunch = lunchBlock(settings);
  if (lunch && start < lunch[1] && end > lunch[0]) {
    const [l0, l1] = lunch;
    const lunchFree = freeGaps(l0, l1, busy).reduce((s, [a, b]) => s + b - a, 0) >= (l1 - l0) * 0.75;
    if (lunchFree) {
      busy.push([Math.max(l0, start), l1]);
      if (start < l1 - 20) breaks.push({ time: minToTime(Math.max(l0, start)), duration: l1 - Math.max(l0, start), label: 'Almoço' });
    }
  }

  const gaps = freeGaps(start, end, busy);
  const freeMinutes = gaps.reduce((s, [a, b]) => s + (b - a), 0);
  const capacity = freeMinutes * LOAD_FACTOR;

  const ctx = { today, now: start, items, overdue: [], unscheduled: [], settings };
  const ranked = uniqueMovable
    .map((i) => scoreItem(i, ctx))
    .sort((a, b) => b.score - a.score)
    .map((c) => c.item);

  const placements: Placement[] = [];
  const deferred: Task[] = [];
  let planned = 0;
  let streakMin = 0;
  let lastEnd = -1;
  const cursorGaps = gaps.map((g) => [...g] as Block);

  for (const item of ranked) {
    const d = item.duration;
    if (planned + d > capacity) {
      deferred.push(item.task);
      continue;
    }
    let placed = false;
    for (const g of cursorGaps) {
      let s = g[0];
      // Pausa depois de muito tempo seguido
      if (s === lastEnd && streakMin >= BREAK_AFTER_MIN) {
        breaks.push({ time: minToTime(s), duration: BREAK_MIN, label: 'Pausa' });
        s += BREAK_MIN;
        g[0] = s;
        streakMin = 0;
      }
      s = roundUpTo(s, 5);
      if (g[1] - s < d) continue;
      placements.push({ task: item.task, time: minToTime(s), duration: d });
      const finish = s + d;
      streakMin = s === lastEnd || s - lastEnd <= TRANSITION_MIN ? streakMin + d : d;
      g[0] = finish + TRANSITION_MIN;
      lastEnd = g[0];
      planned += d;
      placed = true;
      break;
    }
    if (!placed) deferred.push(item.task);
  }

  placements.sort((a, b) => timeToMin(a.time) - timeToMin(b.time));
  breaks.sort((a, b) => timeToMin(a.time) - timeToMin(b.time));
  return { date, start, end, fixed, placements, breaks, deferred, freeMinutes, plannedMinutes: planned };
}

/**
 * Replanejamento: tarefas de hoje cujo horário passou sem conclusão são
 * reencaixadas nos próximos horários livres; o que não couber perde o horário.
 */
export function reflowDay(tasks: Task[], settings: Settings, now = nowMin()): { id: string; time?: string }[] {
  const today = todayISO();
  const stale = tasks.filter(
    (t) => t.status === 'active' && !t.recurrence && t.kind !== 'event' && t.date === today && t.time && timeToMin(t.time) + 5 < now,
  );
  let working = tasks.map((t) => (stale.includes(t) ? { ...t, time: undefined } : t));
  const updates: { id: string; time?: string }[] = [];
  for (const t of stale) {
    const slot = nextFreeSlot(working, today, durationOf(t, settings.defaultDuration), settings, { after: now });
    updates.push({ id: t.id, time: slot });
    if (slot) working = working.map((w) => (w.id === t.id ? { ...w, time: slot } : w));
  }
  return updates;
}

export interface WeekAssignment {
  task: Task;
  date: string;
}

/** Minutos de tarefas que cabem num dia (metade do tempo livre fora de compromissos). */
export function dayBudget(tasks: Task[], date: string, settings: Settings): { budget: number; used: number } {
  const items = itemsForDate(tasks, date, settings.defaultDuration);
  const total = timeToMin(settings.dayEnd) - timeToMin(settings.dayStart);
  const events = items.filter((i) => i.task.kind === 'event').reduce((s, i) => s + i.duration, 0);
  const used = items.filter((i) => i.task.kind !== 'event' && !i.done).reduce((s, i) => s + i.duration, 0);
  return { budget: Math.max(60, (total - events) * 0.5), used };
}

/** “Organizar minha semana”: distribui tarefas sem dia respeitando prazos e carga. */
export function planWeek(tasks: Task[], settings: Settings, preferred: Record<string, string> = {}): WeekAssignment[] {
  const today = todayISO();
  const late = nowMin() > timeToMin(settings.dayEnd) - 120;
  const first = late ? addDays(today, 1) : today;
  const days = Array.from({ length: 7 }, (_, i) => addDays(first, i));
  const load = new Map(days.map((d) => [d, dayBudget(tasks, d, settings)]));

  const pool = unscheduledTasks(tasks).filter((t) => t.kind !== 'event');
  const rank = (t: Task) =>
    (t.due ? 0 : 100) + (t.priority === 'essential' ? 0 : t.priority === 'optional' ? 60 : 30) + (t.due ? diffDays(t.due, today) : 0);
  pool.sort((a, b) => rank(a) - rank(b));

  const out: WeekAssignment[] = [];
  for (const t of pool) {
    if (t.priority === 'optional' && !preferred[t.id]) continue;
    const d = durationOf(t, settings.defaultDuration);
    const last = t.due && t.due >= first ? t.due : days[days.length - 1];
    const options = days.filter((day) => day <= last);
    const pref = preferred[t.id];
    const ordered = pref && options.includes(pref) ? [pref, ...options.filter((o) => o !== pref)] : options;
    const pick = ordered.find((day) => {
      const l = load.get(day)!;
      return l.used + d <= l.budget;
    }) ?? ordered[0] ?? first;
    const l = load.get(pick);
    if (l) l.used += d;
    out.push({ task: t, date: pick });
  }
  return out;
}
