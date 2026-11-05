import { describe, expect, it } from 'vitest';
import { recommendNow, type RankContext } from './priority';
import { DEFAULT_SETTINGS } from '../store/store';
import type { DayItem, Task } from './types';

const day = '2026-11-05';
const task = (p: Partial<Task>): Task => ({ id: 't', title: 'Tarefa', kind: 'task', status: 'active', subtasks: [], postponed: 0, createdAt: 0, updatedAt: 0, date: day, ...p });
const item = (p: Partial<Task>): DayItem => {
  const t = task(p);
  return { task: t, date: day, time: t.time, duration: t.duration ?? 30, done: t.status === 'done', missed: false, recurring: false };
};
const context = (items: DayItem[], now = 9 * 60): RankContext => ({ today: day, now, items, overdue: [], unscheduled: [], settings: { ...DEFAULT_SETTINGS, dayEnd: '18:00' } });

describe('recomendação para o momento atual', () => {
  it('não antecipa tarefa futura em vez de tarefa essencial disponível', () => {
    const result = recommendNow(context([item({ id: 'future', time: '18:00' }), item({ id: 'now', priority: 'essential' })]));
    expect(result.type).toBe('task');
    if (result.type === 'task') expect(result.candidates.map(c => c.item.task.id)).toEqual(['now']);
  });
  it('mostra a próxima agendada sem convidar a começar antes da hora', () => {
    expect(recommendNow(context([item({ time: '11:00' })]))).toMatchObject({ type: 'scheduled', minutes: 120 });
  });
  it('sugere apenas o que cabe antes do próximo bloqueio', () => {
    const result = recommendNow(context([item({ id: 'long', duration: 90 }), item({ id: 'short', duration: 15 }), item({ id: 'event', kind: 'event', time: '09:30' })]));
    expect(result.type).toBe('task');
    if (result.type === 'task') expect(result.candidates.map(c => c.item.task.id)).toEqual(['short']);
  });
  it('considera apenas o tempo restante de uma tarefa já em execução', () => {
    expect(recommendNow(context([item({ time: '09:00', duration: 60 })], 9 * 60 + 50)).type).toBe('task');
  });
  it('não inicia tarefa durante o almoço ou após o período escolhido', () => {
    expect(recommendNow(context([item({})], 12 * 60 + 10))).toMatchObject({ type: 'empty', reason: expect.stringContaining('pausa') });
    expect(recommendNow(context([item({})], 19 * 60))).toMatchObject({ type: 'empty', reason: expect.stringContaining('terminou') });
    expect(recommendNow(context([item({})], 7 * 60))).toMatchObject({ type: 'empty', reason: expect.stringContaining('começa') });
  });
  it('não encaixa tarefa que atravessa o almoço ou o fim do dia', () => {
    expect(recommendNow(context([item({ duration: 30 })], 11 * 60 + 50)).type).toBe('empty');
    expect(recommendNow(context([item({ duration: 30 })], 17 * 60 + 50)).type).toBe('empty');
  });
  it('ordena compromissos e dá contexto ao compromisso em andamento', () => {
    expect(recommendNow(context([item({ time: '14:00', kind: 'event' }), item({ id: 'current', time: '09:00', kind: 'event' })], 9 * 60 + 5))).toMatchObject({ type: 'event', item: { task: { id: 'current' } }, ongoing: true });
  });
  it('não duplica tarefas já presentes quando também aparecem nas pendências', () => {
    const ctx = context([item({ priority: 'essential' })]);
    ctx.unscheduled = [ctx.items[0].task];
    const result = recommendNow(ctx);
    if (result.type !== 'task') throw new Error('Esperada uma tarefa');
    expect(result.candidates).toHaveLength(1);
  });
});
