/** Regras de repetição no estilo Google Agenda / Outlook. */
import type { Freq, Recurrence } from './types';
import { addDays, diffDays, fromISODate, MONTHS_LONG, MONTHS_SHORT, startOfWeek, WEEKDAYS_LONG, WEEKDAYS_SHORT } from './dates';

export const freqOf = (r: Recurrence): Freq => (r.freq === 'interval' ? 'daily' : r.freq);
export const intervalOf = (r: Recurrence) => Math.max(1, Math.floor(r.interval ?? 1) || 1);

/** Converte o formato antigo (“interval”) para o atual. */
export function normalizeRecurrence(r: Recurrence): Recurrence {
  return r.freq === 'interval' ? { ...r, freq: 'daily' } : r;
}

const lastDayOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

/** Posição do dia da semana no mês: 1–5 (a partir do início) e se é o último. */
export function nthOfMonth(iso: string): { nth: number; last: boolean } {
  const d = fromISODate(iso);
  return { nth: Math.ceil(d.getDate() / 7), last: d.getDate() + 7 > lastDayOfMonth(d) };
}

function dayMatches(r: Recurrence, d: Date, anchor: Date): boolean {
  if (r.nth != null && r.weekday != null) {
    if (d.getDay() !== r.weekday) return false;
    return r.nth < 0 ? d.getDate() + 7 > lastDayOfMonth(d) : Math.ceil(d.getDate() / 7) === r.nth;
  }
  // Dia 31 em mês curto cai no último dia do mês
  return d.getDate() === Math.min(r.monthDay ?? anchor.getDate(), lastDayOfMonth(d));
}

/** A data segue a regra (sem considerar término por número de vezes). */
function matchesRule(r: Recurrence, date: string): boolean {
  if (date < r.anchor) return false;
  if (r.until && date > r.until) return false;
  const n = intervalOf(r);
  const d = fromISODate(date);
  const a = fromISODate(r.anchor);
  switch (freqOf(r)) {
    case 'daily':
      return diffDays(date, r.anchor) % n === 0;
    case 'weekly': {
      const days = r.weekdays?.length ? r.weekdays : [a.getDay()];
      if (!days.includes(d.getDay())) return false;
      return (diffDays(startOfWeek(date), startOfWeek(r.anchor)) / 7) % n === 0;
    }
    case 'monthly': {
      const months = (d.getFullYear() - a.getFullYear()) * 12 + d.getMonth() - a.getMonth();
      return months % n === 0 && dayMatches(r, d, a);
    }
    case 'yearly': {
      if ((d.getFullYear() - a.getFullYear()) % n !== 0) return false;
      return d.getMonth() === (r.month ?? a.getMonth()) && dayMatches(r, d, a);
    }
  }
}

/** Última data de uma série que termina após N ocorrências (em cache por regra). */
const lastByCount = new WeakMap<Recurrence, string>();
function lastOccurrence(r: Recurrence): string {
  const cached = lastByCount.get(r);
  if (cached) return cached;
  let left = Math.max(1, r.count ?? 1);
  let cursor = r.anchor;
  let last = r.anchor;
  for (let i = 0; i < 366 * 60 && left > 0; i++, cursor = addDays(cursor, 1)) {
    if (matchesRule(r, cursor)) {
      last = cursor;
      left--;
    }
  }
  lastByCount.set(r, last);
  return last;
}

export function occursOn(r: Recurrence, date: string): boolean {
  if (!matchesRule(r, date)) return false;
  return !r.count || date <= lastOccurrence(r);
}

/** Quantas ocorrências há antes de `date` (para dividir uma série). */
export function occurrencesBefore(r: Recurrence, date: string): number {
  let n = 0;
  for (let c = r.anchor; c < date; c = addDays(c, 1)) if (occursOn(r, c)) n++;
  return n;
}

/** Próxima ocorrência a partir de `from` (inclusive). */
export function nextOccurrence(r: Recurrence, from: string, skip: string[] = []): string | undefined {
  let c = from < r.anchor ? r.anchor : from;
  for (let i = 0; i < 366 * 5; i++, c = addDays(c, 1)) {
    if (r.until && c > r.until) return undefined;
    if (occursOn(r, c) && !skip.includes(c)) return c;
  }
  return undefined;
}

/* ------------------------------------------------------------------ */
/* Textos                                                              */
/* ------------------------------------------------------------------ */

/** sábado e domingo são masculinos (“todo sábado”, “o último domingo”). */
const masc = (wd: number) => wd === 0 || wd === 6;

export function ordinalWeekday(nth: number, wd: number): string {
  const m = masc(wd);
  const pos = nth < 0 ? (m ? 'último' : 'última') : `${nth}${m ? 'º' : 'ª'}`;
  return `${pos} ${WEEKDAYS_LONG[wd]}`;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : `${n} ${many}`);

function dayPart(r: Recurrence, a: Date): string {
  if (r.nth != null && r.weekday != null) return `${masc(r.weekday) ? 'no' : 'na'} ${ordinalWeekday(r.nth, r.weekday)}`;
  return `no dia ${r.monthDay ?? a.getDate()}`;
}

function sortWeekdays(days: number[]) {
  return [...days].sort((x, y) => ((x + 6) % 7) - ((y + 6) % 7));
}

export function recurrenceLabel(r: Recurrence, opts: { ends?: boolean } = { ends: true }): string {
  const n = intervalOf(r);
  const a = fromISODate(r.anchor);
  let base: string;
  switch (freqOf(r)) {
    case 'daily':
      base = n === 1 ? 'Todo dia' : `A cada ${n} dias`;
      break;
    case 'weekly': {
      const days = sortWeekdays(r.weekdays?.length ? r.weekdays : [a.getDay()]);
      const list = days.length === 1 ? WEEKDAYS_LONG[days[0]] : days.map((d) => WEEKDAYS_SHORT[d]).join(', ');
      if (n === 1) {
        if (days.join() === '1,2,3,4,5') base = 'Dias úteis';
        else if (days.length === 7) base = 'Todo dia';
        else if (days.length === 1) base = `${masc(days[0]) ? 'Todo' : 'Toda'} ${list}`;
        else base = `Toda semana: ${list}`;
      } else base = `A cada ${n} semanas: ${list}`;
      break;
    }
    case 'monthly': {
      const part = dayPart(r, a);
      if (n === 1 && r.nth == null) base = `Todo dia ${r.monthDay ?? a.getDate()}`;
      else base = `${n === 1 ? 'Todo mês' : `A cada ${n} meses`}, ${part}`;
      break;
    }
    case 'yearly': {
      const month = MONTHS_LONG[r.month ?? a.getMonth()];
      const when =
        r.nth != null && r.weekday != null
          ? `${masc(r.weekday) ? 'no' : 'na'} ${ordinalWeekday(r.nth, r.weekday)} de ${month}`
          : `em ${r.monthDay ?? a.getDate()} de ${month}`;
      base = `${n === 1 ? 'Todo ano' : `A cada ${n} anos`} ${when}`;
      break;
    }
  }
  if (opts.ends) {
    if (r.count) base += ` · ${plural(r.count, '1 vez', 'vezes')}`;
    else if (r.until) {
      const u = fromISODate(r.until);
      base += ` · até ${u.getDate()} ${MONTHS_SHORT[u.getMonth()]}${u.getFullYear() !== new Date().getFullYear() ? ` ${u.getFullYear()}` : ''}`;
    }
  }
  return base;
}

export const UNIT_LABEL: Record<Freq, [string, string]> = {
  daily: ['dia', 'dias'],
  weekly: ['semana', 'semanas'],
  monthly: ['mês', 'meses'],
  yearly: ['ano', 'anos'],
};

/** Mensagem de erro para impedir salvar uma regra incompleta. */
export function recurrenceError(r?: Recurrence): string | undefined {
  if (!r) return;
  if (!r.anchor) return 'Escolha quando a repetição começa.';
  if (r.interval !== undefined && (!Number.isFinite(r.interval) || r.interval < 1)) return 'Informe de quanto em quanto tempo repete (1 ou mais).';
  if (r.interval !== undefined && r.interval > 999) return 'O intervalo pode ser no máximo 999.';
  if (freqOf(r) === 'weekly' && r.weekdays && r.weekdays.length === 0) return 'Escolha pelo menos um dia da semana.';
  if (r.count !== undefined && (!Number.isFinite(r.count) || r.count < 1)) return 'Informe quantas vezes repete (1 ou mais).';
  if (r.until === '') return 'Escolha a data de término.';
  if (r.until !== undefined && r.until < r.anchor) return 'A data de término precisa ser depois do início.';
}
