// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickAddSheet, ProjectSheet, SearchSheet } from './OtherSheets';
import { emptyState, getState, replaceState, newTask } from '../store/store';
import { closeAllSheets, getUI, setUI } from '../store/ui';
import { AgendaScreen } from '../screens/Agenda';

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  vi.useFakeTimers();
  vi.spyOn(window, 'confirm').mockReturnValue(false);
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
  replaceState(emptyState()); closeAllSheets();
});
afterEach(() => {
  act(() => root.unmount()); host.remove(); replaceState(emptyState()); closeAllSheets();
  vi.clearAllTimers(); vi.useRealTimers(); vi.restoreAllMocks();
});
function change(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  act(() => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
function close() { act(() => (host.querySelector('[aria-label="Fechar"]') as HTMLButtonElement).click()); }

describe('proteção de rascunhos e recuperação de resultados', () => {
  it('mantém uma captura quando o descarte é recusado e permite salvá-la', () => {
    act(() => root.render(<QuickAddSheet />));
    change(host.querySelector('textarea')!, 'Uma ideia para organizar');
    close();
    expect(window.confirm).toHaveBeenCalled();
    expect(host.querySelector('.closing')).toBeNull();
    expect(host.querySelector('textarea')!.value).toBe('Uma ideia para organizar');
    act(() => host.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    expect(getState().tasks.some(t => t.title === 'Uma ideia para organizar')).toBe(true);
  });
  it('protege também alterações de cor em um projeto ainda sem nome', () => {
    act(() => root.render(<ProjectSheet />));
    act(() => (host.querySelector('[aria-label="Cor azul"]') as HTMLButtonElement).click());
    close();
    expect(window.confirm).toHaveBeenCalled();
    expect(host.querySelector('.closing')).toBeNull();
  });
  it('deixa alcançar resultados além dos primeiros quarenta e reinicia o limite ao buscar novamente', () => {
    replaceState({ ...emptyState(), tasks: Array.from({ length: 45 }, (_, i) => newTask({ title: `Relatorio ${i}`, status: 'active' })) });
    act(() => root.render(<SearchSheet />));
    change(host.querySelector('input')!, 'Relatorio');
    expect(host.querySelectorAll('.task-main')).toHaveLength(40);
    const more = Array.from(host.querySelectorAll('button')).find(b => b.textContent?.startsWith('Mostrar mais resultados'))!;
    act(() => more.click());
    expect(host.querySelectorAll('.task-main')).toHaveLength(45);
    change(host.querySelector('input')!, 'Relatori');
    expect(host.querySelectorAll('.task-main')).toHaveLength(40);
  });
  it('separa expandir o dia e adicionar na agenda semanal, inclusive por teclado', () => {
    setUI({ agendaView: 'week' });
    act(() => root.render(<AgendaScreen />));
    expect(host.querySelector('button button')).toBeNull();
    const header = host.querySelector<HTMLButtonElement>('.week-accordion-head')!;
    expect(document.getElementById(header.getAttribute('aria-controls')!)).not.toBeNull();
    const openDay = getUI().agendaOpenDay;
    act(() => (host.querySelector('.week-accordion-controls > .icon-btn') as HTMLButtonElement).click());
    expect(getUI().sheet?.type).toBe('quickAdd');
    expect(getUI().agendaOpenDay).toBe(openDay);
  });
});
