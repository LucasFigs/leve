import type { Settings, Task } from './types';
import { addDays, timeToMin, weekdayOf } from './dates';

export type TimeWindow = { start: number; end: number };
export function periodError(start: string, end: string): string | undefined {
  return !start || !end || timeToMin(start) >= timeToMin(end)
    ? 'Escolha um fim posterior ao começo, no mesmo dia.' : undefined;
}
export function usesWorkSchedule(task: Pick<Task, 'category'>, settings: Settings): boolean {
  return task.category === 'trabalho' && !!settings.workSchedule?.enabled;
}
/** Expediente e disponibilidade pessoal sao independentes; ocupacoes sao compartilhadas. */
export function taskWindow(task: Pick<Task, 'category'>, date: string, settings: Settings): TimeWindow {
  const work = settings.workSchedule;
  if (usesWorkSchedule(task, settings) && work) {
    if (!work.weekdays.includes(weekdayOf(date))) return { start: 0, end: 0 };
    return { start: timeToMin(work.start), end: timeToMin(work.end) };
  }
  return { start: timeToMin(settings.dayStart), end: timeToMin(settings.dayEnd) };
}
export function fitsContext(task: Pick<Task, 'category'>, date: string, start: number, duration: number, settings: Settings): boolean {
  const win = taskWindow(task, date, settings);
  return start >= win.start && start + duration <= win.end;
}
/** Proximo dia profissional; nao depende de calendario de feriados. */
export function nextContextDate(task: Pick<Task, 'category'>, from: string, settings: Settings): string | undefined {
  for (let offset = 0; offset < 7; offset++) {
    const date = addDays(from, offset);
    const win = taskWindow(task, date, settings);
    if (win.end > win.start) return date;
  }
  return undefined;
}
export function outsideWorkWarning(task: Task, date: string | undefined, settings: Settings): boolean {
  return !!date && !!task.time && usesWorkSchedule(task, settings) &&
    !fitsContext(task, date, timeToMin(task.time), task.duration ?? settings.defaultDuration, settings);
}
