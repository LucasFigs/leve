// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Disclosure } from './Disclosure';
import { WeekCard } from './WeekCard';

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  localStorage.removeItem('leve:week-open');
  host = document.createElement('div'); document.body.append(host); root = createRoot(host);
});
afterEach(() => { act(() => root.unmount()); host.remove(); localStorage.removeItem('leve:week-open'); });

describe('controles de expansão consistentes', () => {
  it('preserva o toggle nativo e um nome acessível sem usar o ícone como rótulo', () => {
    act(() => root.render(<Disclosure title="Mais filtros" icon="settings"><label>Tipo<input /></label></Disclosure>));
    const details = host.querySelector('details')!;
    const summary = host.querySelector('summary')!;
    expect(details.open).toBe(false);
    expect(summary.textContent).toBe('Mais filtros');
    expect(summary.querySelectorAll('svg[aria-hidden="true"]')).toHaveLength(2);
    act(() => summary.click());
    expect(details.open).toBe(true);
    act(() => summary.click());
    expect(details.open).toBe(false);
  });
  it('abre a semana em uma única ação e preserva a preferência', () => {
    act(() => root.render(<WeekCard />));
    expect(host.querySelector('details')).toBeNull();
    const toggle = host.querySelector<HTMLButtonElement>('.week-head')!;
    const body = host.querySelector<HTMLDivElement>('.week-body')!;
    expect(toggle.textContent).toContain('Visão da semana');
    expect(toggle.getAttribute('aria-controls')).toBe(body.id);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(body.hidden).toBe(true);
    act(() => toggle.click());
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(body.hidden).toBe(false);
    expect(localStorage.getItem('leve:week-open')).toBe('1');
    expect(host.querySelectorAll('.rhythm-col')).toHaveLength(7);
    act(() => toggle.click());
    expect(body.hidden).toBe(true);
  });
});
