// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskSheet } from './TaskSheet';
import { InboxScreen } from '../screens/Inbox';
import { emptyState, getState, replaceState } from '../store/store';
import { closeAllSheets, getUI, openSheet, useUI } from '../store/ui';
import { todayISO } from '../domain/dates';
import type { Task } from '../domain/types';

vi.mock('../store/sync', () => ({ cloudEnabled: false, useCloud: (select: (value: unknown) => unknown) => select({ auth: 'out' }) }));
vi.mock('../services/googleCalendar', () => ({ useGoogleCalendar: (select: (value: unknown) => unknown) => select({ connected: false, autoSync: false }) }));

let root: Root;
let host: HTMLDivElement;
const base: Task = { id: 'a', title: 'Preparar relatório', status: 'active', kind: 'task', date: '2026-11-05', duration: 30, notes: 'Trazer os dados\nRevisar com calma', subtasks: [{ id: 's', title: 'Reunir dados', done: false }], postponed: 0, createdAt: 0, updatedAt: 0 };
function SheetHost() {
  const sheet = useUI(s => s.sheet);
  return sheet?.type === 'task' ? <TaskSheet key={sheet.id} id={sheet.id} date={sheet.date} /> : null;
}
function button(text: string) {
  const found = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.trim() === text);
  if (!found) throw new Error(`Botão não encontrado: ${text}`);
  return found;
}
function change(input: HTMLTextAreaElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-05T12:00:00Z'));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  replaceState({ ...emptyState(), tasks: [base] }); closeAllSheets();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount()); host.remove(); replaceState(emptyState()); closeAllSheets();
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
});
function openTask() {
  act(() => { openSheet({ type: 'task', id: 'a' }); root.render(<SheetHost />); });
}

describe('consulta e edição de tarefas', () => {
  it('abre em consulta, marca passos imediatamente e não inicia um rascunho', () => {
    openTask();
    expect(host.querySelector('h2')?.textContent).toBe(base.title);
    expect(host.querySelector('textarea')).toBeNull();
    expect(host.textContent).toContain(base.notes);
    act(() => (host.querySelector('[aria-label="Concluir passo: Reunir dados"]') as HTMLButtonElement).click());
    expect(getState().tasks[0].subtasks[0].done).toBe(true);
    expect(host.textContent).toContain('1 de 1');
    expect(host.querySelector('textarea')).toBeNull();
    act(() => (host.querySelector('[aria-label="Fechar"]') as HTMLButtonElement).click());
    expect(window.confirm).not.toHaveBeenCalled();
  });
  it('só edita ao escolher Editar e cancelar preserva título e passos já concluídos', () => {
    openTask();
    act(() => (host.querySelector('[aria-label="Concluir passo: Reunir dados"]') as HTMLButtonElement).click());
    act(() => button('Editar').click());
    change(host.querySelector<HTMLTextAreaElement>('[aria-label="Título"]')!, 'Outro título');
    expect(getState().tasks[0].title).toBe(base.title);
    act(() => button('Cancelar').click());
    expect(host.querySelector('textarea')).toBeNull();
    expect(host.querySelector('h2')?.textContent).toBe(base.title);
    expect(getState().tasks[0].subtasks[0].done).toBe(true);
  });
  it('salva alterações explícitas e mantém a escolha de alcance para recorrências', () => {
    replaceState({ ...emptyState(), tasks: [{ ...base, date: undefined, recurrence: { freq: 'daily', anchor: todayISO() } }] });
    openTask();
    act(() => button('Editar').click());
    change(host.querySelector<HTMLTextAreaElement>('[aria-label="Título"]')!, 'Série atualizada');
    act(() => button('Salvar alterações').click());
    expect(host.textContent).toContain('Onde aplicar as alterações?');
    expect(getState().tasks[0].title).toBe(base.title);
    act(() => Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('Todas as ocorrências'))!.click());
    expect(getState().tasks[0].title).toBe('Série atualizada');
    expect(getUI().sheet).toBeUndefined();
  });
  it('salva uma edição comum e volta à consulta ao reabrir', () => {
    openTask();
    act(() => button('Editar').click());
    change(host.querySelector<HTMLTextAreaElement>('[aria-label="Título"]')!, 'Relatório da semana');
    act(() => button('Salvar alterações').click());
    expect(getState().tasks[0].title).toBe('Relatório da semana');
    expect(getUI().sheet).toBeUndefined();
    openTask();
    expect(host.querySelector('h2')?.textContent).toBe('Relatório da semana');
    expect(host.querySelector('textarea')).toBeNull();
  });
  it('conclui somente a ocorrência exibida de uma tarefa recorrente', () => {
    const occurrence = '2026-11-04';
    replaceState({ ...emptyState(), tasks: [{ ...base, date: undefined, recurrence: { freq: 'daily', anchor: occurrence } }] });
    act(() => { openSheet({ type: 'task', id: 'a', date: occurrence }); root.render(<SheetHost />); });
    act(() => button('Concluir').click());
    expect(getState().tasks[0].doneDates).toEqual([occurrence]);
    expect(getState().tasks[0].status).toBe('active');
  });
});

describe('capturas no Inbox', () => {
  it('abre a configuração completa diretamente, sem expansão com opções rápidas', () => {
    replaceState({ ...emptyState(), tasks: [{ ...base, status: 'inbox', date: undefined }] });
    act(() => root.render(<><InboxScreen /><SheetHost /></>));
    expect(host.querySelector('.inbox-edit')).toBeNull();
    act(() => (host.querySelector('.task-main') as HTMLButtonElement).click());
    expect(host.querySelector('[aria-label="Título"]')).not.toBeNull();
    expect(host.querySelector('#notes')).not.toBeNull();
    expect(host.querySelector('#project')).not.toBeNull();
    expect(host.textContent).toContain('Salvar alterações');
    expect(getUI().sheet).toMatchObject({ type: 'task', id: 'a' });
  });
});
