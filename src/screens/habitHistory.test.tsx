// @vitest-environment jsdom
import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {HabitCalendarSheet} from '../sheets/HabitCalendarSheet';
import {HabitsScreen} from './Habits';
import {emptyState,getState,newTask,replaceState} from '../store/store';
vi.mock('../store/sync',()=>({cloudEnabled:false,useCloud:(s:(c:unknown)=>unknown)=>s({auth:'out'})}));
let host:HTMLDivElement,root:Root;
const day='2026-11-06';
const series=newTask({id:'series',title:'Caminhar',kind:'habit',status:'active',recurrence:{freq:'daily',anchor:'2026-11-01'},skipDates:[day]});
const exception=newTask({id:'exception',title:'Caminhar mais tarde',kind:'habit',status:'active',date:day,time:'21:30',seriesId:'series',seriesDate:day});
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-07T12:00:00Z'));vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});replaceState({...emptyState(),tasks:[series,exception]},{resetUndo:true});host=document.createElement('div');document.body.append(host);root=createRoot(host);});
afterEach(()=>{act(()=>root.unmount());host.remove();replaceState(emptyState(),{resetUndo:true});vi.clearAllTimers();vi.useRealTimers();vi.unstubAllGlobals();});
it('calendário da série registra retrospectivamente a exceção no registro correto',()=>{
 act(()=>root.render(<HabitCalendarSheet id="series"/>));
 act(()=>host.querySelector<HTMLButtonElement>(`button[aria-label="${day}"]`)!.click());
 expect(getState().tasks.find(t=>t.id==='exception')!.status).toBe('done');
 expect(getState().tasks.find(t=>t.id==='series')!.doneDates??[]).not.toContain(day);
 expect(host.querySelector(`button[aria-label="${day} (concluído)"]`)).not.toBeNull();
 act(()=>host.querySelector<HTMLButtonElement>(`button[aria-label="${day} (concluído)"]`)!.click());
 expect(getState().tasks.find(t=>t.id==='exception')!.status).toBe('active');
 expect(getState().tasks.find(t=>t.id==='exception')!.time).toBe('21:30');
 expect(getState().tasks).toHaveLength(2);
});
it('hábito legado sem frequência continua acessível, sem marcar dias inventados',()=>{
 act(()=>replaceState({...getState(),tasks:[newTask({id:'legacy',title:'Hábito antigo',kind:'habit',status:'active',date:day})]}));
 act(()=>root.render(<HabitsScreen/>));expect(host.textContent).toContain('Hábito antigo');
 act(()=>root.render(<HabitCalendarSheet id="legacy"/>));
 expect(host.querySelector<HTMLButtonElement>('button[aria-label="2026-11-05"]')!.disabled).toBe(true);
 act(()=>host.querySelector<HTMLButtonElement>(`button[aria-label="${day}"]`)!.click());
 expect(getState().tasks[0].status).toBe('done');expect(getState().tasks[0].recurrence).toBeUndefined();
 act(()=>root.render(<HabitsScreen/>));expect(host.textContent).toContain('Hábito antigo');
});
it('ocorrência movida aparece no destino e não conclui a data original pulada',()=>{
 act(()=>replaceState({...getState(),tasks:[series,{...exception,date:'2026-11-05'}]}));
 act(()=>root.render(<HabitCalendarSheet id="exception"/>));
 expect(host.querySelector<HTMLButtonElement>(`button[aria-label="${day}"]`)!.disabled).toBe(true);
 act(()=>host.querySelector<HTMLButtonElement>('button[aria-label="2026-11-05"]')!.click());
 expect(getState().tasks[1].status).toBe('done');expect(getState().tasks[0].doneDates??[]).not.toContain(day);
});
it('consultar calendário por uma exceção não troca o alvo da edição ou exclusão para a série',()=>{
 const confirm=vi.spyOn(window,'confirm').mockReturnValue(true);
 act(()=>root.render(<HabitCalendarSheet id="exception"/>));
 act(()=>host.querySelector<HTMLButtonElement>('[aria-label="Excluir hábito"]')!.click());
 expect(confirm).toHaveBeenCalledWith(expect.stringContaining('ocorrência modificada'));
 expect(getState().tasks.map(t=>t.id)).toEqual(['series']);confirm.mockRestore();
});
