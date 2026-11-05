import { describe, expect, it } from 'vitest';
import { isDate, isTask, isMeta } from './validation';

describe('dados não confiáveis', () => {
  it('rejeita datas impossíveis e estruturas malformadas', () => {
    expect(isDate('2026-02-30')).toBe(false);
    expect(isDate('2026-11-04')).toBe(true);
    expect(isTask(null)).toBe(false);
    expect(isMeta({ settings: { reminderLead: '10' } })).toBe(false);
    expect(isMeta({ settings: { reminders: true, reminderLead: 10 } })).toBe(true);
  });
  it('rejeita arrays e recorrências inválidos sem entrar nas regras de domínio', () => {
    const base = { id: 'a', title: 'Tarefa', kind: 'task', status: 'active', subtasks: [], postponed: 0, createdAt: 0, updatedAt: 0 };
    expect(isTask(base)).toBe(true);
    expect(isTask({ ...base, doneDates: 'not-an-array' })).toBe(false);
    expect(isTask({ ...base, recurrence: { freq: 'weekly', anchor: '2026-11-04', weekdays: 'bad' } })).toBe(false);
  });
});
