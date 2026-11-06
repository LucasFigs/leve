// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { ProfileScreen } from './Profile';
import { TodayScreen } from './Today';
import { WorkScheduleEditor } from '../components/WorkScheduleEditor';
import { TaskSheet } from '../sheets/TaskSheet';
import { ReplanSheet, WeekSheet } from '../sheets/PlanningSheets';
import { actions, emptyState, getState, newTask, replaceState } from '../store/store';
import { localRepository } from '../store/persistence';
import { closeAllSheets } from '../store/ui';

let root: Root, host: HTMLDivElement;
const schedule={enabled:true,weekdays:[1,2,3,4,5],start:'09:00',end:'18:00'};
beforeEach(()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  vi.useFakeTimers();vi.setSystemTime(new Date(2026,10,6,19));
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
  localStorage.clear();localRepository.clear();replaceState({...emptyState(),settings:{...emptyState().settings,workSchedule:schedule}});
  host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();closeAllSheets();localRepository.clear();vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});
const click=(text:string)=>act(()=>Array.from(host.querySelectorAll('button')).find(b=>b.textContent===text)!.click());
function input(el:HTMLInputElement,value:string) {act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}

it('Perfil recolhe controles secundários sem criar campos obrigatórios',()=>{
  act(()=>root.render(<ProfileScreen/>));
  expect(Array.from(host.querySelectorAll('details')).every(d=>!d.open)).toBe(true);
  for(const text of ['Meu tempo','Aparência','Avisos e lembretes','Integrações e instalação','Conta e dados']) expect(host.textContent).toContain(text);
  expect(host.querySelectorAll('[required]')).toHaveLength(0);
});
it('salva dias e horário com persistência e sem mover tarefas ou vínculos Google',()=>{
  const task=newTask({title:'Manual',category:'trabalho',date:'2026-11-07',time:'20:00',googleEventId:'fixture',googleCalendarId:'fixture-calendar'});
  act(()=>actions.add(task));
  act(()=>root.render(<WorkScheduleEditor/>));
  input(host.querySelectorAll<HTMLInputElement>('input')[0],'10:00');
  click('sáb');click('Salvar expediente');
  expect(getState().settings.workSchedule).toMatchObject({start:'10:00',weekdays:[1,2,3,4,5,6]});
  expect(getState().tasks[0]).toEqual(task);
  expect(localRepository.load()?.settings.workSchedule).toEqual(getState().settings.workSchedule);
  expect(getState().googleDeletions ?? []).toEqual([]);
});
it('não persiste configuração profissional inválida',()=>{
  const previous=getState().settings;
  actions.updateSettings({workSchedule:{...schedule,weekdays:[]}});
  expect(getState().settings).toBe(previous);
});
it('adiamento usa a duração padrão real para não ultrapassar o fim do expediente',()=>{
  vi.setSystemTime(new Date(2026,10,6,17,20));
  actions.updateSettings({defaultDuration:60});
  const task=newTask({title:'Sem duração',status:'active',category:'trabalho',date:'2026-11-06'});
  actions.add(task);actions.postpone(task.id,'later');
  expect(getState().tasks[0]).toMatchObject({date:'2026-11-09',time:'09:00'});
});
it('atualiza a proposta semanal quando o expediente muda com a folha aberta',()=>{
  const task=newTask({title:'Trabalho sem data',status:'active',category:'trabalho',duration:30});
  actions.add(task);act(()=>root.render(<WeekSheet/>));
  expect(host.textContent).toContain('9 nov');
  act(()=>actions.updateSettings({workSchedule:{...schedule,weekdays:[2]}}));
  expect(host.textContent).toContain('10 nov');expect(host.textContent).not.toContain('9 nov');
});
it('Agora vazio desaparece sem comunicar conclusão falsa ou esconder a tarefa profissional',()=>{
  const task=newTask({title:'Pendência profissional',status:'active',category:'trabalho',date:'2026-11-06',duration:30});
  act(()=>actions.add(task));act(()=>root.render(<TodayScreen/>));
  expect(host.querySelector('.now-card')).toBeNull();
  expect(host.querySelector('[aria-label="Agora"]')).toBeNull();
  expect(host.textContent).toContain('Pendência profissional');
  expect(host.textContent).not.toContain('Itens de hoje concluídos.');
});
it('preserva Agora acionável para tarefa pessoal e compromisso próximo',()=>{
  const task=newTask({title:'Casa',status:'active',category:'casa',date:'2026-11-06',duration:15});
  act(()=>actions.add(task));act(()=>root.render(<TodayScreen/>));
  expect(host.querySelector('.now-card')?.textContent).toContain('Começar agora');
  act(()=>actions.add(newTask({title:'Consulta',kind:'event',status:'active',date:'2026-11-06',time:'19:10',duration:30})));
  expect(host.querySelector('.now-card')?.textContent).toContain('Consulta');
});
it('adiar profissional na sexta propõe segunda, sem impedir horário manual no sábado',()=>{
  const task=newTask({title:'Trabalho',status:'active',category:'trabalho',date:'2026-11-06',duration:30});
  act(()=>actions.add(task));act(()=>root.render(<ReplanSheet id={task.id} date={task.date!}/>));
  expect(host.textContent).toContain('Segunda');
  act(()=>actions.postpone(task.id,'tomorrow'));
  expect(getState().tasks[0].date).toBe('2026-11-09');
  act(()=>actions.postpone(task.id,'custom',{date:'2026-11-07',time:'20:00'}));
  act(()=>root.render(<TaskSheet id={task.id}/>));
  expect(host.textContent).toContain('Fora do expediente');
  expect(getState().tasks[0].time).toBe('20:00');
});
it('remover a interpretação Trabalho mantém captura acessível e sem restrição profissional',()=>{
  const task=actions.buildCapture('Enviar relatório amanhã de manhã',{},new Set(['category']));
  expect(task.category).toBeUndefined();
  expect(task.time).toBeDefined();
});
it('aplicar encaixe de recorrência altera só a ocorrência escolhida',()=>{
  const task=newTask({title:'Hábito',kind:'habit',status:'active',category:'trabalho',recurrence:{freq:'daily',anchor:'2026-11-01'},duration:30});
  actions.add(task);
  actions.applyDayPlan({date:'2026-11-09',start:540,end:1080,fixed:[],placements:[{task,time:'09:00',duration:30}],breaks:[],deferred:[],freeMinutes:480,plannedMinutes:30});
  const original=getState().tasks.find(t=>t.id===task.id)!;
  expect(original.recurrence).toEqual(task.recurrence);expect(original.time).toBeUndefined();
  expect(original.skipDates).toContain('2026-11-09');
  expect(getState().tasks.find(t=>t.seriesId===task.id)).toMatchObject({date:'2026-11-09',time:'09:00',seriesDate:'2026-11-09'});
});
