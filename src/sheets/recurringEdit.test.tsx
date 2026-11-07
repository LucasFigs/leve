// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { AgendaScreen } from '../screens/Agenda';
import { TaskSheet } from './TaskSheet';
import { emptyState, getState, newTask, replaceState } from '../store/store';
import { closeAllSheets, setUI, useUI } from '../store/ui';
import { itemsForDate } from '../domain/selectors';

vi.mock('../store/sync', () => ({ cloudEnabled: false, useCloud: (select: (value: unknown) => unknown) => select({ auth: 'out' }) }));
vi.mock('../services/googleCalendar', () => ({ useGoogleCalendar: (select: (value: unknown) => unknown) => select({ connected: false, autoSync: false }) }));

let host: HTMLDivElement, root: Root;
function Journey() {
  const sheet = useUI(s => s.sheet);
  return <><AgendaScreen />{sheet?.type === 'task' && <TaskSheet key={`${sheet.id}:${sheet.date}`} id={sheet.id} date={sheet.date} />}</>;
}
function click(text: string) {
  const b = [...host.querySelectorAll('button')].find(b => b.textContent?.trim().startsWith(text));
  if (!b) throw Error(`Missing button: ${text}`);
  act(() => b.click());
}
function input(label: string, value: string, event = 'input') {
  const el = host.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`)!;
  act(() => {
    Object.getOwnPropertyDescriptor(el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event(event, { bubbles: true }));
  });
}
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers(); vi.setSystemTime(new Date('2026-11-06T12:00:00Z'));
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} });
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  const s = emptyState();
  s.settings.onboarded = true;
  s.tasks = [newTask({ id: 'weekly', title: 'Reunião semanal', kind: 'event', status: 'active', time: '10:00', duration: 60, recurrence: { freq: 'weekly', weekdays: [2], anchor: '2026-11-03' }, category: 'trabalho' })];
  replaceState(s, { resetUndo: true }); closeAllSheets(); setUI({ agendaDate: '2026-11-10', agendaView: 'day' });
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  act(() => root.render(<Journey />));
});
afterEach(() => {
  act(() => root.unmount()); host.remove(); closeAllSheets(); replaceState(emptyState(), { resetUndo: true });
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

it('edita pela Agenda, salva só esta data e reabre com horário e duração novos', () => {
  act(() => host.querySelector<HTMLButtonElement>('.block')!.click());
  click('Editar'); input('Horário de início', '08:30'); input('Duração', '30', 'change');
  expect(host.querySelector<HTMLInputElement>('[aria-label="Horário de início"]')!.value).toBe('08:30');
  click('Salvar alterações'); click('Só este evento');
  const changed = itemsForDate(getState().tasks, '2026-11-10');
  expect(changed).toHaveLength(1); expect(changed[0]).toMatchObject({ time: '08:30', duration: 30 });
  expect(itemsForDate(getState().tasks, '2026-11-17')[0]).toMatchObject({ time: '10:00', duration: 60 });
  act(() => host.querySelector<HTMLButtonElement>('.block')!.click());
  expect(host.querySelector('.task-overview')!.textContent).toContain('08:30–09:00');
  click('Editar'); expect(host.querySelector<HTMLInputElement>('[aria-label="Horário de início"]')!.value).toBe('08:30');
  expect(host.querySelector<HTMLSelectElement>('[aria-label="Duração"]')!.value).toBe('30');
});

it('mantém horário quando o controle nativo emite input/change junto com a duração', () => {
  act(() => host.querySelector<HTMLButtonElement>('.block')!.click()); click('Editar');
  const time = host.querySelector<HTMLInputElement>('[aria-label="Horário de início"]')!;
  const duration = host.querySelector<HTMLSelectElement>('[aria-label="Duração"]')!;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(time, '08:30');
    time.dispatchEvent(new Event('input', { bubbles: true }));
    time.dispatchEvent(new Event('change', { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(duration, '30');
    duration.dispatchEvent(new Event('change', { bubbles: true }));
  });
  click('Salvar alterações'); click('Só este evento');
  expect(itemsForDate(getState().tasks, '2026-11-10')[0]).toMatchObject({ time: '08:30', duration: 30 });
});

it('preserva alterações de metadados na exceção', () => {
  act(() => host.querySelector<HTMLButtonElement>('.block')!.click()); click('Editar');
  input('Categoria', 'saude', 'change');
  click('Salvar alterações'); click('Só este evento');
  expect(itemsForDate(getState().tasks, '2026-11-10')[0].task.category).toBe('saude');
});

it.each([false,true])('salva o valor nativo visível 08:00 quando o rascunho ainda contém 08:30 (duração alterada: %s)', changeDuration => {
  act(() => replaceState({...getState(),tasks:getState().tasks.map(t=>({...t,time:'08:30'}))}));
  act(() => host.querySelector<HTMLButtonElement>('.block')!.click()); click('Editar');
  if(changeDuration)input('Duração','30','change');
  const time=host.querySelector<HTMLInputElement>('[aria-label="Horário de início"]')!;
  // Reduz o relato do picker/PWA: DOM atualizado, mas sem notificação ao React antes de salvar.
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(time,'08:00');
  expect(time.value).toBe('08:00');
  click('Salvar alterações'); click('Só este evento');
  expect(itemsForDate(getState().tasks,'2026-11-10')).toMatchObject([{time:'08:00',duration:changeDuration?30:60}]);
});

it('mantém o horário visível ao voltar do alcance e não duplica o passo pendente',()=>{
  act(()=>replaceState({...getState(),tasks:getState().tasks.map(t=>({...t,kind:'task' as const,time:'08:30'}))}));
  act(()=>host.querySelector<HTMLButtonElement>('.block')!.click());click('Editar');
  const step=host.querySelector<HTMLTextAreaElement>('[aria-label="Novo passo"]')!;
  act(()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(step,'Preparar pauta');step.dispatchEvent(new Event('input',{bubbles:true}));});
  const time=host.querySelector<HTMLInputElement>('[aria-label="Horário de início"]')!;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(time,'08:00');
  click('Salvar alterações');click('Voltar');
  expect(host.querySelector<HTMLInputElement>('[aria-label="Horário de início"]')!.value).toBe('08:00');
  click('Salvar alterações');click('Só esta ocorrência');
  expect(itemsForDate(getState().tasks,'2026-11-10')).toMatchObject([{time:'08:00',task:{subtasks:[{title:'Preparar pauta'}]}}]);
});

it('move somente a ocorrência selecionada com data, horário e duração juntos', () => {
  act(() => host.querySelector<HTMLButtonElement>('.block')!.click()); click('Editar');
  input('Data desta ocorrência', '2026-11-11'); input('Horário de início', '08:30'); input('Duração', '30', 'change');
  click('Salvar alterações');
  expect(host.textContent).toContain('Só este evento'); expect(host.textContent).not.toContain('Todos os eventos');
  click('Só este evento');
  expect(itemsForDate(getState().tasks, '2026-11-10')).toHaveLength(0);
  expect(itemsForDate(getState().tasks, '2026-11-11')).toMatchObject([{ time:'08:30',duration:30,task:{seriesDate:'2026-11-10'} }]);
  act(() => setUI({agendaDate:'2026-11-11'}));
  act(() => host.querySelector<HTMLButtonElement>('.block')!.click());
  expect(host.querySelector('.task-overview')!.textContent).toContain('Alterada só nesta ocorrência');
  click('Editar'); input('Horário de início', '09:15'); input('Duração', '45', 'change'); click('Salvar alterações');
  expect(getState().tasks).toHaveLength(2);expect(itemsForDate(getState().tasks, '2026-11-11')[0]).toMatchObject({time:'09:15',duration:45,task:{seriesId:'weekly',seriesDate:'2026-11-10'}});
});

it.each([['Este e os seguintes','10:00',60],['Todos os eventos','08:30',30]] as const)('aplica %s a partir do formulário', (scope,oldTime,oldDuration) => {
  act(() => host.querySelector<HTMLButtonElement>('.block')!.click()); click('Editar');
  input('Horário de início', '08:30'); input('Duração', '30', 'change'); click('Salvar alterações'); click(scope);
  expect(itemsForDate(getState().tasks,'2026-11-03')[0]).toMatchObject({time:oldTime,duration:oldDuration});
  for(const date of ['2026-11-10','2026-11-17'])expect(itemsForDate(getState().tasks,date)).toMatchObject([{time:'08:30',duration:30}]);
});
