// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { actions, emptyState, getState, newTask, replaceState, subscribe } from './store';
import { localRepository } from './persistence';
const capture=(id:string)=>newTask({id,title:`Captura ${id}`,status:'inbox',notes:'Nota fictícia',category:'pessoal',subtasks:[{id:'step',title:'Passo',done:false}]});
beforeEach(()=>replaceState({...emptyState(),tasks:[capture('a'),capture('b'),capture('c'),newTask({id:'later',title:'Quando der',status:'active'})]},{resetUndo:true}));
afterEach(()=>replaceState(emptyState(),{resetUndo:true}));
it('remove três capturas em um estado e desfaz o lote inteiro sem duplicar',()=>{
  const before=getState();const listener=vi.fn();const off=subscribe(listener);
  const result=actions.removeMany(['a','b','c','a','missing',42] as never);
  expect(result.count).toBe(3);expect(listener).toHaveBeenCalledTimes(1);expect(getState().tasks.map(t=>t.id)).toEqual(['later']);
  expect(actions.undo()).toBe(true);expect(listener).toHaveBeenCalledTimes(2);off();
  for(const t of before.tasks)expect(getState().tasks.find(x=>x.id===t.id)).toEqual(t);
  expect(result.undo()).toBe(0);expect(new Set(getState().tasks.map(t=>t.id)).size).toBe(4);
});
it('não altera nada com IDs inválidos, ausentes ou já organizados',()=>{
  const before=getState();expect(actions.removeMany([null,{},'later','missing'] as never).count).toBe(0);expect(getState()).toBe(before);
  expect(actions.removeMany(null as never).count).toBe(0);
});
it('protege compromissos, hábitos, séries, exceções, projetos e capturas organizadas',()=>{
  const protectedTasks=[capture('a'),{...capture('event'),kind:'event' as const},{...capture('habit'),kind:'habit' as const},
    {...capture('series'),recurrence:{freq:'daily' as const,anchor:'2026-11-07'}},{...capture('exception'),seriesId:'series',seriesDate:'2026-11-07'},
    {...capture('project'),projectId:'project-fixture'},{...capture('done'),status:'done' as const},{...capture('archived'),status:'archived' as const}];
  replaceState({...getState(),tasks:protectedTasks});actions.organize('a',{date:'2026-11-08'});
  const before=getState();expect(actions.removeMany(protectedTasks.map(t=>t.id)).count).toBe(0);expect(getState()).toBe(before);
});
it('desfazer preserva alterações posteriores, preferências e registros remotos com o mesmo ID',()=>{
  const result=actions.removeMany(['a','b']);actions.capture('Nova captura');actions.update('c',{title:'Atualizada depois'});actions.updateSettings({name:'Nome fictício'});
  replaceState({...getState(),tasks:[...getState().tasks,{...capture('a'),title:'Versão remota mais nova'}]});
  expect(result.undo()).toBe(1);expect(getState().tasks.find(t=>t.id==='a')!.title).toBe('Versão remota mais nova');
  expect(getState().tasks.find(t=>t.id==='c')!.title).toBe('Atualizada depois');expect(getState().tasks.some(t=>t.title==='Nova captura')).toBe(true);
  expect(getState().settings.name).toBe('Nome fictício');expect(getState().tasks.filter(t=>t.id==='a')).toHaveLength(1);
});
it('não restaura em outra sessão nem depois de apagar dados',()=>{
  const result=actions.removeMany(['a']);replaceState({...emptyState(),tasks:[capture('new-owner')]},{resetUndo:true});
  expect(result.undo()).toBe(0);expect(getState().tasks.map(t=>t.id)).toEqual(['new-owner']);
  const next=actions.removeMany(['new-owner']);actions.reset();expect(next.undo()).toBe(0);
});
it('persiste exclusão/reversão e não serializa o histórico ou a seleção',()=>{
  const result=actions.removeMany(['a','b']);const loaded=localRepository.load()!;expect(loaded.tasks.map(t=>t.id)).toEqual(['c','later']);
  replaceState(loaded);expect(result.undo()).toBe(2);expect(localRepository.load()!.tasks).toHaveLength(4);
  const raw=JSON.stringify(localRepository.load());expect(raw).not.toContain('undo');expect(raw).not.toContain('selected');
});
