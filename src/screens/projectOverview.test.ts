import { expect, it } from 'vitest';
import { newTask } from '../store/store';
import { projectOverview } from './projectOverview';
const today='2026-11-07';
const task=(id:string,extra={})=>newTask({id,title:id,status:'active',projectId:'p',createdAt:1,updatedAt:1,...extra});
const overview=(tasks:ReturnType<typeof task>[])=>projectOverview(tasks,'p',today);
it('A: progresso conta só tarefas pontuais e acompanha reabertura sem mutar registros',()=>{
 const tasks=[task('a'),task('b'),task('c',{status:'done'}),task('d',{status:'done'})],before=JSON.stringify(tasks);
 expect(overview(tasks).progress).toEqual({total:4,done:2,pct:.5});expect(JSON.stringify(tasks)).toBe(before);
 expect(overview(tasks.map(t=>t.id==='c'?{...t,status:'active' as const}:t)).progress.done).toBe(1);
});
it('J: exclui capturas, arquivos, outros projetos, hábitos, séries e exceções da barra',()=>{
 const tasks=[task('a'),task('done',{status:'done'}),task('archive',{status:'archived'}),task('capture',{status:'inbox'}),task('other',{projectId:'q'}),task('habit',{kind:'habit'}),task('series',{recurrence:{freq:'weekly',weekdays:[1],anchor:today}}),task('exception',{seriesId:'series',seriesDate:today,date:today}),task('event',{kind:'event',date:today})];
 const v=overview(tasks);expect(v.progress).toEqual({total:2,done:1,pct:.5});expect(v.actions).toHaveLength(2);expect(v.events).toHaveLength(1);expect(v.continuous).toHaveLength(3);expect(v.archived).toHaveLength(1);expect(v.pending).toHaveLength(6);
});
it('C: vazio não fabrica progresso nem conclusão',()=>{const v=overview([]);expect(v.progress.total).toBe(0);expect(v.summary).toBe('Adicione a primeira tarefa');});
it('E: reunião futura mantém pendência e horário sem fingir conclusão',()=>{const v=overview([task('meeting',{kind:'event',date:'2026-11-09',time:'08:30'})]);expect(v.summary).toBe('1 compromisso');expect(v.progress.total).toBe(0);expect(v.events[0].task.time).toBe('08:30');});
it('D: realizações parciais não fecham série semanal nem a incluem na barra',()=>{const v=overview([task('weekly',{recurrence:{freq:'weekly',weekdays:[1],anchor:'2026-11-02'},doneDates:['2026-11-02','2026-11-09']})]);expect(v.continuous[0]).toMatchObject({date:'2026-11-16',ended:false});expect(v.progress.total).toBe(0);expect(v.summary).toBe('1 atividade contínua');});
it('F: exceção antecipada suprime original mesmo vinculada a outro projeto',()=>{
 const series=task('series',{kind:'event',recurrence:{freq:'weekly',weekdays:[1],anchor:'2026-11-02'},time:'08:30'}),exception=task('exception',{kind:'event',seriesId:'series',seriesDate:'2026-11-09',date:'2026-11-08',time:'08:00'});
 const v=overview([series,exception]);expect(v.events.find(r=>r.task.id==='series')!.date).toBe('2026-11-16');expect(v.events.find(r=>r.task.id==='exception')!.date).toBe('2026-11-08');
 expect(overview([series,{...exception,projectId:'q'}]).events[0].date).toBe('2026-11-16');
});
it('séries encerradas ficam no histórico sem data de ação inventada',()=>{const v=overview([task('ended',{recurrence:{freq:'daily',anchor:'2026-11-01',until:'2026-11-05'}})]);expect(v.pending).toEqual([]);expect(v.history[0]).toMatchObject({date:undefined,ended:true});expect(v.summary).toBe('Sem pendências atuais');});
it('G: conclusão pontual não mascara hábitos ou compromissos restantes',()=>{
 const done=task('done',{status:'done'});expect(overview([done]).summary).toBe('Tarefas pontuais concluídas');expect(overview([done,task('habit',{kind:'habit'})]).summary).toBe('1 atividade contínua');expect(overview([done,task('meeting',{kind:'event'})]).summary).toBe('1 compromisso');
});
it('B: cem registros são projetados uma vez cada, com ordem estável e sem mutação',()=>{const tasks=Array.from({length:100},(_,i)=>task(String(i),{status:i%10===0?'archived':i%4===0?'done':'active',date:i%3?'2026-11-09':undefined}));const before=JSON.stringify(tasks),v=overview(tasks);expect(v.pending.length+v.history.length+v.archived.length).toBe(100);expect(new Set([...v.pending,...v.history,...v.archived].map(r=>r.task.id)).size).toBe(100);expect(overview(tasks)).toEqual(v);expect(JSON.stringify(tasks)).toBe(before);});
