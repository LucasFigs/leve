import type {Task} from './types';
import {occursOn} from './recurrence';

/** Projeção somente de leitura: exceções continuam sendo registros independentes. */
export function habitRoot(task: Task, tasks: Task[]): Task {
  return tasks.find(t=>t.id===task.seriesId && t.kind==='habit' && !!t.recurrence) ?? task;
}
export function habitEntryForDate(task: Task, tasks: Task[], date: string): Task | undefined {
  const root=habitRoot(task,tasks);
  const exceptions=tasks.filter(t=>t.kind==='habit'&&!t.recurrence&&t.seriesId===root.id&&t.date===date&&t.status!=='archived');
  // Colisões legadas não podem ser fundidas ou concluídas por adivinhação.
  if(exceptions.length) return exceptions.length===1?exceptions[0]:undefined;
  if(root.status==='archived'||root.status==='inbox')return;
  if(!root.recurrence)return root.date===date?root:undefined;
  const replaced=tasks.some(t=>!t.recurrence&&t.seriesId===root.id&&t.seriesDate===date);
  return !replaced&&!root.skipDates?.includes(date)&&occursOn(root.recurrence,date)?root:undefined;
}
export function habitHistory(task: Task,tasks: Task[]): Task {
  const root=habitRoot(task,tasks);
  const exceptions=tasks.filter(t=>!t.recurrence&&t.seriesId===root.id&&t.seriesDate);
  const replaced=new Set(exceptions.map(t=>t.seriesDate!));
  const done=new Set((root.doneDates??[]).filter(d=>!replaced.has(d)));
  if(!root.recurrence&&root.status==='done'&&root.date)done.add(root.date);
  for(const e of exceptions)if(e.kind==='habit'&&e.status==='done'&&!e.missed&&e.date)done.add(e.date);
  const skip=new Set([...(root.skipDates??[]),...replaced]);
  for(const e of exceptions)if(e.kind==='habit'&&e.status!=='archived'&&e.date===e.seriesDate)skip.delete(e.seriesDate!);
  return {...root,doneDates:[...done].sort(),skipDates:[...skip].sort()};
}
