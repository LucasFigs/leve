// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { actions, emptyState, getState, newTask, replaceState } from './store';
import { localRepository } from './persistence';
import { itemsForDate } from '../domain/selectors';
import type { Task } from '../domain/types';

const anchor = '2026-11-03', selected = '2026-11-10', later = '2026-11-17';
const meeting = (): Task => newTask({ id:'weekly',title:'Reunião semanal',kind:'event',status:'active',time:'10:00',duration:60,
  category:'trabalho',energy:'medium',dayPart:'morning',priority:'important',projectId:'project-fixture',notes:'Pauta fictícia',due:'2026-12-01',
  subtasks:[{id:'step',title:'Preparar pauta',done:false}],recurrence:{freq:'weekly',anchor,weekdays:[2],count:8},
  doneDates:[anchor],missedDates:[later],googleEventId:'google-series-fixture',googleCalendarId:'calendar-fixture' });
beforeEach(() => replaceState({...emptyState(),tasks:[meeting()]},{resetUndo:true}));
afterEach(() => replaceState(emptyState(),{resetUndo:true}));

it.each([
  ['horário e duração', {time:'08:30',duration:30}], ['horário', {time:'08:30'}], ['duração', {duration:30}],
  ['data, horário e duração', {date:'2026-11-11',time:'08:30',duration:30}],
  ['metadados', {category:'saude',energy:'low',dayPart:'evening',notes:'Nova pauta',title:'Nova reunião',priority:'essential',projectId:'other-project',due:'2026-12-02'}],
] as const)('preserva %s na exceção, nas demais datas, no disco e no desfazer', (_name, patch) => {
  const original = getState(); const draft = {...original.tasks[0],...patch};
  actions.saveSeries('weekly',draft,'one',selected);
  const s = getState(), exception = s.tasks.find(t=>t.seriesId==='weekly')!;
  expect(exception).toMatchObject({...patch,seriesId:'weekly',seriesDate:selected,date:'date' in patch?patch.date:selected});
  expect(exception.id).not.toBe('weekly');
  expect(exception.recurrence).toBeUndefined(); expect(exception.doneDates).toBeUndefined(); expect(exception.skipDates).toBeUndefined(); expect(exception.missedDates).toBeUndefined();
  expect(exception.googleEventId).toBeUndefined(); expect(exception.googleCalendarId).toBe('calendar-fixture');
  expect(exception.subtasks).toEqual(draft.subtasks); expect(exception.category).toBe(draft.category);
  expect(exception.energy).toBe(draft.energy); expect(exception.dayPart).toBe(draft.dayPart);
  const day = exception.date!;
  expect(itemsForDate(s.tasks,day)).toHaveLength(1);
  if(day!==selected)expect(itemsForDate(s.tasks,selected)).toHaveLength(0);
  for(const date of [anchor,later])expect(itemsForDate(s.tasks,date)[0]).toMatchObject({time:'10:00',duration:60});
  expect(s.tasks.find(t=>t.id==='weekly')!.googleEventId).toBe('google-series-fixture');
  const restored = localRepository.load()!; expect(restored.tasks).toEqual(JSON.parse(JSON.stringify(s.tasks)));
  replaceState(restored); expect(itemsForDate(getState().tasks,day)).toHaveLength(1);
  actions.undo(); expect(getState()).toEqual(original);
});

it('edita uma ocorrência passada já concluída sem copiar o histórico global',()=>{
  const draft={...getState().tasks[0],time:'08:30',duration:30};actions.saveSeries('weekly',draft,'one',anchor);
  const exception=getState().tasks.find(t=>t.seriesId==='weekly')!;
  expect(exception).toMatchObject({status:'done',time:'08:30',duration:30,seriesDate:anchor});
  expect(exception.doneDates).toBeUndefined();expect(itemsForDate(getState().tasks,anchor)).toHaveLength(1);
  actions.saveTask(exception.id,{...exception,time:'09:00',duration:45});
  expect(getState().tasks).toHaveLength(2); expect(getState().tasks.find(t=>t.id===exception.id)).toMatchObject({time:'09:00',duration:45,seriesId:'weekly',seriesDate:anchor});
});

it.each(['all','following'] as const)('aplica o alcance %s preservando os campos e a contagem',scope=>{
  const draft={...getState().tasks[0],time:'08:30',duration:30,category:'saude' as const};
  actions.saveSeries('weekly',draft,scope,selected);
  expect(itemsForDate(getState().tasks,selected)).toHaveLength(1);
  for(const date of [selected,later])expect(itemsForDate(getState().tasks,date)[0]).toMatchObject({time:'08:30',duration:30,task:{category:'saude'}});
  expect(itemsForDate(getState().tasks,anchor)[0]).toMatchObject({time:scope==='all'?'08:30':'10:00',duration:scope==='all'?30:60});
  expect(getState().tasks.find(t=>t.id==='weekly')!.doneDates).toEqual([anchor]);
  if(scope==='following'){
    const next=getState().tasks.find(t=>t.id!=='weekly')!;
    expect(next.recurrence).toMatchObject({count:7,anchor:selected});expect(next.missedDates).toEqual([later]);expect(next.googleEventId).toBeUndefined();
  }
});

it('não duplica uma exceção legada se skipDates está ausente ou a exceção chega primeiro',()=>{
  const series=meeting(); const exception={...series,id:'legacy-exception',recurrence:undefined,date:selected,seriesId:series.id,seriesDate:selected,time:'08:30',duration:30,googleEventId:undefined};
  for(const tasks of [[series,exception],[exception,series]])expect(itemsForDate(tasks,selected)).toMatchObject([{time:'08:30',duration:30,task:{id:'legacy-exception'}}]);
  expect(itemsForDate([series,exception],later)).toHaveLength(1);
  const moved={...exception,date:'2026-11-11'};expect(itemsForDate([series,moved],selected)).toHaveLength(0);expect(itemsForDate([series,moved],moved.date)).toHaveLength(1);
});

it('mantém recorrências interval legadas e exceções sem metadados opcionais',()=>{
  const series={...meeting(),recurrence:{freq:'interval' as const,interval:7,anchor},googleCalendarId:undefined};
  replaceState({...emptyState(),tasks:[series]});actions.saveSeries(series.id,{...series,time:'08:30',duration:30},'one',selected);
  expect(itemsForDate(getState().tasks,selected)[0]).toMatchObject({time:'08:30',duration:30});
  expect(itemsForDate(getState().tasks,later)[0].task.recurrence?.freq).toBe('interval');
});

it('repetir a ação individual reutiliza a exceção e preserva seu vínculo Google próprio',()=>{
  const source=getState().tasks[0];actions.saveSeries(source.id,{...source,time:'08:30',duration:30},'one',selected);
  const exception=getState().tasks.find(t=>t.seriesId===source.id)!;
  actions.update(exception.id,{googleEventId:'exception-google-id'});
  actions.saveSeries(source.id,{...source,time:'09:00',duration:45},'one',selected);
  expect(getState().tasks).toHaveLength(2);
  expect(getState().tasks.find(t=>t.id===exception.id)).toMatchObject({time:'09:00',duration:45,googleEventId:'exception-google-id',seriesDate:selected});
  expect(itemsForDate(getState().tasks,selected)).toHaveLength(1);
});

it('não confunde a data legada do registro da série com a ocorrência selecionada',()=>{
  const source={...meeting(),date:anchor};replaceState({...emptyState(),tasks:[source]});
  actions.saveSeries(source.id,{...source,time:'08:30',duration:30},'one',selected);
  expect(itemsForDate(getState().tasks,selected)).toMatchObject([{time:'08:30',duration:30}]);
  expect(itemsForDate(getState().tasks,anchor)).toMatchObject([{time:'10:00',duration:60}]);
});
