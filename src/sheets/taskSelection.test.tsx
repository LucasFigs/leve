// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { TaskSheet } from './TaskSheet';
import { QuickAdd } from '../components/QuickAdd';
import { InboxScreen } from '../screens/Inbox';
import { emptyState, getState, newTask, replaceState } from '../store/store';
import { closeAllSheets, getUI, openSheet, useUI } from '../store/ui';
import { localRepository } from '../store/persistence';
import { itemsForDate } from '../domain/selectors';
import type { Category, Priority } from '../domain/types';

vi.mock('../store/sync',()=>({cloudEnabled:false,useCloud:(select:(v:unknown)=>unknown)=>select({auth:'out'})}));
vi.mock('../services/googleCalendar',()=>({useGoogleCalendar:(select:(v:unknown)=>unknown)=>select({connected:false,autoSync:false})}));
let host:HTMLDivElement,root:Root;
function Host({inbox=false,quick=false}:{inbox?:boolean;quick?:boolean}) {
  const sheet=useUI(u=>u.sheet);
  return <>{inbox&&<InboxScreen/>}{quick&&<QuickAdd/>}{sheet?.type==='task'?<TaskSheet key={`${sheet.id}:${sheet.date}:${sheet.mode}`} id={sheet.id} date={sheet.date} mode={sheet.mode}/>:sheet?.type==='newTask'?<TaskSheet key={sheet.task.id} initial={sheet.task}/>:null}</>;
}
function click(text:string){const b=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim().startsWith(text));if(!b)throw Error(text);act(()=>b.click());}
function select(group:string,value:string){const el=host.querySelector<HTMLInputElement>(`fieldset[aria-label="${group}"] input[value="${value}"]`);if(!el)throw Error(`Missing radio ${group}:${value}`);act(()=>el.click());}
function checked(group:string){return host.querySelector<HTMLInputElement>(`fieldset[aria-label="${group}"] input:checked`)?.value;}
function edit(){act(()=>{openSheet({type:'task',id:'fixture',mode:'edit'});root.render(<Host/>);});}
beforeEach(()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-06T12:00:00Z'));
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.spyOn(window,'confirm').mockReturnValue(true);
  replaceState({...emptyState(),tasks:[newTask({id:'fixture',title:'Atividade fictícia',status:'active',date:'2026-11-10',time:'09:00',duration:30})]},{resetUndo:true});
  closeAllSheets();host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();closeAllSheets();replaceState(emptyState(),{resetUndo:true});vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});

it.each(['task','event'] as const)('expõe escolhas de prioridade e categoria fora dos acordeões para %s',kind=>{
  act(()=>replaceState({...getState(),tasks:getState().tasks.map(t=>({...t,kind}))}));edit();
  for(const [label,count] of [['Prioridade',4],['Categoria',7]] as const){
    const group=host.querySelector(`fieldset[aria-label="${label}"]`)!;
    expect(group).not.toBeNull();expect(group.closest('details')).toBeNull();expect(group.querySelectorAll('input[type="radio"]')).toHaveLength(count);
  }
  expect(checked('Prioridade')).toBe('');expect(checked('Categoria')).toBe('');
});

it.each(['','essential','important','optional'] as const)('seleciona a prioridade %s somente no rascunho e persiste ao salvar',value=>{
  edit();const before=getState();select('Prioridade',value);expect(checked('Prioridade')).toBe(value);expect(getState()).toBe(before);
  click('Salvar alterações');expect(getState().tasks[0].priority).toBe(value||undefined);
  replaceState(localRepository.load()!);edit();expect(checked('Prioridade')).toBe(value);
});

it('troca Essencial por Importante e remove a escolha, sem criar prioridade padrão',()=>{
  edit();select('Prioridade','essential');select('Prioridade','important');expect(checked('Prioridade')).toBe('important');click('Salvar alterações');
  edit();select('Prioridade','');click('Salvar alterações');expect(getState().tasks[0].priority).toBeUndefined();
});

it.each(['trabalho','pessoal','estudos','saude','casa','financas'] satisfies Category[])('seleciona e reabre a categoria %s',value=>{
  edit();const before=getState();select('Categoria',value);expect(checked('Categoria')).toBe(value);expect(getState()).toBe(before);
  click('Salvar alterações');replaceState(localRepository.load()!);edit();expect(checked('Categoria')).toBe(value);
});

it('troca Trabalho/Pessoal e remove a categoria sem mover horários ou outras tarefas',()=>{
  const first={...getState().tasks[0],category:'trabalho' as const};const other=newTask({title:'Outra atividade',status:'active',date:'2026-11-10',time:'10:00'});
  replaceState({...getState(),tasks:[first,other],settings:{...getState().settings,workSchedule:{enabled:true,weekdays:[1,2,3,4,5],start:'08:00',end:'17:00'}}});
  edit();for(const value of ['pessoal','trabalho',''])select('Categoria',value);
  click('Salvar alterações');expect(getState().tasks[0]).toMatchObject({date:first.date,time:first.time,duration:first.duration});
  expect(getState().tasks[0].category).toBeUndefined();expect(getState().tasks[1]).toBe(other);
});

it('mantém o aviso de expediente coerente com a categoria sem replanejar',()=>{
  replaceState({...getState(),tasks:getState().tasks.map(t=>({...t,time:'20:00'})),settings:{...getState().settings,workSchedule:{enabled:true,weekdays:[1,2,3,4,5],start:'08:00',end:'17:00'}}});
  edit();select('Categoria','trabalho');expect(host.textContent).toContain('Fora do expediente');
  select('Categoria','pessoal');expect(host.textContent).not.toContain('Fora do expediente');click('Salvar alterações');expect(getState().tasks[0].time).toBe('20:00');
});

it('cancelar e recusar o descarte preserva o rascunho; aceitar mantém o registro anterior',()=>{
  edit();const before=getState();select('Prioridade','essential');select('Categoria','saude');
  vi.mocked(window.confirm).mockReturnValue(false);click('Cancelar');expect(checked('Prioridade')).toBe('essential');expect(getState()).toBe(before);
  act(()=>window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape'})));expect(getUI().sheet).toBeDefined();
  vi.mocked(window.confirm).mockReturnValue(true);click('Cancelar');expect(getUI().sheet).toBeUndefined();expect(getState()).toBe(before);
});

it('organiza uma captura do Inbox preservando o projeto',()=>{
  act(()=>replaceState({...getState(),tasks:getState().tasks.map(t=>({...t,status:'inbox',date:undefined,time:undefined,projectId:'project-fixture'}))}));
  act(()=>root.render(<Host inbox/>));act(()=>host.querySelector<HTMLButtonElement>('.task-main')!.click());
  select('Prioridade','important');select('Categoria','pessoal');click('Salvar alterações');
  expect(getState().tasks[0]).toMatchObject({priority:'important',category:'pessoal',projectId:'project-fixture',status:'active'});
});

it('atribui prioridade a um compromisso sem alterar seu horário fixo',()=>{
  act(()=>replaceState({...getState(),tasks:getState().tasks.map(t=>({...t,kind:'event'}))}));edit();
  select('Prioridade','essential');select('Categoria','trabalho');click('Salvar alterações');
  expect(getState().tasks[0]).toMatchObject({kind:'event',time:'09:00',duration:30,priority:'essential',category:'trabalho'});
});

it('altera prioridade e categoria só na ocorrência selecionada e preserva o PR 61',()=>{
  const series={...getState().tasks[0],kind:'event' as const,date:undefined,recurrence:{freq:'weekly' as const,weekdays:[2],anchor:'2026-11-03'},priority:'important' as Priority,category:'trabalho' as Category};
  replaceState({...getState(),tasks:[series]});act(()=>{openSheet({type:'task',id:series.id,date:'2026-11-10',mode:'edit'});root.render(<Host/>);});
  select('Prioridade','essential');select('Categoria','pessoal');click('Salvar alterações');click('Só este evento');
  expect(itemsForDate(getState().tasks,'2026-11-10')).toMatchObject([{time:'09:00',task:{priority:'essential',category:'pessoal',seriesId:series.id}}]);
  expect(itemsForDate(getState().tasks,'2026-11-17')).toMatchObject([{time:'09:00',task:{priority:'important',category:'trabalho'}}]);
});

it('mantém captura por frase e permite corrigir sugestões em Detalhar antes de criar',()=>{
  replaceState(emptyState());act(()=>root.render(<Host quick/>));
  const quick=host.querySelector<HTMLTextAreaElement>('.quick textarea')!;
  act(()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(quick,'Enviar relatório amanhã importante');quick.dispatchEvent(new Event('input',{bubbles:true}));});
  click('Detalhar');expect(checked('Prioridade')).toBe('important');expect(checked('Categoria')).toBe('trabalho');expect(getState().tasks).toHaveLength(0);
  select('Prioridade','');select('Categoria','pessoal');click('Criar tarefa');
  expect(getState().tasks).toHaveLength(1);expect(getState().tasks[0].priority).toBeUndefined();expect(getState().tasks[0].category).toBe('pessoal');
});

it('cria compromisso sem tornar contexto obrigatório',()=>{
  act(()=>{openSheet({type:'newTask',task:newTask({kind:'event',title:'Compromisso fictício',date:'2026-11-10',time:'11:00'})});root.render(<Host/>);});
  expect(checked('Prioridade')).toBe('');expect(checked('Categoria')).toBe('');click('Criar compromisso');
  const saved=getState().tasks.find(t=>t.kind==='event')!;expect(saved.priority).toBeUndefined();expect(saved.category).toBeUndefined();expect(saved.time).toBe('11:00');
});

it('continua capturando uma frase imediatamente sem abrir os novos controles',()=>{
  replaceState(emptyState());act(()=>root.render(<Host quick/>));
  const quick=host.querySelector<HTMLTextAreaElement>('.quick textarea')!;
  act(()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(quick,'Ler um capítulo');quick.dispatchEvent(new Event('input',{bubbles:true}));});
  expect(host.querySelector('fieldset')).toBeNull();act(()=>host.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
  expect(getState().tasks).toHaveLength(1);expect(getUI().sheet).toBeUndefined();
});
