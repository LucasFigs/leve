import {expect,it} from 'vitest';
import {newTask} from '../store/store';
import {overdueTasks} from './selectors';
import {emptyCatalogFilters,taskCatalog} from '../screens/taskCatalog';
const today='2026-11-07';
const task=(id:string,extra={})=>newTask({id,title:id,status:'active',date:'2026-11-06',...extra});
it('não cobra hábitos diários, semanais, legados nem exceções sem recurrence',()=>{
 const list=[task('pontual'),task('diário',{kind:'habit',recurrence:{freq:'daily',anchor:'2026-11-01'}}),task('semanal',{kind:'habit',recurrence:{freq:'weekly',anchor:'2026-11-01',weekdays:[5]}}),task('legado',{kind:'habit'}),task('exceção',{kind:'habit',seriesId:'diário',seriesDate:'2026-11-06',time:'21:30'})];
 const before=JSON.stringify(list);
 expect(overdueTasks(list,today).map(t=>t.id)).toEqual(['pontual']);
 const groups=taskCatalog(list,emptyCatalogFilters(),today);
 expect(groups.find(g=>g.key==='attention')?.rows.map(r=>r.task.id)).toEqual(['pontual']);
 expect(groups.flatMap(g=>g.rows).map(r=>r.task.id)).toContain('legado');
 expect(JSON.stringify(list)).toBe(before);
});
