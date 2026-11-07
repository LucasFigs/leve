// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { InboxScreen } from './Inbox';
import { actions, emptyState, getState, invalidateInboxOperations, newTask, replaceState } from '../store/store';
import { closeAllSheets, getUI, setUI, useUI } from '../store/ui';
import { TaskSheet } from '../sheets/TaskSheet';
import { TaskCard } from '../components/TaskCard';
import { Toasts } from '../components/ui';
import { localRepository } from '../store/persistence';
vi.mock('../store/sync',()=>({cloudEnabled:false,useCloud:(select:(s:unknown)=>unknown)=>select({auth:'out'})}));
vi.mock('../services/googleCalendar',()=>({useGoogleCalendar:(select:(s:unknown)=>unknown)=>select({connected:false,autoSync:false})}));
let host:HTMLDivElement,root:Root;
const capture=(id:string)=>newTask({id,title:`Captura ${id}`,status:'inbox',duration:30,notes:'Notas fictícias'});
function Host(){const sheet=useUI(u=>u.sheet);return <><InboxScreen/>{sheet?.type==='task'&&<TaskSheet id={sheet.id} date={sheet.date}/>}<Toasts/></>;}
function button(label:string,container:ParentNode=host){const b=[...container.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label);if(!b)throw Error(`Botão: ${label}`);return b;}
function click(label:string,container:ParentNode=host){act(()=>button(label,container).click());}
function named(label:string){const el=host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`);if(!el)throw Error(label);return el;}
function choose(id:string){act(()=>named(`Selecionar captura: Captura ${id}`).click());}
function confirm(){click('Excluir',host.querySelector('[role="dialog"]')!);}
beforeEach(()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.useFakeTimers();vi.spyOn(window,'confirm').mockReturnValue(true);
  vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.spyOn(HTMLElement.prototype,'getClientRects').mockReturnValue([{}] as unknown as DOMRectList);
  replaceState({...emptyState(),tasks:[capture('a'),capture('b'),capture('c'),newTask({id:'later',title:'Quando der fictício',status:'active'})]},{resetUndo:true});
  closeAllSheets();setUI({tab:'inbox',toasts:[]});host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<Host/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();closeAllSheets();replaceState(emptyState(),{resetUndo:true});vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});

it('oferece lixeira apenas no contexto explícito do Inbox e mantém abertura pelo corpo',()=>{
  expect(host.querySelectorAll('.inbox-trash')).toHaveLength(3);expect(host.querySelector('button button')).toBeNull();
  act(()=>host.querySelector<HTMLButtonElement>('.task-main')!.click());expect(getUI().sheet).toMatchObject({type:'task',id:'a'});
  act(()=>{closeAllSheets();root.render(<TaskCard task={getState().tasks[0]}/>);});expect(host.querySelector('.inbox-trash')).toBeNull();
});
it('cancelar lixeira não abre editor, conclui ou remove a captura e devolve foco',()=>{
  const before=getState();act(()=>named('Excluir captura: Captura a').click());expect(getUI().sheet).toBeUndefined();
  expect(document.activeElement?.textContent).toBe('Cancelar');click('Cancelar',host.querySelector('[role="dialog"]')!);
  expect(getState()).toBe(before);expect(host.querySelector('[role="dialog"]')).toBeNull();expect(named('Excluir captura: Captura a')).toBeDefined();
});
it('exclui uma captura diretamente e desfaz com IDs/metadados preservados',()=>{
  const before=getState().tasks.find(t=>t.id==='a');act(()=>named('Excluir captura: Captura a').click());confirm();
  expect(getState().tasks.some(t=>t.id==='a')).toBe(false);expect(getUI().sheet).toBeUndefined();expect(host.textContent).toContain('1 captura excluída');
  click('Desfazer');expect(getState().tasks.find(t=>t.id==='a')).toEqual(before);expect(host.querySelectorAll('.inbox-trash')).toHaveLength(3);
});
it('Inbox → selecionar três → confirmar exclusão → desfazer restaura o lote inteiro',()=>{
  const before=getState();click('Selecionar');for(const id of ['a','b','c'])choose(id);
  expect(getState()).toBe(before);expect(host.textContent).toContain('3 capturas selecionadas');click('Excluir selecionadas');
  expect(host.querySelector('[role="dialog"]')!.textContent).toContain('Excluir 3 capturas selecionadas?');confirm();
  expect(getState().tasks.map(t=>t.id)).toEqual(['later']);expect(host.textContent).toContain('3 capturas excluídas');
  click('Desfazer');for(const t of before.tasks)expect(getState().tasks.find(x=>x.id===t.id)).toEqual(t);
  expect(new Set(getState().tasks.map(t=>t.id)).size).toBe(4);expect(button('Selecionar')).toBeDefined();
});
it('entra/sai da seleção, alterna checkbox e bloqueia excluir com zero',()=>{
  click('Selecionar');expect(button('Excluir selecionadas').disabled).toBe(true);choose('a');expect(named('Selecionar captura: Captura a').getAttribute('aria-checked')).toBe('true');
  choose('a');expect(button('Excluir selecionadas').disabled).toBe(true);click('Cancelar seleção');expect(host.querySelector('.inbox-selection-tools')).toBeNull();
  click('Selecionar');expect(named('Selecionar captura: Captura a').getAttribute('aria-checked')).toBe('false');
});
it('selecionar todas ignora Quando der e vínculos legados não elegíveis',()=>{
  act(()=>replaceState({...getState(),tasks:[...getState().tasks,{...capture('event'),kind:'event'},{...capture('habit'),kind:'habit'},
    {...capture('series'),recurrence:{freq:'daily',anchor:'2026-11-07'}},{...capture('project'),projectId:'project-fixture'}]}));
  click('Selecionar');click('Selecionar todas');expect(host.textContent).toContain('3 capturas selecionadas');
  for(const id of ['event','habit','series','project'])expect(named(`Selecionar captura: Captura ${id}`).disabled).toBe(true);
  expect(host.querySelector('[aria-label="Selecionar captura: Quando der fictício"]')).toBeNull();
  click('Excluir selecionadas');confirm();expect(getState().tasks.map(t=>t.id).sort()).toEqual(['event','habit','later','project','series'].sort());
});
it('cancelar confirmação preserva seleção e permite limpar ou revisar capturas',()=>{
  click('Selecionar');choose('a');choose('b');click('Excluir selecionadas');click('Cancelar',host.querySelector('[role="dialog"]')!);
  expect(host.textContent).toContain('2 capturas selecionadas');click('Limpar seleção');expect(button('Excluir selecionadas').disabled).toBe(true);
  click('Revisar capturas');expect(getUI().sheet?.type).toBe('review');
});
it('retira da seleção itens organizados/removidos e não seleciona adições automaticamente',()=>{
  click('Selecionar');click('Selecionar todas');act(()=>{actions.organize('a',{date:'2026-11-08'});actions.remove('b');actions.add(capture('new'));});
  expect(host.textContent).toContain('1 captura selecionada');expect(named('Selecionar captura: Captura new').getAttribute('aria-checked')).toBe('false');
  click('Excluir selecionadas');confirm();expect(getState().tasks.some(t=>t.id==='a')).toBe(true);expect(getState().tasks.some(t=>t.id==='new')).toBe(true);
});
it('atualiza a quantidade se uma captura é organizada durante a confirmação',()=>{
  click('Selecionar');click('Selecionar todas');click('Excluir selecionadas');act(()=>actions.organize('a',{date:'2026-11-08'}));
  expect(host.querySelector('[role="dialog"]')!.textContent).toContain('Excluir 2 capturas selecionadas?');confirm();
  expect(getState().tasks.find(t=>t.id==='a')!.status).toBe('active');expect(host.textContent).toContain('2 capturas excluídas');
});
it('não mostra sucesso nem permite confirmar se todos deixaram de ser elegíveis',()=>{
  click('Selecionar');choose('a');click('Excluir selecionadas');act(()=>actions.organize('a',{date:'2026-11-08'}));
  expect(button('Excluir',host.querySelector('[role="dialog"]')!).disabled).toBe(true);expect(host.textContent).toContain('não estão mais disponíveis');
  expect(host.textContent).not.toContain('captura excluída');
});
it('desfazer pelo toast preserva mudanças posteriores e dados remotos',()=>{
  act(()=>named('Excluir captura: Captura a').click());confirm();act(()=>{actions.update('b',{title:'Atualização posterior'});actions.capture('Nova captura');});
  click('Desfazer');expect(getState().tasks.find(t=>t.id==='b')!.title).toBe('Atualização posterior');expect(getState().tasks.some(t=>t.title==='Nova captura')).toBe(true);
});
it('invalida confirmação, seleção e desfazer ao trocar de sessão',()=>{
  act(()=>named('Excluir captura: Captura c').click());confirm();const undo=getUI().toasts.find(t=>t.action)!.action!;
  click('Selecionar');choose('a');click('Excluir selecionadas');act(()=>invalidateInboxOperations());
  expect(host.querySelector('[role="dialog"]')).toBeNull();expect(button('Selecionar')).toBeDefined();
  act(()=>replaceState({...emptyState(),tasks:[capture('other-owner')]},{resetUndo:true}));act(()=>undo.run());
  expect(getState().tasks.map(t=>t.id)).toEqual(['other-owner']);
});
it('receber lista remota poda seleção; trocar de aba não reaproveita IDs',()=>{
  click('Selecionar');click('Selecionar todas');act(()=>replaceState({...getState(),tasks:getState().tasks.filter(t=>t.id!=='a')}));
  expect(host.textContent).toContain('2 capturas selecionadas');act(()=>setUI({tab:'tasks'}));act(()=>setUI({tab:'inbox'}));
  expect(host.querySelector('.inbox-selection-tools')).toBeNull();click('Selecionar');expect(host.textContent).toContain('0 capturas selecionadas');
});
it('persistência após exclusão mantém o lote ausente e reload real não serializa seleção',()=>{
  click('Selecionar');click('Selecionar todas');click('Excluir selecionadas');confirm();
  const loaded=localRepository.load()!;expect(loaded.tasks.map(t=>t.id)).toEqual(['later']);act(()=>replaceState(loaded));
  act(()=>root.render(<Host key="reload"/>));expect(host.querySelector('.inbox-selection-tools')).toBeNull();
  expect(host.textContent).toContain('Tudo limpo');
});
