// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {AgendaScreen} from './Agenda';
import {emptyState,newTask,replaceState,getState} from '../store/store';
import {getUI,setUI,closeAllSheets} from '../store/ui';
vi.mock('../store/sync',()=>({cloudEnabled:false,useCloud:(s:(c:unknown)=>unknown)=>s({auth:'out'})}));
let host:HTMLDivElement,root:Root;
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-08T12:00:00Z'));Element.prototype.scrollIntoView=vi.fn();replaceState({...emptyState(),tasks:[newTask({id:'t',title:'Atividade fictícia',status:'active',date:'2026-11-08'})]},{resetUndo:true});setUI({agendaDate:'2026-11-08',agendaView:'day',agendaOpenDay:null});host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<AgendaScreen/>));});
afterEach(()=>{act(()=>root.unmount());host.remove();closeAllSheets();replaceState(emptyState(),{resetUndo:true});vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();});
const click=(text:string)=>{const b=[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===text||b.getAttribute('aria-label')===text);if(!b)throw Error(text);act(()=>b.click());};
it('modos acessíveis preservam data e navegam dia, semana e mês sem alterar tarefas',()=>{
 const before=getState();click('Próximo');expect(getUI().agendaDate).toBe('2026-11-09');click('Semana');expect(getUI().agendaDate).toBe('2026-11-09');click('Próximo');expect(getUI().agendaDate).toBe('2026-11-16');click('Anterior');expect(getUI().agendaDate).toBe('2026-11-09');
 click('Mês');expect(getUI().agendaDate).toBe('2026-11-09');click('Próximo');expect(getUI().agendaDate).toBe('2026-12-01');click('Anterior');expect(getUI().agendaDate).toBe('2026-11-01');click('Hoje');expect(getUI().agendaDate).toBe('2026-11-08');
 const group=host.querySelector('[aria-label="Visualização"]')!;expect(group.getAttribute('role')).toBe('group');expect(group.querySelector('[aria-pressed="true"]')?.textContent).toBe('Mês');expect(group.querySelector('[aria-current]')).toBeNull();expect(getState()).toBe(before);
});
it('selecionar data mensal abre Dia naquela data',()=>{click('Mês');act(()=>[...host.querySelectorAll<HTMLButtonElement>('.month-cell')].find(b=>b.querySelector('.num')?.textContent==='13')!.click());expect(getUI()).toMatchObject({agendaView:'day',agendaDate:'2026-11-13'});});
it('mais captura no dia certo sem alternar expansão; cabeçalho alterna separadamente',()=>{
 click('Semana');const open=getUI().agendaOpenDay;const section=host.querySelector('.week-accordion')!;expect(section.querySelector('button button')).toBeNull();
 act(()=>section.querySelector<HTMLButtonElement>('.icon-btn')!.click());expect(getUI().sheet).toEqual({type:'quickAdd',defaults:{date:'2026-11-02'}});expect(getUI().agendaOpenDay).toBe(open);
 act(()=>section.querySelector<HTMLButtonElement>('.week-accordion-head')!.click());expect(getUI().agendaOpenDay).toBe('2026-11-02');expect(section.querySelector('.week-accordion-body')?.hasAttribute('hidden')).toBe(false);
 act(()=>section.querySelector<HTMLButtonElement>('.week-accordion-head')!.click());expect(getUI().agendaOpenDay).toBeNull();expect(section.querySelector('.week-accordion-body')?.hasAttribute('hidden')).toBe(true);
});
