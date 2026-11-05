// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BottomSheet } from './BottomSheet';
import { FocusMode } from '../screens/Focus';
import { startTask } from './focusFlow';
import { emptyState, getState, replaceState } from '../store/store';
import { closeAllSheets, getUI, openSheet } from '../store/ui';
import type { Task } from '../domain/types';

let root: Root;
let host: HTMLDivElement;
let outside: HTMLButtonElement;
const task: Task = { id: 'a', title: 'Enviar mensagem', kind: 'task', status: 'active', subtasks: [], postponed: 0, createdAt: 0, updatedAt: 0 };
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-05T12:00:00Z'));
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  document.body.innerHTML = '<button id="outside">Fora</button><div id="host"></div>';
  outside = document.querySelector('#outside')!; host = document.querySelector('#host')!;
  outside.focus(); root = createRoot(host);
  replaceState({ ...emptyState(), tasks: [task, { ...task, id: 'b' }] }); closeAllSheets();
});
afterEach(() => {
  act(() => root.unmount());
  replaceState(emptyState()); closeAllSheets();
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
  document.body.innerHTML = '';
});

describe('execução sem preparação obrigatória', () => {
  it('começa em um toque, preserva a data e conta o tempo sem Pomodoro', () => {
    openSheet({ type: 'task', id: task.id });
    act(() => { startTask(task.id, '2026-11-04'); root.render(<FocusMode />); });
    expect(getUI().sheet).toBeUndefined();
    expect(getState().focus).toMatchObject({ taskId: 'a', date: '2026-11-04', running: true });
    expect(host.textContent).toContain('no seu ritmo');
    act(() => vi.advanceTimersByTime(61000));
    expect(host.querySelector('.timer-value')?.textContent).toBe('01:01');
    expect(document.title).toContain('01:01');
  });
  it('pausa e retoma sem perder o tempo acumulado', () => {
    act(() => { startTask('a'); root.render(<FocusMode />); });
    act(() => vi.advanceTimersByTime(8000));
    act(() => (host.querySelector('[aria-label="Pausar"]') as HTMLButtonElement).click());
    act(() => vi.advanceTimersByTime(15000));
    expect(host.querySelector('.timer-value')?.textContent).toBe('00:08');
    act(() => (host.querySelector('[aria-label="Continuar"]') as HTMLButtonElement).click());
    act(() => vi.advanceTimersByTime(2000));
    expect(host.querySelector('.timer-value')?.textContent).toBe('00:10');
  });
  it('permite optar pelo Pomodoro e voltar à contagem livre', () => {
    act(() => { startTask('a'); root.render(<FocusMode />); });
    act(() => Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('Foco (25m)'))!.click());
    expect(host.querySelector('.timer-value')?.textContent).toBe('25:00');
    act(() => vi.advanceTimersByTime(6000));
    expect(host.querySelector('.timer-value')?.textContent).toBe('24:54');
    act(() => Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('Continuar sem'))!.click());
    expect(host.querySelector('.timer-value')?.textContent).toBe('00:06');
  });
  it('retomar a mesma tarefa não zera o tempo e trocar contabiliza a anterior', () => {
    act(() => { startTask('a'); root.render(<FocusMode />); });
    act(() => vi.advanceTimersByTime(61000));
    act(() => startTask('a'));
    expect(host.querySelector('.timer-value')?.textContent).toBe('01:01');
    act(() => startTask('b'));
    expect(getState().tasks.find(t => t.id === 'a')?.focusMinutes).toBe(1);
    expect(getState().focus?.taskId).toBe('b');
  });
});

describe('modal acessível', () => {
  it('contém Tab/Shift+Tab, isola o fundo e restaura o foco ao sair', () => {
    act(() => root.render(<BottomSheet title="Editar" onClose={() => {}}><button data-autofocus>Primeiro</button><button>Último</button></BottomSheet>));
    const buttons = host.querySelectorAll('button');
    const first = buttons[0], last = buttons[buttons.length - 1];
    expect(outside.hasAttribute('inert')).toBe(true);
    last.focus();
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(first);
    act(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true })));
    expect(document.activeElement).toBe(last);
    outside.focus();
    expect(host.contains(document.activeElement)).toBe(true);
    act(() => root.render(null));
    expect(outside.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(outside);
  });
});
