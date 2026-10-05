import type { DayItem, Recurrence, Task } from './types';
import { dayOfTimestamp, diffDays, fromISODate, timeToMin, weekdayOf } from './dates';

export function occursOn(r: Recurrence, date: string): boolean {
  if (date < r.anchor) return false;
  switch (r.freq) {
    case 'daily':
      return true;
    case 'weekly':
      return (r.weekdays ?? []).includes(weekdayOf(date));
    case 'monthly': {
      const d = fromISODate(date);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      return d.getDate() === Math.min(r.monthDay ?? 1, lastDay);
    }
    case 'interval':
      return diffDays(date, r.anchor) % (r.interval ?? 1) === 0;
  }
}

export const isRecurring = (t: Task) => !!t.recurrence;

export function durationOf(t: Task, fallback = 30): number {
  return t.duration ?? fallback;
}

/** Tudo que acontece num dia: compromissos, tarefas planejadas e ocorrências recorrentes. */
export function itemsForDate(tasks: Task[], date: string, fallback = 30): DayItem[] {
  const out: DayItem[] = [];
  for (const t of tasks) {
    if (t.status === 'archived' || t.status === 'inbox') continue;
    if (t.recurrence) {
      if (!occursOn(t.recurrence, date) || t.skipDates?.includes(date)) continue;
      out.push({
        task: t, date, time: t.time, duration: durationOf(t, fallback),
        done: !!t.doneDates?.includes(date), recurring: true,
      });
    } else if (t.date === date) {
      out.push({ task: t, date, time: t.time, duration: durationOf(t, fallback), done: t.status === 'done', recurring: false });
    }
  }
  return sortItems(out);
}

export function sortItems(items: DayItem[]): DayItem[] {
  return items.sort((a, b) => {
    if (a.time && b.time) return timeToMin(a.time) - timeToMin(b.time);
    if (a.time) return -1;
    if (b.time) return 1;
    return a.task.createdAt - b.task.createdAt;
  });
}

/** Tarefas não concluídas com data no passado (ou prazo vencido). */
export function overdueTasks(tasks: Task[], today: string): Task[] {
  return tasks.filter(
    (t) =>
      t.status === 'active' && !t.recurrence && t.kind !== 'event' &&
      ((t.date && t.date < today) || (!t.date && t.due && t.due < today)),
  );
}

export function inboxTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.status === 'inbox').sort((a, b) => b.createdAt - a.createdAt);
}

/** Tarefas ativas sem dia definido (“quando der”). */
export function unscheduledTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => t.status === 'active' && !t.date && !t.recurrence);
}

export function completedOn(tasks: Task[], date: string): number {
  let n = 0;
  for (const t of tasks) {
    if (t.recurrence) n += t.doneDates?.includes(date) ? 1 : 0;
    else if (t.status === 'done' && t.completedAt && dayOfTimestamp(t.completedAt) === date) n++;
  }
  return n;
}

export function streak(tasks: Task[], today: string): number {
  const days = new Set<string>();
  for (const t of tasks) {
    if (t.completedAt && t.status === 'done') days.add(dayOfTimestamp(t.completedAt));
    t.doneDates?.forEach((d) => days.add(d));
  }
  let count = 0;
  let cursor = today;
  if (!days.has(cursor)) cursor = shift(cursor, -1);
  while (days.has(cursor)) {
    count++;
    cursor = shift(cursor, -1);
  }
  return count;
}

function shift(iso: string, n: number) {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function projectProgress(tasks: Task[], projectId: string) {
  const list = tasks.filter((t) => t.projectId === projectId && t.status !== 'archived' && t.status !== 'inbox');
  const done = list.filter((t) => t.status === 'done').length;
  return { total: list.length, done, pct: list.length ? done / list.length : 0 };
}
