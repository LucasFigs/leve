/** O que está para começar — usado pelo app (aviso local) e pelo servidor (push com o app fechado). */
import type { Task } from './types';
import { timeToMin } from './dates';
import { itemsForDate } from './selectors';

export interface Reminder {
  /** identifica o aviso no dia (também é a “tag” da notificação: o mesmo aviso não aparece duas vezes) */
  key: string;
  taskId: string;
  date: string;
  time: string;
  title: string;
  /** minutos até começar (0 ou negativo = já está na hora) */
  left: number;
  body: string;
}

export interface ReminderPrefs {
  reminderLead?: number;
  defaultDuration?: number;
}

/**
 * Itens de `today` com horário, ainda não feitos, dentro da janela de aviso:
 * de `reminderLead` minutos antes até `grace` minutos depois do início.
 */
export function dueReminders(tasks: Task[], prefs: ReminderPrefs, today: string, now: number, grace = 5): Reminder[] {
  const lead = prefs.reminderLead ?? 10;
  const out: Reminder[] = [];
  for (const i of itemsForDate(tasks, today, prefs.defaultDuration ?? 30)) {
    if (!i.time || i.done) continue;
    const start = timeToMin(i.time);
    if (now < start - lead || now > start + grace) continue;
    const left = start - now;
    out.push({
      key: `${i.task.id}:${i.time}`,
      taskId: i.task.id,
      date: i.date,
      time: i.time,
      title: i.task.title,
      left,
      body: left > 0 ? `Começa às ${i.time} (em ${left} min)` : `Era às ${i.time} — está na hora`,
    });
  }
  return out;
}
