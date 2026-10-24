import type { Task } from './types';
import { addDays, fromISODate, weekdayOf } from './dates';
import type { IconName } from '../components/Icon';

export interface HabitTheme {
  name: string;
  primary: string;
  glow: string;
  bgLight: string;
  border: string;
}

const THEMES: HabitTheme[] = [
  { name: 'emerald', primary: '#10b981', glow: 'rgba(16, 185, 129, 0.35)', bgLight: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)' },
  { name: 'coral', primary: '#f43f5e', glow: 'rgba(244, 63, 94, 0.35)', bgLight: 'rgba(244, 63, 94, 0.12)', border: 'rgba(244, 63, 94, 0.3)' },
  { name: 'cyan', primary: '#06b6d4', glow: 'rgba(6, 182, 212, 0.35)', bgLight: 'rgba(6, 182, 212, 0.12)', border: 'rgba(6, 182, 212, 0.3)' },
  { name: 'blue', primary: '#3b82f6', glow: 'rgba(59, 130, 246, 0.35)', bgLight: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.3)' },
  { name: 'purple', primary: '#a855f7', glow: 'rgba(168, 85, 247, 0.35)', bgLight: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.3)' },
  { name: 'amber', primary: '#f59e0b', glow: 'rgba(245, 158, 11, 0.35)', bgLight: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)' },
];

export function getHabitTheme(task: Task, index: number = 0): HabitTheme {
  if (task.category === 'saude') return THEMES[0]; // emerald
  if (task.category === 'pessoal') return THEMES[1]; // coral
  if (task.category === 'estudos') return THEMES[2]; // cyan
  if (task.category === 'trabalho') return THEMES[3]; // blue
  if (task.category === 'financas') return THEMES[5]; // amber

  // Baseado no hash do id ou título
  const str = task.id || task.title || '';
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return THEMES[(hash + index) % THEMES.length];
}

export function getHabitIcon(task: Task): IconName {
  const t = (task.title + ' ' + (task.notes ?? '')).toLowerCase();
  if (/treino|academia|gym|muscula|exerc|saude|peso|corrida|aerob|correr/.test(t)) return 'activity';
  if (/agua|beber|hidrat|copo/.test(t)) return 'droplet';
  if (/leitura|ler|livro|diario|journal|escrever|escrev/.test(t)) return 'book';
  if (/foco|estud|trabalho|work|deep|codigo|program|computador/.test(t)) return 'laptop';
  if (/medit|respir|dormir|sono|descans/.test(t)) return 'heart';
  if (/meta|planej|habito|disciplina/.test(t)) return 'target';
  return 'bolt';
}

export function getHabitStreak(task: Task, today: string): number {
  const dates = new Set(task.doneDates ?? []);
  if (task.status === 'done' && task.date) dates.add(task.date);

  let count = 0;
  let cursor = today;

  // Se ainda não concluiu hoje, começa checando a partir de ontem para não quebrar a sequência
  if (!dates.has(cursor)) {
    cursor = addDays(cursor, -1);
  }

  while (dates.has(cursor)) {
    count++;
    cursor = addDays(cursor, -1);
  }

  return count;
}

export function getHabitTargetLabel(task: Task): string {
  const r = task.recurrence;
  if (!r) return 'Diário';

  if (r.freq === 'daily') {
    if (r.interval && r.interval > 1) return `A cada ${r.interval} dias`;
    return 'Diário';
  }

  if (r.freq === 'weekly') {
    if (r.weekdays && r.weekdays.length > 0) {
      if (r.weekdays.length === 7) return 'Diário';
      return `${r.weekdays.length} / Semana`;
    }
    return 'Semanal';
  }

  if (r.freq === 'interval' && r.interval) {
    if (r.interval === 2) return 'Dias alternados';
    return `A cada ${r.interval} dias`;
  }

  if (r.freq === 'monthly') return 'Mensal';

  return 'Diário';
}

export interface GridDay {
  date: string;
  dayOfWeek: number;
  isFuture: boolean;
  isToday: boolean;
}

export interface GridWeek {
  days: GridDay[];
  monthLabel?: string;
}

const MONTH_NAMES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

/**
 * Constrói as semanas da matriz de hábitos terminando na semana atual.
 * Exibe ~20 a 24 semanas (aproximadamente 5 meses).
 */
export function buildHabitGrid(today: string, totalWeeks = 22): GridWeek[] {
  // Encontra o sábado da semana atual (último dia da coluna desta semana, onde domingo = 0 e sábado = 6)
  const todayWd = weekdayOf(today); // 0 = Domingo, 6 = Sábado
  const endOfWeekOffset = 6 - todayWd;
  const currentWeekSaturday = addDays(today, endOfWeekOffset);

  // Calcula o domingo inicial (totalWeeks atrás)
  const totalDays = totalWeeks * 7;
  const startSunday = addDays(currentWeekSaturday, -totalDays + 1);

  const weeks: GridWeek[] = [];
  let lastMonthSeen = -1;

  for (let w = 0; w < totalWeeks; w++) {
    const days: GridDay[] = [];
    let weekMonthLabel: string | undefined;

    for (let d = 0; d < 7; d++) {
      const dateStr = addDays(startSunday, w * 7 + d);
      const isToday = dateStr === today;
      const isFuture = dateStr > today;
      days.push({
        date: dateStr,
        dayOfWeek: d,
        isFuture,
        isToday,
      });

      const dateObj = fromISODate(dateStr);
      const m = dateObj.getMonth();
      // Mostra o rótulo do mês na primeira semana em que ele aparece
      if (m !== lastMonthSeen && dateObj.getDate() <= 7) {
        weekMonthLabel = MONTH_NAMES[m];
        lastMonthSeen = m;
      }
    }

    weeks.push({ days, monthLabel: weekMonthLabel });
  }

  return weeks;
}

