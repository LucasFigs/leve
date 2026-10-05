/**
 * Sugestões para capturas do Inbox: quando fazer, quanto tempo, que prioridade.
 * Explica sempre o motivo em poucas palavras.
 */
import type { Priority, Settings, Task } from './types';
import { addDays, diffDays, nowMin, timeToMin, todayISO, weekdayOf } from './dates';
import { normalize, parse } from './parser';
import { dayBudget } from './planner';
import { suggestBreakdown } from './breakdown';

export interface Suggestion {
  taskId: string;
  title: string;
  date?: string;
  time?: string;
  priority: Priority;
  duration: number;
  reason: string;
  breakdown?: string[];
}

const QUICK = /\b(marcar|agendar|ligar|responder|pagar|confirmar|enviar|mandar|renovar|cancelar|transferir)\b/;
const WEEKEND = /\b(comprar presente|presente|passear|visitar|faxina|feira|cinema|lazer)\b/;
const SOMEDAY = /\b(ideia|pensar em|talvez|pesquisar sobre|ver sobre|algum dia|aprender)\b/;
const URGENT = /\b(urgente|hoje|vence|vencimento|atrasad[oa]|ultimo dia|prazo)\b/;

function upcomingSaturday(ref: string) {
  const wd = weekdayOf(ref);
  return wd === 6 ? ref : addDays(ref, (6 - wd + 7) % 7);
}

export function suggestForTask(task: Task, tasks: Task[], settings: Settings): Suggestion {
  const today = todayISO();
  const late = nowMin() > timeToMin(settings.dayEnd) - 120;
  const firstDay = late ? addDays(today, 1) : today;
  const n = normalize(task.title);
  const parsed = parse(task.title, { defaultDuration: settings.defaultDuration });
  const duration = task.duration ?? parsed.duration;

  let priority: Priority = task.priority ?? 'important';
  if (!task.priority) {
    if (URGENT.test(n) || (task.due && diffDays(task.due, today) <= 1)) priority = 'essential';
    else if (SOMEDAY.test(n)) priority = 'optional';
  }

  let date = task.date;
  let reason = '';
  if (date) reason = 'Data que você indicou';
  else if (task.due) {
    date = diffDays(task.due, firstDay) <= 0 ? firstDay : addDays(task.due, -1) < firstDay ? firstDay : addDays(task.due, -1);
    reason = 'Um dia antes do prazo';
  } else if (priority === 'optional') {
    reason = 'Sem pressa — fica em “quando der”';
  } else if (WEEKEND.test(n)) {
    date = upcomingSaturday(firstDay);
    reason = 'Encaixa melhor no fim de semana';
  } else if (priority === 'essential') {
    date = firstDay;
    reason = 'Parece urgente';
  } else if (QUICK.test(n) && duration <= 15) {
    date = addDays(today, 1) < firstDay ? firstDay : addDays(today, 1);
    reason = `Rápida — leva uns ${duration} min`;
  } else {
    // Dia com mais espaço nos próximos 3 dias
    const days = [0, 1, 2].map((i) => addDays(firstDay, i));
    let best = days[0];
    let bestFree = -Infinity;
    for (const d of days) {
      const { budget, used } = dayBudget(tasks, d, settings);
      const free = budget - used;
      if (free > bestFree + 20) {
        best = d;
        bestFree = free;
      }
    }
    date = best;
    reason = best === firstDay ? 'Você tem espaço hoje' : 'Dia com mais espaço livre';
  }

  return {
    taskId: task.id,
    title: task.title,
    date,
    priority,
    duration,
    reason,
    breakdown: parsed.big && task.subtasks.length === 0 ? suggestBreakdown(task.title) : undefined,
  };
}
