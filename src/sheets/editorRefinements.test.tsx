// @vitest-environment jsdom
import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {TaskSheet} from './TaskSheet';import {emptyState,getState,newTask,replaceState} from '../store/store';
vi.mock('../store/sync',()=>({cloudEnabled:false,useCloud:(s:(c:unknown)=>unknown)=>s({auth:'out'})}));
let host:HTMLDivElement,root:Root;
const task=()=>newTask({id:'fixture',title:'Preparar atividade',status:'active',date:'2026-11-11',time:'08:30',duration:45,due:'2026-11-12',priority:'important',category:'pessoal'});
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-08T12:00:00Z'));replaceState({...emptyState(),tasks:[task()]},{resetUndo:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<TaskSheet id="fixture" mode="edit"/>));});
afterEach(()=>{act(()=>root.unmount());host.remove();replaceState(emptyState(),{resetUndo:true});vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();});
const click=(s:string)=>{const b=[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===s||b.getAttribute('aria-label')===s);if(!b)throw Error(s);act(()=>b.click());};
function change(el:HTMLInputElement|HTMLTextAreaElement,value:string){act(()=>{const proto=el instanceof HTMLInputElement?HTMLInputElement.prototype:HTMLTextAreaElement.prototype;Object.getOwnPropertyDescriptor(proto,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));});}
function expand(label:string){const s=[...host.querySelectorAll<HTMLElement>('summary')].find(s=>s.querySelector('.disclosure-title')?.textContent?.startsWith(label))!;act(()=>s.click());expect(s.parentElement?.hasAttribute('open')).toBe(true);return s.parentElement!;}
it('tipos são seleção e preservam os dados e as regras existentes de hábito',()=>{
 const group=host.querySelector('[aria-label="Tipo"]')!;expect(group.getAttribute('role')).toBe('group');expect(group.querySelector('[aria-current]')).toBeNull();click('Compromisso');expect(group.querySelector('[aria-pressed=true]')?.textContent).toBe('Compromisso');click('Tarefa');click('Salvar alterações');expect(getState().tasks[0]).toMatchObject({date:'2026-11-11',time:'08:30',duration:45,due:'2026-11-12',priority:'important',category:'pessoal'});
});
it('troca para hábito mantém a regra existente de ancorar no dia planejado, sem salvar no clique',()=>{
 click('Hábito');expect(getState().tasks[0].kind).toBe('task');click('Salvar alterações');
 expect(getState().tasks[0]).toMatchObject({kind:'habit',time:'08:30',duration:45,priority:'important',category:'pessoal',recurrence:{freq:'daily',anchor:'2026-11-11'}});expect(getState().tasks[0].date).toBeUndefined();
});
it('prazo removido continua ausente após salvar e reabrir',()=>{
 expand('Organização');click('Tirar prazo');click('Salvar alterações');expect(getState().tasks[0].due).toBeUndefined();
 act(()=>root.render(<TaskSheet key="clear-reopened" id="fixture" mode="edit"/>));expand('Organização');expect(host.querySelector<HTMLInputElement>('[aria-label="Prazo final"]')!.value).toBe('');
});
it('Repetição, Passos, Notas e Organização expandem nativamente e passo entra por Enter e botão',()=>{
 expand('Repetição');expand('Passos');expand('Notas');expand('Organização');
 let input=host.querySelector<HTMLTextAreaElement>('[aria-label="Novo passo"]')!;change(input,'Separar material');act(()=>input.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true})));expect(input.value).toBe('');
 change(input,'Conferir detalhes');click('Adicionar');expect(input.value).toBe('');
 change(host.querySelector<HTMLInputElement>('[aria-label="Prazo final"]')!,'2026-11-15');click('Tirar prazo');expect(host.querySelector<HTMLInputElement>('[aria-label="Prazo final"]')!.value).toBe('');
 change(host.querySelector<HTMLInputElement>('[aria-label="Prazo final"]')!,'2026-11-16');click('Salvar alterações');expect(getState().tasks[0].subtasks.map(s=>s.title)).toEqual(['Separar material','Conferir detalhes']);expect(getState().tasks[0].due).toBe('2026-11-16');
 act(()=>root.render(<TaskSheet key="reopened" id="fixture" mode="edit"/>));expand('Organização');expect(host.querySelector<HTMLInputElement>('[aria-label="Prazo final"]')!.value).toBe('2026-11-16');
});
