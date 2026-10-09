import { describe, expect, it } from 'vitest';
import type { Recurrence } from './types';
import { nextOccurrence, occurrencesBefore, occursOn, recurrenceError, recurrenceLabel } from './recurrence';
import { addDays } from './dates';

const dates = (r: Recurrence, from: string, days: number) =>
  Array.from({ length: days }, (_, i) => addDays(from, i)).filter((d) => occursOn(r, d));

describe('recorrência', () => {
  it('a cada 15 dias começando no sábado seguinte (não hoje)', () => {
    const r: Recurrence = { freq: 'daily', interval: 15, anchor: '2026-10-10' };
    expect(occursOn(r, '2026-10-09')).toBe(false);
    expect(dates(r, '2026-10-09', 40)).toEqual(['2026-10-10', '2026-10-25', '2026-11-09']);
  });

  it('formato antigo “interval” continua funcionando', () => {
    const r: Recurrence = { freq: 'interval', interval: 7, anchor: '2026-10-09' };
    expect(dates(r, '2026-10-09', 15)).toEqual(['2026-10-09', '2026-10-16', '2026-10-23']);
  });

  it('a cada 2 semanas, sáb e dom', () => {
    const r: Recurrence = { freq: 'weekly', interval: 2, weekdays: [6, 0], anchor: '2026-10-10' };
    expect(dates(r, '2026-10-09', 22)).toEqual(['2026-10-10', '2026-10-11', '2026-10-24', '2026-10-25']);
  });

  it('todo mês na 2ª sexta e na última sexta', () => {
    const second: Recurrence = { freq: 'monthly', nth: 2, weekday: 5, anchor: '2026-10-09' };
    expect(dates(second, '2026-10-01', 75)).toEqual(['2026-10-09', '2026-11-13', '2026-12-11']);
    const last: Recurrence = { freq: 'monthly', nth: -1, weekday: 5, anchor: '2026-10-30' };
    expect(dates(last, '2026-10-01', 70)).toEqual(['2026-10-30', '2026-11-27']);
  });

  it('a cada 3 meses no dia 31 cai no último dia em meses curtos', () => {
    const r: Recurrence = { freq: 'monthly', interval: 3, monthDay: 31, anchor: '2026-01-31' };
    expect(dates(r, '2026-01-01', 365)).toEqual(['2026-01-31', '2026-04-30', '2026-07-31', '2026-10-31']);
  });

  it('todo ano e a cada 2 anos', () => {
    const r: Recurrence = { freq: 'yearly', month: 9, monthDay: 9, anchor: '2026-10-09' };
    expect(occursOn(r, '2027-10-09')).toBe(true);
    expect(occursOn(r, '2027-10-10')).toBe(false);
    expect(occursOn({ ...r, interval: 2 }, '2027-10-09')).toBe(false);
    expect(occursOn({ ...r, interval: 2 }, '2028-10-09')).toBe(true);
  });

  it('termina numa data ou após N vezes', () => {
    const until: Recurrence = { freq: 'daily', anchor: '2026-10-09', until: '2026-10-11' };
    expect(dates(until, '2026-10-09', 10)).toEqual(['2026-10-09', '2026-10-10', '2026-10-11']);
    const count: Recurrence = { freq: 'weekly', weekdays: [1, 3], anchor: '2026-10-09', count: 3 };
    expect(dates(count, '2026-10-09', 30)).toEqual(['2026-10-12', '2026-10-14', '2026-10-19']);
    expect(occurrencesBefore(count, '2026-10-19')).toBe(2);
  });

  it('próxima ocorrência pula datas puladas', () => {
    const r: Recurrence = { freq: 'daily', anchor: '2026-10-09' };
    expect(nextOccurrence(r, '2026-10-09', ['2026-10-09'])).toBe('2026-10-10');
  });

  it('validação: intervalo vazio ou zero não salva', () => {
    expect(recurrenceError({ freq: 'daily', interval: NaN, anchor: '2026-10-09' })).toBeTruthy();
    expect(recurrenceError({ freq: 'daily', interval: 0, anchor: '2026-10-09' })).toBeTruthy();
    expect(recurrenceError({ freq: 'weekly', weekdays: [], anchor: '2026-10-09' })).toBeTruthy();
    expect(recurrenceError({ freq: 'daily', anchor: '2026-10-09', until: '2026-10-01' })).toBeTruthy();
    expect(recurrenceError({ freq: 'daily', interval: 7, anchor: '2026-10-09' })).toBeUndefined();
  });

  it('textos', () => {
    expect(recurrenceLabel({ freq: 'weekly', weekdays: [6], anchor: '2026-10-10' })).toBe('Todo sábado');
    expect(recurrenceLabel({ freq: 'monthly', nth: -1, weekday: 5, anchor: '2026-10-30' })).toBe('Todo mês, na última sexta');
    expect(recurrenceLabel({ freq: 'daily', interval: 15, anchor: '2026-10-10', count: 4 })).toBe('A cada 15 dias · 4 vezes');
  });
});
