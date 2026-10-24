/**
 * “Qual é a próxima coisa que faz mais sentido eu fazer?”
 *
 * Prioridade = impacto + urgência + prazo + contexto + esforço.
 * O usuário vê apenas uma recomendação e um motivo curto.
 */
import type { DayItem, Priority, Settings, Task } from './types';
import { diffDays, formatDuration, nowMin, timeToMin } from './dates';
import { durationOf } from './selectors';

export const PRIORITY_META: Record<Priority, { label: string; short: string; tone: string }> = {
  essential: { label: 'Essencial', short: 'Essencial', tone: 'red' },
  important: { label: 'Importante', short: 'Importante', tone: 'yellow' },
  optional: { label: 'Se der', short: 'Se der', tone: 'gray' },
};

export interface Candidate {
  item: DayItem;
  score: number;
  reason: string;
  ongoing?: boolean;
}

export interface RankContext {
  today: string;
  now?: number;
  items: DayItem[];
  overdue: Task[];
  unscheduled: Task[];
  settings: Settings;
}

const BASE: Record<Priority | 'none', number> = { essential: 25, important: 15, none: 10, optional: 0 };

export function nextEventAfter(items: DayItem[], now: number): DayItem | undefined {
  return items.find((i) => i.task.kind === 'event' && i.time && timeToMin(i.time) >= now && !i.done);
}

export function scoreItem(item: DayItem, ctx: RankContext & { now: number }): Candidate {
  const t = item.task;
  const reasons: [number, string][] = [];
  let score = BASE[t.priority ?? 'none'];
  let ongoing = false;

  if (t.priority === 'essential') reasons.push([5, 'Essencial']);

  // Prazo
  if (t.due) {
    const d = diffDays(t.due, ctx.today);
    if (d <= 0) {
      score += 20;
      reasons.push([35, d < 0 ? 'Prazo vencido' : 'Prazo hoje']);
    } else if (d === 1) {
      score += 10;
      reasons.push([20, 'Prazo amanhã']);
    } else if (d <= 3) score += 4;
  }

  // 1. Tarefa com horário marcado para hoje
  if (item.date === ctx.today && item.time) {
    const start = timeToMin(item.time);
    const end = start + item.duration;

    if (ctx.now >= start && ctx.now < end) {
      // Acontecendo AGORA: prioridade máxima absoluta
      score += 2000 + (end - ctx.now);
      reasons.push([100, `Planejada para agora (${item.time})`]);
      ongoing = true;
    } else if (start >= ctx.now) {
      // Próxima hoje: ordenada rigorosamente pelo horário de início (mais cedo = maior pontuação)
      const diff = start - ctx.now;
      score += 1000 - Math.min(diff, 900);
      reasons.push([90, diff <= 30 ? `Começa às ${item.time}` : `Próxima hoje, às ${item.time}`]);
    } else {
      // Horário passou antes hoje e ainda não foi concluída
      const passed = ctx.now - end;
      score += 500 - Math.min(passed, 200);
      reasons.push([80, `Era para às ${item.time} · pendente hoje`]);
    }
  } else if (item.date === ctx.today) {
    // 2. Tarefa para hoje sem horário
    score += 200;
  } else if (item.date < ctx.today) {
    // 3. Atrasada de dias anteriores
    const days = diffDays(ctx.today, item.date);
    score += 120 + Math.min(days * 2, 20);
    reasons.push([40, days === 1 ? 'Ficou de ontem' : `Pendente há ${days} dias`]);
  }

  // Encaixe antes do próximo compromisso
  const next = nextEventAfter(ctx.items, ctx.now);
  const duration = item.duration;
  if (next?.time && !item.time) {
    const gap = timeToMin(next.time) - ctx.now;
    if (duration <= gap - 5) {
      score += 8;
      if (gap < 150) reasons.push([15, `Cabe antes de ${next.task.title} (${next.time})`]);
    } else if (gap < 120) score -= 25;
  }

  // Energia × hora do dia
  const hour = ctx.now / 60;
  if (t.energy === 'high') score += hour < 12 ? 6 : hour >= 18 ? -6 : 0;
  if (t.energy === 'low' && hour >= 14) score += 4;
  if (t.dayPart) {
    const part = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    score += t.dayPart === part ? 6 : -15;
  }

  // Procrastinação
  if (t.postponed > 0) {
    score += Math.min(t.postponed * 2, 8);
    if (t.postponed >= 2) reasons.push([30, `Adiada ${t.postponed} vezes — que tal só começar?`]);
  }

  // Vitória rápida
  if (duration <= 15) {
    score += 4;
    reasons.push([10, `Rápida — ${formatDuration(duration)}`]);
  }

  reasons.sort((a, b) => b[0] - a[0]);
  return { item, score, reason: reasons[0]?.[1] ?? (t.kind === 'habit' ? 'Hábito do dia' : 'Próxima da sua lista'), ongoing };
}

/** Lista ordenada do que faz sentido fazer agora. */
export function rankCandidates(ctx: RankContext): Candidate[] {
  const now = ctx.now ?? nowMin();
  const full = { ...ctx, now };
  const fallback = ctx.settings.defaultDuration;

  const pool: DayItem[] = ctx.items.filter((i) => !i.done && i.task.kind !== 'event');
  for (const t of ctx.overdue) {
    pool.push({ task: t, date: t.date ?? ctx.today, time: undefined, duration: durationOf(t, fallback), done: false, missed: false, recurring: false });
  }
  for (const t of ctx.unscheduled) {
    if (t.priority === 'essential' || (t.due && diffDays(t.due, ctx.today) <= 2)) {
      pool.push({ task: t, date: ctx.today, duration: durationOf(t, fallback), done: false, missed: false, recurring: false });
    }
  }
  return pool.map((i) => scoreItem(i, full)).sort((a, b) => b.score - a.score);
}

export type NowRecommendation =
  | { type: 'event'; item: DayItem; minutes: number; ongoing: boolean }
  | { type: 'task'; candidates: Candidate[] }
  | { type: 'empty' };

export function recommendNow(ctx: RankContext): NowRecommendation {
  const now = ctx.now ?? nowMin();
  for (const i of ctx.items) {
    if (i.task.kind !== 'event' || !i.time || i.done) continue;
    const start = timeToMin(i.time);
    const end = start + i.duration;
    if (now >= start && now < end) return { type: 'event', item: i, minutes: end - now, ongoing: true };
    if (start > now && start - now <= 15) return { type: 'event', item: i, minutes: start - now, ongoing: false };
  }
  const candidates = rankCandidates({ ...ctx, now });
  return candidates.length ? { type: 'task', candidates } : { type: 'empty' };
}
