/**
 * Notificações inteligentes (exibidas dentro do app).
 * Poucas, contextuais e dispensáveis — nunca spam.
 */
import type { DayItem, Settings, Task } from '../domain/types';
import { formatDuration, timeToMin } from '../domain/dates';
import { nextEventAfter, rankCandidates } from '../domain/priority';
import type { IconName } from './Icon';

export interface NudgeAction {
  label: string;
  kind: 'reflow' | 'start' | 'breakdown' | 'review' | 'plan' | 'planTomorrow' | 'open';
  taskId?: string;
  primary?: boolean;
}

export interface Nudge {
  key: string;
  icon: IconName;
  tone: 'accent' | 'yellow' | 'blue' | 'green';
  text: string;
  actions: NudgeAction[];
}

interface Ctx {
  today: string;
  now: number;
  items: DayItem[];
  overdue: Task[];
  unscheduled: Task[];
  tasks: Task[];
  settings: Settings;
  dismissed: Record<string, string>;
}

/** Uma sugestão por vez: a mais relevante primeiro (menos ruído na tela). */
export function computeNudges(ctx: Ctx, limit = 1): Nudge[] {
  if (!ctx.settings.nudges) return [];
  const out: Nudge[] = [];
  const isDismissed = (key: string) => ctx.dismissed[key] === ctx.today;

  // 1) Tarefas que passaram do horário
  const stale = ctx.items.filter(
    (i) => !i.done && !i.recurring && i.task.kind !== 'event' && i.time && timeToMin(i.time) + i.duration < ctx.now,
  );
  if (stale.length && !isDismissed('reflow')) {
    out.push({
      key: 'reflow',
      icon: 'calendar-arrow',
      tone: 'yellow',
      text:
        stale.length === 1
          ? `“${stale[0].task.title}” passou do horário. Quer que eu reorganize o resto do dia?`
          : `${stale.length} tarefas passaram do horário. Quer que eu reorganize o resto do dia?`,
      actions: [{ label: 'Reorganizar', kind: 'reflow', primary: true }],
    });
  }

  // 2) Tempo livre antes do próximo compromisso
  const next = nextEventAfter(ctx.items, ctx.now);
  if (next?.time) {
    const gap = timeToMin(next.time) - ctx.now;
    const busyNow = ctx.items.some(
      (i) => i.time && !i.done && timeToMin(i.time) <= ctx.now && timeToMin(i.time) + i.duration > ctx.now,
    );
    if (gap >= 20 && gap <= 180 && !busyNow) {
      const fit = rankCandidates({ ...ctx, now: ctx.now }).find((c) => c.item.duration <= gap - 5 && !c.item.time);
      const key = `gap:${next.task.id}:${fit?.item.task.id}`;
      if (fit && !isDismissed(key)) {
        out.push({
          key,
          icon: 'hourglass',
          tone: 'blue',
          text: `Você tem ${formatDuration(gap)} livres antes de “${next.task.title}”. Quer aproveitar para fazer “${fit.item.task.title}”?`,
          actions: [{ label: 'Começar', kind: 'start', taskId: fit.item.task.id, primary: true }],
        });
      }
    }
  }

  // 3) Procrastinação
  const stuck = ctx.tasks
    .filter((t) => t.status === 'active' && t.kind === 'task' && t.postponed >= 3 && t.subtasks.length === 0)
    .sort((a, b) => b.postponed - a.postponed)[0];
  if (stuck && !isDismissed(`stuck:${stuck.id}`)) {
    out.push({
      key: `stuck:${stuck.id}`,
      icon: 'split',
      tone: 'accent',
      text: `“${stuck.title}” já foi adiada ${stuck.postponed} vezes. Quer dividi-la em passos menores?`,
      actions: [{ label: 'Dividir', kind: 'breakdown', taskId: stuck.id, primary: true }],
    });
  }

  // 4) Sobrecarga
  const remaining = ctx.items.filter((i) => !i.done && i.task.kind !== 'event').reduce((s, i) => s + i.duration, 0);
  const end = timeToMin(ctx.settings.dayEnd);
  const eventsLeft = ctx.items
    .filter((i) => i.task.kind === 'event' && i.time && timeToMin(i.time) > ctx.now)
    .reduce((s, i) => s + i.duration, 0);
  const free = Math.max(0, end - Math.max(ctx.now, timeToMin(ctx.settings.dayStart)) - eventsLeft);
  const dayOver = ctx.now >= end;
  if (dayOver && remaining > 0 && !isDismissed('dayover')) {
    out.push({
      key: 'dayover',
      icon: 'moon',
      tone: 'blue',
      text: `Seu dia terminou com ${formatDuration(remaining)} de tarefas pendentes. Quer planejar amanhã?`,
      actions: [{ label: 'Planejar amanhã', kind: 'planTomorrow', primary: true }],
    });
  } else if (!dayOver && remaining > free * 0.9 && remaining > 60 && !isDismissed('overload')) {
    out.push({
      key: 'overload',
      icon: 'wand',
      tone: 'yellow',
      text: `Hoje tem ${formatDuration(remaining)} de tarefas para ${formatDuration(free) || '0 min'} livres. Quer que eu ajuste para algo possível?`,
      actions: [{ label: 'Organizar meu dia', kind: 'plan', primary: true }],
    });
  }

  // 5) Inbox acumulando (ou fim do dia)
  const inbox = ctx.tasks.filter((t) => t.status === 'inbox').length;
  const evening = ctx.now >= 17 * 60;
  if ((inbox >= 3 || (evening && inbox >= 1)) && !isDismissed('inbox')) {
    out.push({
      key: 'inbox',
      icon: 'sparkles',
      tone: 'accent',
      text: inbox === 1 ? 'Você tem 1 captura esperando. Quer que eu organize?' : `Você tem ${inbox} capturas esperando. Quer que eu organize?`,
      actions: [{ label: 'Organizar', kind: 'review', primary: true }],
    });
  }

  return out.slice(0, limit);
}
