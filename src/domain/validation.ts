import type { Task, Project } from './types';
import { HABIT_COLORS, HABIT_ICONS } from './habits';

export const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
export const isGoogleDeletions = (value: unknown): boolean => value == null || Array.isArray(value) && value.length <= 10000 && value.every(v => isObject(v) && typeof v.eventId === 'string' && v.eventId.length > 0 && v.eventId.length <= 1024 && typeof v.calendarId === 'string' && v.calendarId.length > 0 && v.calendarId.length <= 1024);
const text = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
const number = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
const optional = (v: unknown, check: (v: unknown) => boolean) => v == null || check(v);
export const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
const time = (v: unknown) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);
const dates = (v: unknown) => Array.isArray(v) && v.length <= 25000 && v.every(isDate);
const integer = (v: unknown, low: number, high: number) => number(v) && Number.isInteger(v) && (v as number) >= low && (v as number) <= high;

export function isTask(v: unknown): v is Task {
  if (!isObject(v) || !text(v.id, 200) || !v.id || !text(v.title, 1000) ||
    !['task', 'event', 'habit'].includes(v.kind as string) || !['inbox', 'active', 'done', 'archived'].includes(v.status as string) ||
    !number(v.createdAt) || !number(v.updatedAt) || !number(v.postponed) ||
    !optional(v.habitColor, x => HABIT_COLORS.some(color => color.value === x)) ||
    !optional(v.habitIcon, x => HABIT_ICONS.some(icon => icon.value === x)) ||
    !optional(v.notes, x => text(x, 50000)) || !optional(v.date, isDate) || !optional(v.due, isDate) || !optional(v.time, time) ||
    !optional(v.duration, x => integer(x, 1, 10080)) ||
    !optional(v.googleEventId, x => text(x, 1024)) ||
    !optional(v.googleCalendarId, x => text(x, 1024)) ||
    !optional(v.doneDates, dates) || !optional(v.skipDates, dates) || !optional(v.missedDates, dates) ||
    !Array.isArray(v.subtasks) || v.subtasks.length > 1000 || !v.subtasks.every(s => isObject(s) && text(s.id, 200) && text(s.title, 1000) && typeof s.done === 'boolean')) return false;
  if (v.recurrence != null) {
    const r = v.recurrence;
    if (!isObject(r) || !['daily', 'weekly', 'monthly', 'yearly', 'interval'].includes(r.freq as string) || !isDate(r.anchor) ||
      !optional(r.until, isDate) || !optional(r.interval, x => integer(x, 1, 10000)) || !optional(r.count, x => integer(x, 1, 25000)) ||
      !optional(r.weekdays, x => Array.isArray(x) && x.length <= 7 && x.every(d => integer(d, 0, 6))) ||
      !optional(r.monthDay, x => integer(x, 1, 31)) || !optional(r.month, x => integer(x, 0, 11)) ||
      !optional(r.weekday, x => integer(x, 0, 6)) || !optional(r.nth, x => x === -1 || integer(x, 1, 5))) return false;
  }
  return true;
}

export function isProject(v: unknown): v is Project {
  return isObject(v) && text(v.id, 200) && !!v.id && text(v.name, 1000) && text(v.emoji, 100) && text(v.color, 100) && number(v.createdAt);
}

export function isSettings(v: unknown): v is Record<string, unknown> {
  if (!isObject(v)) return false;
  return optional(v.name, x => text(x, 1000)) && optional(v.theme, x => ['system', 'light', 'dark'].includes(x as string)) &&
    ['dayStart', 'dayEnd', 'lunchStart', 'lunchEnd'].every(k => optional(v[k], time)) &&
    optional(v.defaultDuration, x => integer(x, 1, 10080)) && optional(v.reminderLead, x => integer(x, 0, 1440)) &&
    ['protectLunch', 'nudges', 'reminders', 'discreetReminders', 'onboarded'].every(k => optional(v[k], x => typeof x === 'boolean'));
}

export function isMeta(v: unknown): boolean {
  return isObject(v) && isSettings(v.settings) && optional(v.dismissed, x => isObject(x) && Object.values(x).every(isDate)) &&
    optional(v.focus, x => isObject(x) && text(x.taskId, 200) && isDate(x.date) && number(x.startedAt) && number(x.elapsedBefore) && typeof x.running === 'boolean');
}
