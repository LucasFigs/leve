// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Onboarding } from './Onboarding';
import { PlanSheet } from '../sheets/PlanningSheets';
import { emptyState, getState, replaceState } from '../store/store';

vi.mock('../store/sync', () => ({ useCloud: (select: (c: unknown) => unknown) => select({ user: undefined }) }));
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-05T12:00:00Z'));
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  replaceState(emptyState());
});
afterEach(() => {
  act(() => root.unmount()); host.remove(); replaceState(emptyState());
  vi.clearAllTimers(); vi.useRealTimers();
});
function change(input: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('primeiro uso e disponibilidade', () => {
  it('permite entrar no dia sem nome ou captura obrigatórios', () => {
    act(() => root.render(<Onboarding />));
    act(() => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(getState().settings.onboarded).toBe(true);
    expect(getState().tasks).toHaveLength(0);
  });
  it('salva uma primeira captura e o período escolhido em uma etapa', () => {
    act(() => root.render(<Onboarding />));
    const inputs = host.querySelectorAll<HTMLInputElement>('input');
    change(inputs[1], 'Enviar relatório amanhã às 14h');
    change(inputs[2], '09:00'); change(inputs[3], '17:00');
    act(() => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(getState().tasks).toHaveLength(1);
    expect(getState().tasks[0]).toMatchObject({ time: '14:00' });
    expect(getState().settings).toMatchObject({ onboarded: true, dayStart: '09:00', dayEnd: '17:00' });
  });
  it('não conclui introdução com período inválido', () => {
    act(() => root.render(<Onboarding />));
    change(host.querySelectorAll<HTMLInputElement>('input')[3], '07:00');
    act(() => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(getState().settings.onboarded).toBe(false);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('posterior');
  });
  it('recalcula o plano ao diminuir a disponibilidade e explica a base da estimativa', () => {
    replaceState({ ...emptyState(), tasks: [{ id: 'a', title: 'Relatório', date: '2099-01-05', kind: 'task', status: 'active', duration: 90, subtasks: [], postponed: 0, createdAt: 0, updatedAt: 0 }] });
    act(() => root.render(<PlanSheet date="2099-01-05" />));
    expect(host.textContent).toContain('Encaixei');
    change(host.querySelectorAll<HTMLInputElement>('input[type="time"]')[1], '09:00');
    act(() => Array.from(host.querySelectorAll('button')).find(b => b.textContent === 'Atualizar período')!.click());
    expect(getState().settings.dayEnd).toBe('09:00');
    expect(host.textContent).toContain('Não sobrou espaço livre');
    expect(host.textContent).toContain('Estimativa com base nas tarefas e compromissos do Leve');
    expect(host.textContent).not.toContain('Google Agenda');
  });
});
