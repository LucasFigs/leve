// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {TodayScreen} from './Today';
import {actions,emptyState,getState,newTask,replaceState} from '../store/store';
import {getUI,closeAllSheets,setUI} from '../store/ui';
import {itemsForDate,overdueTasks} from '../domain/selectors';
vi.mock('../store/sync',()=>({cloudEnabled:false,useCloud:(s:(c:unknown)=>unknown)=>s({auth:'out'})}));
let host:HTMLDivElement,root:Root;
const today='2026-11-07',yesterday='2026-11-06';
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-07T12:00:00Z'));replaceState({...emptyState(),tasks:[newTask({id:'a',title:'Enviar proposta',kind:'task',status:'active',date:yesterday,time:'08:30',due:'2026-11-10'}),newTask({id:'b',title:'Outra atividade',status:'active',date:yesterday}),newTask({id:'h',title:'Movimento',kind:'habit',status:'active',date:yesterday,seriesId:'s',seriesDate:yesterday})]},{resetUndo:true});setUI({toasts:[]});host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<TodayScreen/>));});
afterEach(()=>{act(()=>root.unmount());host.remove();closeAllSheets();replaceState(emptyState(),{resetUndo:true});vi.clearAllTimers();vi.useRealTimers();});
function click(label:string){const b=[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label||b.getAttribute('aria-label')===label);if(!b)throw Error(label);act(()=>b.click());}
it('painel não cobra hábito e permite mover tarefa para hoje com prazo e desfazer',()=>{
 expect(host.textContent).toContain('2 tarefas ficaram');click('Revisar pendências');
 expect(host.querySelector('[aria-label="Para hoje: Movimento"]')).toBeNull();
 click('Para hoje: Enviar proposta');expect(getState().tasks[0]).toMatchObject({date:today,due:'2026-11-10'});expect(getState().tasks[0].time).toBeUndefined();
 expect(overdueTasks(getState().tasks,today).map(t=>t.id)).toEqual(['b']);
 act(()=>getUI().toasts[getUI().toasts.length-1].action!.run());expect(getState().tasks[0]).toMatchObject({date:yesterday,time:'08:30',due:'2026-11-10'});
});
it('ações secundárias abrem reagendamento existente e retiram só o dia planejado',()=>{
 click('Revisar pendências');click('Mais opções: Enviar proposta');click('Reagendar');expect(getUI().sheet).toEqual({type:'replan',id:'a',date:yesterday});
 act(()=>closeAllSheets());click('Retirar dia planejado');expect(getState().tasks[0].date).toBeUndefined();expect(getState().tasks[0].due).toBe('2026-11-10');expect(getState().tasks[1].date).toBe(yesterday);
});
it('conclusão rápida altera só a tarefa escolhida e remove sua cobrança',()=>{
 click('Revisar pendências');click('Concluir: Enviar proposta');expect(getState().tasks[0].status).toBe('done');expect(getState().tasks[1].status).toBe('active');expect(overdueTasks(getState().tasks,today)).toHaveLength(1);
});
it('reagendamento existente para outra data mantém prazo, notas e identidade',()=>{
 act(()=>actions.update('a',{notes:'Contexto fictício'}));
 act(()=>actions.postpone('a','custom',{date:'2026-11-09',time:'10:00'},yesterday));
 expect(getState().tasks.find(t=>t.id==='a')).toMatchObject({id:'a',date:'2026-11-09',time:'10:00',due:'2026-11-10',notes:'Contexto fictício'});
 expect(overdueTasks(getState().tasks,today).map(t=>t.id)).toEqual(['b']);
});
it('ação central recusa hábito, série, exceção e tarefa já resolvida; prazo vencido não é apagado',()=>{
 act(()=>{actions.add(newTask({id:'s',title:'Série',status:'active',recurrence:{freq:'daily',anchor:yesterday}}));actions.add(newTask({id:'x',title:'Exceção',status:'active',seriesId:'s',seriesDate:yesterday,date:yesterday}));});
 for(const id of ['h','s','x'])expect(actions.resolveOverdue(id,'today')).toBe(false);
 act(()=>actions.resolveOverdue('a','today'));expect(actions.resolveOverdue('a','today')).toBe(false);
 act(()=>actions.update('b',{due:'2026-11-01'}));
 act(()=>actions.resolveOverdue('b','undated'));expect(overdueTasks(getState().tasks,today).map(t=>t.id)).toEqual(['x','b']);expect(getState().tasks.find(t=>t.id==='b')!.due).toBe('2026-11-01');
 expect(itemsForDate(getState().tasks,today).filter(i=>i.task.id==='s')).toHaveLength(1);
});
