import { describe, expect, it } from 'vitest';
import { dayCapacity } from './planner';
import type { Settings, Task } from './types';

const settings: Settings = {
  name: '', theme: 'system', dayStart: '08:00', dayEnd: '18:00', defaultDuration: 30,
  protectLunch: true, lunchStart: '12:00', lunchEnd: '13:00', nudges: true, onboarded: true,
};
// Um dia futuro: a janela começa em dayStart (não depende do relógio)
const DAY = '2099-01-05';
let n = 0;
const task = (p: Partial<Task>): Task => ({
  id: `t${n++}`, title: 'x', kind: 'task', status: 'active', subtasks: [], postponed: 0,
  createdAt: 0, updatedAt: 0, date: DAY, ...p,
});

describe('dayCapacity', () => {
  it('desconta almoço e compromissos do tempo livre', () => {
    const c = dayCapacity([task({ kind: 'event', time: '09:00', duration: 60 })], DAY, settings);
    // 10h de janela − 1h almoço − 1h compromisso
    expect(c.free).toBe(8 * 60);
    expect(c.status).toBe('ok');
  });

  it('marca "apertado" acima de 80% e "não cabe" acima do livre', () => {
    const full = dayCapacity([task({ duration: 9 * 60 - 30 })], DAY, settings); // 8h30 de 9h livres
    expect(full.status).toBe('tight');
    const over = dayCapacity([task({ duration: 10 * 60 })], DAY, settings);
    expect(over.status).toBe('over');
  });

  it('ignora tarefas concluídas e soma o que falta', () => {
    const c = dayCapacity(
      [task({ duration: 45 }), task({ duration: 30, status: 'done' }), task({ duration: 60, time: '14:00' })],
      DAY,
      settings,
    );
    expect(c.unscheduled).toBe(45);
    expect(c.left).toBe(105);
  });

  it('dia encerrado quando o horário já passou', () => {
    const c = dayCapacity([task({ duration: 30 })], DAY, settings, 0);
    expect(c.status).toBe('ok');
    const late = dayCapacity([task({ duration: 30 })], DAY, { ...settings, dayStart: '18:00', dayEnd: '18:00' });
    expect(late.status).toBe('ended');
  });
});
