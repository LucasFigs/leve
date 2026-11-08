import {it,expect} from 'vitest';
import {newTask} from '../store/store';
import {habitHistory,habitEntryForDate,habitRoot} from './habitHistory';
import {itemsForDate} from './selectors';
const date='2026-11-06';
const root=newTask({id:'h',title:'Prática',kind:'habit',status:'active',recurrence:{freq:'weekly',weekdays:[5],anchor:'2026-10-30'},doneDates:[date]});
const exception=newTask({id:'x',title:'Prática alterada',kind:'habit',status:'active',seriesId:'h',seriesDate:date,date,time:'21:30'});
it('exceção substitui conclusão antiga sem mutar a série nem duplicar ocorrência',()=>{
 const tasks=[root,exception],before=JSON.stringify(tasks);
 expect(habitHistory(root,tasks).doneDates).not.toContain(date);expect(habitEntryForDate(root,tasks,date)?.id).toBe('x');
 expect(itemsForDate(tasks,date).map(i=>i.task.id)).toEqual(['x']);expect(JSON.stringify(tasks)).toBe(before);
});
it('histórico de exceção concluída reconcilia com a série, sem reescrever skipDates',()=>{
 const tasks=[{...root,skipDates:[date]},{...exception,status:'done' as const}];
 expect(habitHistory(root,tasks).doneDates).toEqual([date]);expect(habitHistory(root,tasks).skipDates).not.toContain(date);
 expect(tasks[0].skipDates).toEqual([date]);expect(habitRoot(exception,tasks).id).toBe('h');
});
it('colisões no mesmo destino ficam sem conclusão ambígua; órfã continua acessível',()=>{
 const tasks=[root,exception,{...exception,id:'x2',seriesDate:'2026-10-30'}];
 expect(habitEntryForDate(root,tasks,date)).toBeUndefined();
 expect(habitRoot(exception,[exception])).toBe(exception);expect(habitEntryForDate(exception,[exception],date)?.id).toBe('x');
});
it('exceção arquivada não faz ressurgir a ocorrência original',()=>{
 expect(habitEntryForDate(root,[root,{...exception,status:'archived'}],date)).toBeUndefined();
});
