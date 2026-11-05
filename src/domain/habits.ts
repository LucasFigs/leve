import type { HabitColor, HabitIcon, Task } from './types';
import { addDays, fromISODate, weekdayOf } from './dates';
import type { IconName } from '../components/Icon';
import { nextOccurrence, occursOn, recurrenceLabel } from './recurrence';

export interface HabitTheme {
  name: HabitColor;
  primary: string;
  glow: string;
  bgLight: string;
  border: string;
}

export const HABIT_THEMES: HabitTheme[] = [
  { name: 'emerald', primary: '#10b981', glow: 'rgba(16, 185, 129, 0.35)', bgLight: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.3)' },
  { name: 'coral', primary: '#f43f5e', glow: 'rgba(244, 63, 94, 0.35)', bgLight: 'rgba(244, 63, 94, 0.12)', border: 'rgba(244, 63, 94, 0.3)' },
  { name: 'cyan', primary: '#06b6d4', glow: 'rgba(6, 182, 212, 0.35)', bgLight: 'rgba(6, 182, 212, 0.12)', border: 'rgba(6, 182, 212, 0.3)' },
  { name: 'blue', primary: '#3b82f6', glow: 'rgba(59, 130, 246, 0.35)', bgLight: 'rgba(59, 130, 246, 0.12)', border: 'rgba(59, 130, 246, 0.3)' },
  { name: 'purple', primary: '#a855f7', glow: 'rgba(168, 85, 247, 0.35)', bgLight: 'rgba(168, 85, 247, 0.12)', border: 'rgba(168, 85, 247, 0.3)' },
  { name: 'amber', primary: '#f59e0b', glow: 'rgba(245, 158, 11, 0.35)', bgLight: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.3)' },
];

export const HABIT_COLORS: { value: HabitColor; label: string }[] = [
  { value: 'emerald', label: 'Verde' }, { value: 'coral', label: 'Rosa' },
  { value: 'cyan', label: 'Turquesa' }, { value: 'blue', label: 'Azul' },
  { value: 'purple', label: 'Roxo' }, { value: 'amber', label: 'Âmbar' },
];
export const HABIT_ICONS: { value: HabitIcon; label: string }[] = [
  { value: 'activity', label: 'Movimento' }, { value: 'droplet', label: 'Água' },
  { value: 'book', label: 'Leitura' }, { value: 'laptop', label: 'Estudo e trabalho' },
  { value: 'heart', label: 'Bem-estar' }, { value: 'target', label: 'Objetivo' },
  { value: 'bolt', label: 'Energia' }, { value: 'leaf', label: 'Natureza' },
  { value: 'sun', label: 'Manhã' }, { value: 'moon', label: 'Descanso' }, { value: 'coffee', label: 'Pausa' },
];

export function getHabitTheme(task: Task): HabitTheme {
  const chosen = HABIT_THEMES.find(theme => theme.name === task.habitColor);
  if (chosen) return chosen;
  const THEMES = HABIT_THEMES;
  if (task.category === 'saude') return THEMES[0]; // emerald
  if (task.category === 'pessoal') return THEMES[1]; // coral
  if (task.category === 'estudos') return THEMES[2]; // cyan
  if (task.category === 'trabalho') return THEMES[3]; // blue
  if (task.category === 'financas') return THEMES[5]; // amber

  // Baseado no hash do id ou título
  const str = task.id || task.title || '';
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  return THEMES[hash % THEMES.length];
}

export function getHabitIcon(task: Task): IconName {
  if (HABIT_ICONS.some(icon => icon.value === task.habitIcon)) return task.habitIcon!;
  const t = (task.title + ' ' + (task.notes ?? '')).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
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

  const skipped = new Set(task.skipDates ?? []);
  const completed = [...dates].filter(date => date <= today && !skipped.has(date) && (!task.recurrence || occursOn(task.recurrence, date))).sort().reverse();
  if (!completed.length) return 0;
  const next = (date: string) => task.recurrence ? nextOccurrence(task.recurrence, addDays(date, 1), task.skipDates) : addDays(date, 1);
  // Hoje ainda pode ser realizado. Descansos e ocorrências puladas não rompem a sequência.
  const pending = next(completed[0]);
  if (pending && pending < today) return 0;
  let count = 1;
  for (let i = 1; i < completed.length; i++) {
    if (next(completed[i]) !== completed[i - 1]) break;
    count++;
  }
  return count;
}

export function getHabitTargetLabel(task: Task): string {
  return task.recurrence ? recurrenceLabel(task.recurrence, { ends: false }) : 'Sem repetição';
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

export interface MonthCalendarCell {
  date: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  isFuture: boolean;
}

/**
 * Constrói a matriz mensal para o calendário de hábitos (iniciando em Domingo = 0 até Sábado = 6).
 */
export function buildMonthCalendar(year: number, month: number, today: string): MonthCalendarCell[][] {
  const firstDate = new Date(year, month, 1);
  const firstDayOfWeek = firstDate.getDay(); // 0 = Domingo

  // Recua até o domingo anterior ou o próprio domingo se dia 1 for domingo
  const startDate = new Date(year, month, 1 - firstDayOfWeek);
  const weeks: MonthCalendarCell[][] = [];
  const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

  for (let w = 0; w < 6; w++) {
    const week: MonthCalendarCell[] = [];
    for (let d = 0; d < 7; d++) {
      const y = cursor.getFullYear();
      const m = String(cursor.getMonth() + 1).padStart(2, '0');
      const day = String(cursor.getDate()).padStart(2, '0');
      const iso = `${y}-${m}-${day}`;

      week.push({
        date: iso,
        dayNumber: cursor.getDate(),
        isCurrentMonth: cursor.getMonth() === month,
        isToday: iso === today,
        isFuture: iso > today,
      });

      cursor.setDate(cursor.getDate() + 1);
    }
    weeks.push(week);

    // Se a próxima semana já pertence ao próximo mês e já temos pelo menos 4 semanas completas:
    if (cursor.getMonth() !== month && weeks.length >= 4) {
      break;
    }
  }

  return weeks;
}


