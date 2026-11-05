// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskSheet } from './TaskSheet';
import { HabitCalendarSheet } from './HabitCalendarSheet';
import { InboxScreen } from '../screens/Inbox';
import { emptyState, getState, newTask, replaceState } from '../store/store';
import { closeAllSheets, getUI, openSheet, useUI } from '../store/ui';
import { todayISO } from '../domain/dates';
import { TaskCard } from '../components/TaskCard';
import { getHabitTheme } from '../domain/habits';
import type { Task } from '../domain/types';

vi.mock('../store/sync', () => ({ cloudEnabled: false, useCloud: (select: (value: unknown) => unknown) => select({ auth: 'out' }) }));
vi.mock('../services/googleCalendar', () => ({ useGoogleCalendar: (select: (value: unknown) => unknown) => select({ connected: false, autoSync: false }) }));

let root: Root;
let host: HTMLDivElement;
const base: Task = { id: 'a', title: 'Preparar relatório', status: 'active', kind: 'task', date: '2026-11-05', duration: 30, notes: 'Trazer os dados\nRevisar com calma', subtasks: [{ id: 's', title: 'Reunir dados', done: false }], postponed: 0, createdAt: 0, updatedAt: 0 };
function SheetHost() {
  const sheet = useUI(s => s.sheet);
  if (sheet?.type === 'task') return <TaskSheet key={`${sheet.id}:${sheet.date ?? ''}:${sheet.mode ?? ''}`} id={sheet.id} date={sheet.date} mode={sheet.mode} />;
  return sheet?.type === 'habitCalendar' ? <HabitCalendarSheet key={sheet.id} id={sheet.id} /> : null;
}
function button(text: string) {
  const found = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.trim() === text);
  if (!found) throw new Error(`Botão não encontrado: ${text}`);
  return found;
}
function change(input: HTMLTextAreaElement | HTMLInputElement | HTMLSelectElement, value: string) {
  act(() => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : input instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event(input instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-05T12:00:00Z'));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  replaceState({ ...emptyState(), tasks: [base] }); closeAllSheets();
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount()); host.remove(); replaceState(emptyState()); closeAllSheets();
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});
function openTask() {
  act(() => { openSheet({ type: 'task', id: 'a' }); root.render(<SheetHost />); });
}

describe('navegação de hábitos', () => {
  beforeEach(() => replaceState({ ...emptyState(), tasks: [{ ...base, kind: 'habit', subtasks: [], recurrence: { freq: 'daily', anchor: '2026-10-01' } }] }));

  it.each(['task', 'habitCalendar'] as const)('abre o calendário pela entrada %s e edita diretamente, voltando ao cancelar', (type) => {
    act(() => { openSheet({ type, id: 'a' }); root.render(<SheetHost />); });
    expect(host.querySelector('.habit-calendar-view')).not.toBeNull();
    expect(host.querySelector('.task-overview')).toBeNull();
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Editar hábito"]')!.click());
    expect(host.querySelector('textarea')).not.toBeNull();
    expect(button('Salvar alterações')).toBeDefined();
    act(() => button('Cancelar').click());
    expect(host.querySelector('.habit-calendar-view')).not.toBeNull();
    expect(getUI().sheetStack).toHaveLength(0);
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Fechar"]')!.click());
    act(() => vi.advanceTimersByTime(250));
    expect(getUI().sheet).toBeUndefined();
  });

  it('preserva o dia da agenda ao editar uma ocorrência e retorna ao calendário após salvar', () => {
    act(() => { openSheet({ type: 'task', id: 'a', date: '2026-10-30' }); root.render(<SheetHost />); });
    expect(host.textContent).toContain('out. de 2026');
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Editar hábito"]')!.click());
    expect(getUI().sheet).toMatchObject({ mode: 'edit', date: '2026-10-30' });
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Cor: Azul"]')!.click());
    act(() => button('Salvar alterações').click());
    act(() => Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('Só esta ocorrência'))!.click());
    expect(getState().tasks.find(t => t.seriesId === 'a')?.date).toBe('2026-10-30');
    expect(host.querySelector('.habit-calendar-view')).not.toBeNull();
    expect(getUI().sheetStack).toHaveLength(0);
  });
});

describe('consulta e edição de tarefas', () => {
  it.each(['active', 'done', 'archived'] as const)('exclui diretamente da consulta uma tarefa %s e permite desfazer', (status) => {
    replaceState({ ...emptyState(), tasks: [{ ...base, status }] });
    openTask();
    expect(host.querySelector('textarea')).toBeNull();
    act(() => host.querySelector<HTMLButtonElement>('.sheet-head [aria-label="Excluir tarefa"]')!.click());
    expect(getState().tasks).toHaveLength(0);
    expect(getUI().sheet).toBeUndefined();
    act(() => getUI().toasts.slice(-1)[0].action!.run());
    expect(getState().tasks[0].id).toBe(base.id);
  });
  it('cancelar a confirmação de exclusão mantém a tarefa e a visualização', () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    openTask();
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Excluir tarefa"]')!.click());
    expect(getState().tasks).toHaveLength(1);
    expect(host.querySelector('.task-overview')).not.toBeNull();
  });
  it('exclui somente a ocorrência escolhida de um compromisso pela consulta', () => {
    replaceState({ ...emptyState(), tasks: [{ ...base, kind: 'event', date: undefined, recurrence: {freq:'daily',anchor:'2026-11-01'} }] });
    openTask();
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Excluir compromisso"]')!.click());
    expect(getState().tasks).toHaveLength(1);
    act(() => Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('Só este evento'))!.click());
    expect(getState().tasks[0].skipDates).toEqual(['2026-11-05']);
    act(() => getUI().toasts.slice(-1)[0].action!.run());
    expect(getState().tasks[0].skipDates ?? []).toEqual([]);
  });
  it('oferece exclusão no cabeçalho de uma captura, mas não de um rascunho novo', () => {
    replaceState({ ...emptyState(), tasks: [{ ...base, status: 'inbox' }] });
    openTask();
    act(() => host.querySelector<HTMLButtonElement>('.sheet-head [aria-label="Excluir tarefa"]')!.click());
    expect(getState().tasks).toHaveLength(0);
    act(() => root.render(<TaskSheet initial={newTask({title:'Ainda não salva'})} />));
    expect(host.querySelector('.sheet-head [aria-label="Excluir tarefa"]')).toBeNull();
  });
  it('prioriza título, planejamento e passos antes das notas, mantendo o contexto visível', () => {
    replaceState({ ...emptyState(), tasks: [{ ...base, time: '09:05', category: 'trabalho', priority: 'important' }] });
    openTask();
    expect(host.querySelector('.task-overview-plan')?.textContent).toContain('09:05–09:35');
    expect(host.querySelector('.task-plan-duration')?.textContent).toBe('30 min');
    expect(host.querySelector('.task-overview-tags')?.textContent).toContain('Trabalho');
    expect(host.querySelector('.task-overview-tags')?.textContent).toContain('Importante');
    const steps = host.querySelector('[aria-label="Passos da tarefa"]')!;
    const notes = host.querySelector('[aria-label="Notas"]')!;
    expect(steps.compareDocumentPosition(notes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(host.querySelector('.task-overview-facts')).toBeNull();
  });
  it('permite marcar o passo pela linha inteira e destaca o próximo pendente', () => {
    replaceState({ ...emptyState(), tasks: [{ ...base, subtasks: [...base.subtasks, { id: 's2', title: 'Revisar o resultado', done: false }] }] });
    openTask();
    expect(host.querySelector('.task-overview-step.next')?.getAttribute('aria-label')).toBe('Concluir passo: Reunir dados');
    act(() => (host.querySelector('.task-overview-step.next') as HTMLButtonElement).click());
    expect(getState().tasks[0].subtasks[0].done).toBe(true);
    expect(host.querySelector('.task-overview-step.next')?.getAttribute('aria-label')).toBe('Concluir passo: Revisar o resultado');
    expect(host.querySelector('[aria-label="Passos concluídos"]')?.getAttribute('aria-valuenow')).toBe('50');
    expect(host.querySelector('textarea')).toBeNull();
  });
  it('mantém a visualização simples quando não há notas ou passos', () => {
    replaceState({ ...emptyState(), tasks: [{ ...base, notes: undefined, subtasks: [], date: undefined }] });
    openTask();
    expect(host.querySelector('.task-overview-plan')?.textContent).toContain('Quando der');
    expect(host.querySelector('[aria-label="Passos da tarefa"]')).toBeNull();
    expect(host.querySelector('[aria-label="Notas"]')).toBeNull();
    expect(host.querySelector<HTMLDetailsElement>('.task-overview-more')?.open).toBe(false);
    expect(button('Começar agora')).toBeDefined();
    expect(button('Concluir')).toBeDefined();
  });
  it('abre em consulta, marca passos imediatamente e não inicia um rascunho', () => {
    openTask();
    expect(host.querySelector('h2')?.textContent).toBe(base.title);
    expect(document.activeElement).toBe(host.querySelector('h2'));
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
    expect(host.querySelector('[aria-label="Notas"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Projeto"]')).not.toBeNull();
    expect(host.textContent).toContain('Salvar alterações');
    expect(getUI().sheet).toMatchObject({ type: 'task', id: 'a' });
  });
});

describe('formulário de tarefas simplificado', () => {
  it('salva a aparência opcional do hábito e identifica a conclusão na lista do dia', () => {
    const habit = newTask({ title: 'Ler', kind: 'habit', recurrence: { freq: 'daily', anchor: todayISO() } });
    act(() => root.render(<TaskSheet initial={habit} />));
    act(() => (host.querySelector('[aria-label="Ícone: Leitura"]') as HTMLButtonElement).click());
    act(() => (host.querySelector('[aria-label="Cor: Roxo"]') as HTMLButtonElement).click());
    expect(host.querySelector('[aria-label="Ícone: Leitura"]')?.getAttribute('aria-pressed')).toBe('true');
    act(() => button('Criar hábito').click());
    const saved = getState().tasks.find(task => task.id === habit.id)!;
    expect(saved).toMatchObject({ habitIcon: 'book', habitColor: 'purple' });
    act(() => root.render(<TaskCard task={saved} date={todayISO()} done={false} exitOnDone={false} />));
    expect(host.querySelector('.habit-identity')?.textContent).toBe('Hábito');
    expect((host.querySelector('.task-habit') as HTMLElement).style.getPropertyValue('--habit-primary')).toBe(getHabitTheme(saved).primary);
    act(() => (host.querySelector('[aria-label="Concluir: Ler"]') as HTMLButtonElement).click());
    const completed = getState().tasks.find(task => task.id === habit.id)!;
    expect(completed.doneDates).toEqual([todayISO()]);
    act(() => root.render(<TaskCard task={completed} date={todayISO()} exitOnDone={false} />));
    expect(host.querySelector('[aria-label="Reabrir: Ler"]')?.getAttribute('aria-checked')).toBe('true');
  });
  it('aplica aparência só à ocorrência escolhida e permite editar essa exceção sem criar repetição', () => {
    replaceState({ ...emptyState(), tasks: [{ ...base, kind: 'habit', date: undefined, recurrence: { freq: 'daily', anchor: '2026-11-04' } }] });
    openTask(); act(() => host.querySelector<HTMLButtonElement>('[aria-label="Editar hábito"]')!.click());
    act(() => (host.querySelector('[aria-label="Cor: Azul"]') as HTMLButtonElement).click());
    act(() => button('Salvar alterações').click());
    act(() => Array.from(host.querySelectorAll('button')).find(b => b.textContent?.includes('Só esta ocorrência'))!.click());
    const exception = getState().tasks.find(task => task.seriesId === 'a')!;
    expect(exception.habitColor).toBe('blue');
    expect(getState().tasks.find(task => task.id === 'a')!.habitColor).toBeUndefined();
    act(() => { openSheet({ type: 'task', id: exception.id, date: todayISO() }); root.render(<SheetHost />); });
    act(() => host.querySelector<HTMLButtonElement>('[aria-label="Editar hábito"]')!.click());
    expect(button('Salvar alterações').disabled).toBe(false);
    act(() => button('Salvar alterações').click());
    expect(getState().tasks.find(task => task.id === exception.id)!.recurrence).toBeUndefined();
  });
  it('expõe planejamento e mantém detalhes vazios recolhidos, sem retirar campos', () => {
    act(() => root.render(<TaskSheet initial={newTask({ title: '' })} />));
    expect(host.textContent).toContain('Nova tarefa');
    expect(host.querySelector('[aria-label="Data"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Duração"]')).not.toBeNull();
    const optional = Array.from(host.querySelectorAll('details'));
    expect(optional.length).toBeGreaterThanOrEqual(4);
    expect(optional.every(panel => !panel.open)).toBe(true);
    expect(host.querySelector('[aria-label="Categoria"]')).not.toBeNull();
    expect(host.querySelector('[aria-label="Prazo final"]')).not.toBeNull();
    expect(host.querySelector('.sheet-head .btn-danger')).toBeNull();
  });
  it('inclui um passo digitado ao salvar sem exigir Adicionar antes', () => {
    openTask(); act(() => button('Editar').click());
    change(host.querySelector<HTMLTextAreaElement>('[aria-label="Novo passo"]')!, 'Conferir os números');
    act(() => button('Salvar alterações').click());
    expect(getState().tasks[0].subtasks.map(s => s.title)).toEqual(['Reunir dados', 'Conferir os números']);
  });
  it('protege uma tarefa sem título com notas e um passo ainda não adicionado', () => {
    vi.mocked(window.confirm).mockReturnValue(false);
    act(() => root.render(<TaskSheet initial={newTask({ title: '' })} />));
    change(host.querySelector<HTMLTextAreaElement>('[aria-label="Notas"]')!, 'Detalhe que não quero perder');
    change(host.querySelector<HTMLTextAreaElement>('[aria-label="Novo passo"]')!, 'Um primeiro passo');
    act(() => button('Cancelar').click());
    expect(window.confirm).toHaveBeenCalled();
    expect(host.querySelector<HTMLTextAreaElement>('[aria-label="Notas"]')!.value).toBe('Detalhe que não quero perder');
    expect(getState().tasks).toHaveLength(1);
  });
  it('descarta só o rascunho de passo ao cancelar uma edição e reabrir', () => {
    openTask(); act(() => button('Editar').click());
    change(host.querySelector<HTMLTextAreaElement>('[aria-label="Novo passo"]')!, 'Rascunho descartável');
    act(() => button('Cancelar').click()); act(() => button('Editar').click());
    expect(host.querySelector<HTMLTextAreaElement>('[aria-label="Novo passo"]')!.value).toBe('');
    expect(getState().tasks[0].subtasks).toHaveLength(1);
  });
  it('bloqueia duração personalizada inválida e salva a estimativa válida', () => {
    openTask(); act(() => button('Editar').click());
    change(host.querySelector<HTMLSelectElement>('[aria-label="Duração"]')!, 'custom');
    change(host.querySelector<HTMLInputElement>('[aria-label="Duração em minutos"]')!, '-5');
    expect(button('Salvar alterações').disabled).toBe(true);
    change(host.querySelector<HTMLInputElement>('[aria-label="Duração em minutos"]')!, '75');
    expect(button('Salvar alterações').disabled).toBe(false);
    act(() => button('Salvar alterações').click());
    expect(getState().tasks[0].duration).toBe(75);
  });
  it('mantém a frequência visível para hábitos e não cria um hábito sem repetição', () => {
    act(() => root.render(<TaskSheet initial={newTask({ title: 'Ler', kind: 'habit', recurrence: { freq: 'daily', anchor: todayISO() } })} />));
    const repeat = host.querySelector<HTMLSelectElement>('[aria-label="Repetição"]')!;
    expect(repeat.closest('details')).toBeNull();
    change(repeat, 'none');
    expect(button('Criar hábito').disabled).toBe(true);
    expect(host.textContent).toContain('Escolha uma repetição');
  });
});
