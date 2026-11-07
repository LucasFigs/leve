import {expect,it} from 'vitest';
import {newTask} from '../store/store';
import {emptyCatalogFilters,taskCatalog} from './taskCatalog';
const today='2026-11-07';
const task=(id:string,extra={})=>newTask({id,title:id,status:'active',createdAt:1,updatedAt:1,...extra});
const rows=(tasks:ReturnType<typeof task>[],filters={})=>taskCatalog(tasks,{...emptyCatalogFilters(),...filters},today).flatMap(g=>g.rows);
it('cada registro pertence a um único grupo, sem duplicar vencidas sem data ou compromissos passados',()=>{
 const tasks=[task('late',{date:'2026-11-06'}),task('due',{due:'2026-11-01'}),task('event',{kind:'event',date:'2026-11-01'}),task('future',{date:'2026-12-01'}),task('undated'),task('capture',{status:'inbox'})];
 expect(rows(tasks).map(r=>r.task.id).sort()).toEqual(tasks.map(t=>t.id).sort());expect(new Set(rows(tasks).map(r=>r.task.id)).size).toBe(tasks.length);
 expect(taskCatalog(tasks,emptyCatalogFilters(),today)[0].rows.map(r=>r.task.id)).toContain('event');
});
it('projeta exceção movida sem repetir a ocorrência original mesmo antes de skipDates',()=>{
 const series=task('series',{time:'08:30',duration:60,recurrence:{freq:'daily',anchor:today}}),exception=task('exception',{title:'Exceção',seriesId:'series',seriesDate:today,date:'2026-11-08',time:'08:00',duration:30});
 expect(rows([series,exception]).find(r=>r.task.id==='series')!.date).toBe('2026-11-08');
 const filtered=rows([series,exception],{q:'series'});expect(filtered).toHaveLength(1);expect(filtered[0].date).toBe('2026-11-08');expect(series.time).toBe('08:30');expect(exception.time).toBe('08:00');
});
it('uma conclusão parcial avança a linha da série para a próxima pendência e não fecha a série',()=>{
 const series=task('series',{recurrence:{freq:'daily',anchor:today},doneDates:[today],skipDates:['2026-11-08']});
 expect(rows([series])[0]).toMatchObject({date:'2026-11-09',ended:false});expect(rows([series],{status:'done'})).toEqual([]);
});
it('séries encerradas e arquivadas permanecem consultáveis, sem fabricar ocorrência hoje',()=>{
 const ended=task('ended',{recurrence:{freq:'daily',anchor:'2026-11-01',until:'2026-11-05'}}),archived=task('archived',{status:'archived'});
 expect(rows([ended,archived])).toEqual([]);expect(rows([ended],{status:'done'})[0]).toMatchObject({date:undefined,ended:true});expect(rows([ended,archived],{status:'all'})).toHaveLength(2);
});
it('sem data inclui pendências de projeto e prazo vencido, mas não captura ou série',()=>{
 const tasks=[task('project',{projectId:'p'}),task('due',{due:'2026-11-01'}),task('capture',{status:'inbox'}),task('series',{recurrence:{freq:'daily',anchor:today}})];
 expect(rows(tasks,{undated:true}).map(r=>r.task.id).sort()).toEqual(['due','project']);
});
it('ordena por dia/horário, prioridade e criação com desempate estável, sem mutar dados',()=>{
 const tasks=[task('later',{date:'2026-11-09'}),task('second',{date:today,time:'09:00'}),task('first',{date:today,time:'08:00'}),task('important',{priority:'important'}),task('essential',{priority:'essential'})];
 const before=JSON.stringify(tasks);expect(rows(tasks).map(r=>r.task.id)).toEqual(['first','second','later','essential','important']);expect(JSON.stringify(tasks)).toBe(before);
});
