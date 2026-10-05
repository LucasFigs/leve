export const WEEKDAYS_SHORT = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
export const WEEKDAYS_LONG = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
export const MONTHS_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const MONTHS_LONG = [
  'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
  'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
];

export const pad = (n: number) => String(n).padStart(2, '0');

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDays(iso: string, n: number): string {
  const d = fromISODate(iso);
  d.setDate(d.getDate() + n);
  return toISODate(d);
}

/** a − b em dias */
export function diffDays(a: string, b: string): number {
  return Math.round((fromISODate(a).getTime() - fromISODate(b).getTime()) / 86_400_000);
}

export function weekdayOf(iso: string): number {
  return fromISODate(iso).getDay();
}

/** Segunda-feira da semana de `iso`. */
export function startOfWeek(iso: string): string {
  const wd = weekdayOf(iso);
  return addDays(iso, wd === 0 ? -6 : 1 - wd);
}

export function timeToMin(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + (m || 0);
}

export function minToTime(m: number): string {
  const c = Math.max(0, Math.min(24 * 60 - 1, Math.round(m)));
  return `${pad(Math.floor(c / 60))}:${pad(c % 60)}`;
}

export function nowMin(): number {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
}

export function roundUpTo(min: number, step = 15): number {
  return Math.ceil(min / step) * step;
}

export function formatDuration(min?: number): string {
  if (!min) return '';
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h}h${pad(m)}` : `${h}h`;
}

/** “Hoje”, “Amanhã”, “Ontem”, “sáb, 11 out” */
export function formatDay(iso: string, ref = todayISO(), opts: { long?: boolean } = {}): string {
  const diff = diffDays(iso, ref);
  if (diff === 0) return 'Hoje';
  if (diff === 1) return 'Amanhã';
  if (diff === -1) return 'Ontem';
  const d = fromISODate(iso);
  if (diff > 1 && diff < 7 && !opts.long) {
    const name = WEEKDAYS_LONG[d.getDay()];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  const wd = WEEKDAYS_SHORT[d.getDay()];
  return `${wd.charAt(0).toUpperCase() + wd.slice(1)}, ${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

export function formatLongDate(iso: string): string {
  const d = fromISODate(iso);
  return `${WEEKDAYS_LONG[d.getDay()]}, ${d.getDate()} de ${MONTHS_LONG[d.getMonth()]}`;
}

export function greeting(date = new Date()): string {
  const h = date.getHours();
  if (h < 5) return 'Boa noite';
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

/** Matriz de semanas (segunda a domingo) para o mês. */
export function monthMatrix(year: number, month: number): string[][] {
  const first = toISODate(new Date(year, month, 1));
  let cursor = startOfWeek(first);
  const weeks: string[][] = [];
  for (let w = 0; w < 6; w++) {
    const week: string[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(cursor);
      cursor = addDays(cursor, 1);
    }
    weeks.push(week);
    if (fromISODate(cursor).getMonth() !== month) break;
  }
  return weeks;
}

export function dayOfTimestamp(ts: number): string {
  return toISODate(new Date(ts));
}
