import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_SETTINGS, newTask } from '../store/store';
import type { Settings, Task } from './types';
import { dayBudget, dayCapacity, nextFreeSlot, planDay, planWeek, reflowDay, slotsByPart } from './planner';
import { fitsContext, nextContextDate, outsideWorkWarning } from './context';
import { recommendNow, rankCandidates } from './priority';
import { suggestForTask } from './organize';
import { isMeta, isSettings } from './validation';
import { parse } from './parser';

const friday = '2026-11-06';
const settings: Settings = {...DEFAULT_SETTINGS,dayStart:'07:00',dayEnd:'22:00',workSchedule:{enabled:true,weekdays:[1,2,3,4,5],start:'09:00',end:'18:00'}};
const work = (patch: Partial<Task> = {}) => newTask({title:'Relatório',status:'active',category:'trabalho',duration:30,date:friday,...patch});
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026,10,6,10,0)); });
afterEach(() => vi.useRealTimers());

describe('janelas de contexto opcionais e compartilhadas', () => {
  it('recusa fim de semana e duração que ultrapassa o expediente', () => {
    expect(nextFreeSlot([], '2026-11-07', 30, settings, {task:work()})).toBeUndefined();
    expect(nextFreeSlot([], '2026-11-08', 30, settings, {task:work()})).toBeUndefined();
    expect(nextFreeSlot([], friday, 30, settings, {task:work(),after:17*60+45})).toBeUndefined();
    expect(nextFreeSlot([], friday, 30, settings, {task:work(),after:17*60+30})).toBe('17:30');
    expect(nextContextDate(work(), '2026-11-07', settings)).toBe('2026-11-09');
  });
  it('mantém categorias pessoais e configurações antigas no comportamento geral', () => {
    expect(nextFreeSlot([], '2026-11-07',30,settings,{task:work({category:'casa'})})).toBe('07:00');
    expect(nextFreeSlot([], '2026-11-07',30,{...settings,workSchedule:undefined},{task:work()})).toBe('07:00');
    expect(nextFreeSlot([], '2026-11-07',30,{...settings,workSchedule:{...settings.workSchedule!,enabled:false}},{task:work()})).toBe('07:00');
    expect(isSettings(DEFAULT_SETTINGS)).toBe(true);
  });
  it('protege almoço e compromissos de qualquer categoria', () => {
    const date = '2026-11-09';
    const event=work({date,kind:'event',category:'pessoal',time:'09:00',duration:60});
    expect(nextFreeSlot([event],date,30,settings,{task:work()})).toBe('10:05');
    expect(nextFreeSlot([],date,30,settings,{task:work(),after:12*60})).toBe('13:05');
    expect(slotsByPart([],date,30,settings,undefined,work()).find(p=>p.part==='evening')?.slot).toBeUndefined();
  });
  it('expediente é independente e capacidade não soma janelas sobrepostas', () => {
    const date='2026-11-09';
    const independent={...settings,dayStart:'19:00',dayEnd:'22:00'};
    expect(nextFreeSlot([],date,30,independent,{task:work()})).toBe('09:00');
    expect(nextFreeSlot([],date,30,independent,{task:work({category:'pessoal'})})).toBe('19:00');
    expect(dayCapacity([],date,settings).free).toBe(14*60);
    expect(dayCapacity([],date,independent).free).toBe(11*60);
    expect(dayBudget([work({date,category:'pessoal',duration:60})],date,independent,work()).used).toBe(0);
    expect(dayBudget([work({date,time:'19:00',category:'pessoal',duration:60})],date,independent,work()).used).toBe(0);
    expect(dayCapacity([work({date:'2026-11-07',time:undefined})],'2026-11-07',settings).status).toBe('over');
  });
  it('dia planeja dentro de cada janela sem sobreposição ou perda de tarefas', () => {
    const date='2026-11-09';
    const tasks=[work({date,id:'w'}),work({date,id:'p',category:'pessoal'}),work({date,id:'e',kind:'event',category:'pessoal',time:'09:00',duration:60})];
    const plan=planDay(tasks,date,settings);
    for(const p of plan.placements) expect(fitsContext(p.task,date,Number(p.time.slice(0,2))*60+Number(p.time.slice(3)),p.duration,settings)).toBe(true);
    const professional=plan.placements.find(p=>p.task.id==='w')!;
    expect(professional.time >= '10:00').toBe(true);
    expect(plan.placements.length+plan.deferred.length).toBe(2);
    expect(tasks[0].time).toBeUndefined();
  });
  it('não preenche almoço parcialmente ocupado por compromisso fixo',()=>{
    const date='2026-11-09';
    const limited={...settings,dayStart:'12:00',dayEnd:'13:00',workSchedule:undefined};
    const plan=planDay([work({date,category:'pessoal'}),work({date,kind:'event',time:'12:00',duration:30})],date,limited);
    expect(plan.placements).toEqual([]);
  });
  it('preserva horários fixos manuais com aviso, inclusive fora do expediente',()=>{
    const task=work({date:'2026-11-07',kind:'event',time:'20:00',recurrence:{freq:'weekly',weekdays:[6],anchor:'2026-11-07'}});
    expect(outsideWorkWarning(task,'2026-11-07',settings)).toBe(true);
    expect(planDay([task],'2026-11-07',settings).fixed[0].time).toBe('20:00');
    expect(task.recurrence?.weekdays).toEqual([6]);
  });
  it('semana e Inbox não sugerem dias sem expediente nem tarefas sem encaixe',()=>{
    vi.setSystemTime(new Date(2026,10,6,19,0));
    const task=work({date:undefined});
    expect(planWeek([task],settings)[0].date).toBe('2026-11-09');
    expect(suggestForTask(task,[],settings).date).toBe('2026-11-09');
    const long=work({date:undefined,duration:600});
    expect(planWeek([long],settings)).toEqual([]);
    expect(suggestForTask(long,[],settings).date).toBeUndefined();
  });
  it('replanejamento não oferece horário após expediente',()=>{
    const task=work({time:'10:00'});
    expect(reflowDay([task],settings,19*60)).toEqual([{id:task.id,time:undefined}]);
  });
  it('Agora não recomenda Trabalho fora do expediente e mantém compromissos relevantes',()=>{
    const task=work();
    const item={task,date:friday,duration:30,done:false,missed:false,recurring:false};
    const ctx={today:friday,now:19*60,settings,items:[item],overdue:[],unscheduled:[]};
    expect(rankCandidates(ctx)).toEqual([]);
    expect(recommendNow(ctx).type).toBe('empty');
    expect(recommendNow({...ctx,items:[{...item,task:{...task,category:'casa'}}]}).type).toBe('task');
    expect(recommendNow({...ctx,items:[{...item,time:'19:00',task:{...task,kind:'event'}}]}).type).toBe('event');
    expect(task.status).toBe('active');
  });
  it('Agora utiliza expediente independente, mas não oferece trabalho às 17:45 por 30 min',()=>{
    const task=work();const item={task,date:friday,duration:30,done:false,missed:false,recurring:false};
    const ctx={today:friday,now:10*60,settings:{...settings,dayStart:'19:00',dayEnd:'22:00'},items:[item],overdue:[],unscheduled:[]};
    expect(recommendNow(ctx).type).toBe('task');
    expect(recommendNow({...ctx,now:17*60+45}).type).toBe('empty');
  });
  it('valida metadados opcionais sem aceitar horários ou dias inválidos',()=>{
    expect(isMeta({settings})).toBe(true);
    for(const patch of [{weekdays:[7]},{weekdays:[]},{weekdays:[1,1]},{end:'08:00'},{start:'25:00'}])
      expect(isSettings({...settings,workSchedule:{...settings.workSchedule,...patch}})).toBe(false);
    expect(parse('Enviar relatório amanhã').chips.some(c=>c.type==='category')).toBe(true);
  });
});
