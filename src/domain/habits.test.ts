import { describe, expect, it } from 'vitest';
import type { Task } from './types';
import { getHabitIcon, getHabitStreak, getHabitTargetLabel, getHabitTheme } from './habits';
import { isTask } from './validation';

const habit: Task = { id: 'habit-a', title: 'Caminhar', kind: 'habit', status: 'active', subtasks: [], postponed: 0, createdAt: 0, updatedAt: 0, recurrence: { freq: 'weekly', weekdays: [1, 2, 3, 4, 5], anchor: '2026-10-26' } };
describe('identidade dos hábitos', () => {
  it('prioriza a escolha explícita e mantém a cor ao alterar título e conclusão', () => {
    expect(getHabitTheme({ ...habit, category: 'saude', habitColor: 'purple' }).name).toBe('purple');
    expect(getHabitIcon({ ...habit, habitIcon: 'moon' })).toBe('moon');
    expect(getHabitTheme({ ...habit, title: 'Outro nome', doneDates: ['2026-11-05'] }).name).toBe(getHabitTheme(habit).name);
    expect(getHabitTheme({ ...habit, category: 'saude' }).name).toBe('emerald');
  });
  it('reconhece títulos com acentos e só aceita opções da paleta/lista de ícones', () => {
    expect(getHabitIcon({ ...habit, title: 'Água' })).toBe('droplet');
    expect(isTask({ ...habit, habitIcon: 'leaf', habitColor: 'blue' })).toBe(true);
    expect(isTask({ ...habit, habitColor: 'url(https://invalid.test)' })).toBe(false);
    expect(isTask({ ...habit, habitIcon: '<script>' })).toBe(false);
    expect(isTask(habit)).toBe(true);
  });
  it('descreve dias definidos sem confundir com uma meta semanal flexível', () => {
    expect(getHabitTargetLabel(habit)).toContain('Dias úteis');
    expect(getHabitTargetLabel({ ...habit, recurrence: { freq: 'yearly', anchor: '2026-01-01' } })).toContain('janeiro');
  });
});
describe('sequência dos dias programados', () => {
  it('atravessa descanso no fim de semana e preserva segunda-feira ainda pendente', () => {
    const doneDates = ['2026-10-29', '2026-10-30'];
    expect(getHabitStreak({ ...habit, doneDates }, '2026-11-01')).toBe(2);
    expect(getHabitStreak({ ...habit, doneDates }, '2026-11-02')).toBe(2);
    expect(getHabitStreak({ ...habit, doneDates: [...doneDates, '2026-11-02'] }, '2026-11-02')).toBe(3);
    expect(getHabitStreak({ ...habit, doneDates }, '2026-11-03')).toBe(0);
  });
  it('reinicia após uma ocorrência pendente, ignorando registros fora da regra ou futuros', () => {
    expect(getHabitStreak({ ...habit, doneDates: ['2026-10-30', '2026-11-01', '2026-11-03', '2026-11-04', '2026-11-06'] }, '2026-11-05')).toBe(2);
  });
  it('respeita ocorrências puladas e não conta duas vezes a mesma conclusão', () => {
    expect(getHabitStreak({ ...habit, skipDates: ['2026-11-02'], doneDates: ['2026-10-30', '2026-10-30', '2026-11-03'] }, '2026-11-04')).toBe(2);
  });
  it('acompanha dias alternados, frequência mensal e término da série', () => {
    expect(getHabitStreak({ ...habit, recurrence: { freq: 'daily', interval: 2, anchor: '2026-11-01' }, doneDates: ['2026-11-01', '2026-11-03'] }, '2026-11-05')).toBe(2);
    expect(getHabitStreak({ ...habit, recurrence: { freq: 'monthly', anchor: '2026-08-31' }, doneDates: ['2026-08-31', '2026-09-30', '2026-10-31'] }, '2026-11-05')).toBe(3);
    expect(getHabitStreak({ ...habit, recurrence: { freq: 'daily', count: 2, anchor: '2026-11-01' }, doneDates: ['2026-11-01', '2026-11-02', '2026-11-03'] }, '2026-11-05')).toBe(2);
  });
  it('retorna zero sem registros válidos, mesmo com um início distante', () => {
    expect(getHabitStreak({ ...habit, recurrence: { freq: 'daily', anchor: '1900-01-01' } }, '2026-11-05')).toBe(0);
  });
});
