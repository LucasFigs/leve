// @vitest-environment jsdom
import {act, type ReactNode} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ProjectIcon} from './ProjectIcon';
import {CATEGORIES} from '../domain/category';
import {PROJECT_ICONS} from '../domain/projectIcons';
import {ProjectSheet,SearchSheet} from '../sheets/OtherSheets';
import {TaskSheet} from '../sheets/TaskSheet';
import {ProjectsScreen} from '../screens/Projects';
import {TasksScreen} from '../screens/Tasks';
import {InboxScreen} from '../screens/Inbox';
import {AgendaScreen} from '../screens/Agenda';
import {FocusMode} from '../screens/Focus';
import {TaskCard} from './TaskCard';
import {TaskOverview} from './TaskOverview';
import {QuickAdd} from './QuickAdd';
import {actions,emptyState,getState,newTask,replaceState} from '../store/store';
import {closeAllSheets,getUI,setUI} from '../store/ui';
import {localRepository} from '../store/persistence';
vi.mock('../store/sync',()=>({cloudEnabled:false,useCloud:(select:(v:unknown)=>unknown)=>select({auth:'out'})}));
vi.mock('../services/googleCalendar',()=>({useGoogleCalendar:(select:(v:unknown)=>unknown)=>select({connected:false,autoSync:false})}));
let host:HTMLDivElement,root:Root;
const project={id:'p',name:'Viagem 🌊',emoji:'✈️',icon:'plane',color:'blue',createdAt:1};
function render(node:ReactNode){act(()=>root.render(node));}
function button(text:string){const b=[...host.querySelectorAll('button')].find(b=>b.textContent?.trim()===text||b.getAttribute('aria-label')===text);if(!b)throw Error(text);return b;}
function click(text:string){act(()=>button(text).click());}
function input(selector:string,value:string){const el=host.querySelector<HTMLInputElement>(selector)!;act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-12T12:00:00Z'));
 vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.spyOn(window,'confirm').mockReturnValue(true);vi.spyOn(window,'scrollTo').mockImplementation(()=>{});
 replaceState({...emptyState(),projects:[project],tasks:[newTask({id:'t',title:'Passo 🧭 pessoal',notes:'Notas 🌱 preservadas',status:'active',category:'trabalho',duration:30,projectId:'p'})]},{resetUndo:true});closeAllSheets();setUI({tab:'projects',openProjectId:undefined,toasts:[],agendaView:'day',agendaDate:'2026-11-12'});
 host=document.createElement('div');document.body.append(host);root=createRoot(host);
});
afterEach(()=>{act(()=>root.unmount());host.remove();closeAllSheets();replaceState(emptyState(),{resetUndo:true});vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
it.each(CATEGORIES)('renderiza $label com SVG decorativo e mantém o ID $id',category=>{
 render(<TaskSheet id="t" mode="edit"/>);const choice=host.querySelector<HTMLInputElement>(`input[name][value="${category.id}"]`)!;
 expect(choice).not.toBeNull();expect(choice.closest('label')!.querySelector('.choice-glyph svg path')!.getAttribute('d')).toBeTruthy();act(()=>choice.click());click('Salvar alterações');expect(getState().tasks[0].category).toBe(category.id);
});
it('cria projeto com catálogo nomeado, prévia imediata e identificador semântico persistido',()=>{
 render(<ProjectSheet/>);expect(host.querySelectorAll('.project-icon-grid button')).toHaveLength(12);
 for(const icon of PROJECT_ICONS){expect(button(`Ícone: ${icon.label}`).getAttribute('aria-pressed')).toBe(icon.value==='folder'?'true':'false');}
 input('[aria-label="Nome do projeto"]','Aprender 🎨');click('Ícone: Criatividade');click('Cor verde');expect(host.querySelector('.project-symbol')!.className).toContain('tone-green');
 expect(host.querySelector('.project-symbol path')!.getAttribute('d')).toBe(button('Ícone: Criatividade').querySelector('path')!.getAttribute('d'));
 click('Criar projeto');expect(getState().projects[1]).toMatchObject({name:'Aprender 🎨',icon:'palette',emoji:'🎨',color:'green'});expect(localRepository.load()!.projects[1]).toEqual(getState().projects[1]);
});
it('edita cor/ícone com SVG na prévia e preserva nomes e notas pessoais',()=>{
 render(<ProjectSheet id="p"/>);click('Ícone: Natureza');click('Cor verde');expect(host.querySelector('.project-symbol path')!.getAttribute('d')).toBe(button('Ícone: Natureza').querySelector('path')!.getAttribute('d'));
 click('Salvar');expect(getState().projects[0]).toMatchObject({name:'Viagem 🌊',emoji:'🌱',icon:'leaf',color:'green'});expect(getState().tasks[0].notes).toBe('Notas 🌱 preservadas');
});
it.each(['✈️','🦊 desconhecido'])('salvar só nome/cor não converte identificador legado %s',emoji=>{
 act(()=>replaceState({...getState(),projects:[{...project,emoji,icon:undefined}]}));render(<ProjectSheet id="p"/>);click('Cor verde');click('Salvar');expect(getState().projects[0].emoji).toBe(emoji);expect(getState().projects[0].icon).toBeUndefined();
});
it('lista, detalhe, TaskCard, visão da tarefa e captura rápida usam o mesmo SVG',()=>{
 render(<><span id="expected"><ProjectIcon project={project}/></span><ProjectsScreen/><TaskCard task={getState().tasks[0]}/><QuickAdd defaults={{projectId:'p'}}/></>);
 const expected=host.querySelector('#expected path')!.getAttribute('d');for(const selector of ['.project-symbol path','.task-meta path','.quick-chips path'])expect(host.querySelector(selector)!.getAttribute('d')).toBe(expected);
 expect(host.textContent).not.toContain('✈');act(()=>setUI({openProjectId:'p'}));expect(host.querySelector('.project-symbol path')!.getAttribute('d')).toBe(expected);
 const task=getState().tasks[0];render(<TaskOverview task={task} project={project} today="2026-11-12" occurrence="2026-11-12" defaultDuration={30} isDone={false} missed={false} onToggleStep={()=>{}} onArchive={()=>{}}/>);
 expect([...host.querySelectorAll('.task-context-chip path')].some(p=>p.getAttribute('d')===expected)).toBe(true);expect(host.textContent).toContain('Passo 🧭 pessoal');
});
it('categoria no card e detalhes usa o SVG com texto legível',()=>{
 const task={...getState().tasks[0],projectId:undefined,category:'saude' as const};render(<><TaskCard task={task}/><TaskOverview task={task} today="2026-11-12" occurrence="2026-11-12" defaultDuration={30} isDone={false} missed={false} onToggleStep={()=>{}} onArchive={()=>{}}/></>);
 expect(host.querySelector('.task-meta span svg')).not.toBeNull();expect(host.textContent).toContain('Saúde');expect(host.textContent).not.toContain('🏥');
});
it('busca mostra projeto em SVG e selects nativos ficam só com texto e IDs',()=>{
 render(<SearchSheet/>);input('input[aria-label="Buscar"]','Viagem');expect(host.querySelector('.list .task svg path')).not.toBeNull();expect(host.textContent).toContain('Viagem 🌊');expect(host.textContent).not.toContain('✈');
 render(<TasksScreen/>);act(()=>host.querySelector<HTMLButtonElement>('.tasks-filter-toggle')!.click());const option=host.querySelector('select[aria-label="Projeto"] option[value="p"]')!;expect(option.textContent).toBe('Viagem 🌊');expect(option.querySelector('svg')).toBeNull();
 expect(host.querySelector('select[aria-label="Categoria"] option[value="saude"]')!.textContent).toBe('Saúde');
});
it.each(['inbox','agenda','projects'] as const)('estado vazio %s mantém mensagem/ação com SVG',view=>{
 act(()=>replaceState(emptyState(),{resetUndo:true}));render(view==='inbox'?<InboxScreen/>:view==='agenda'?<AgendaScreen/>:<ProjectsScreen/>);
 expect(host.querySelector('.empty-icon svg[aria-hidden="true"] path')).not.toBeNull();expect(host.querySelector('.empty-title')!.textContent).toBeTruthy();if(view==='projects')expect(button('Novo projeto')).toBeDefined();
});
it('foco, pausas, extensão, conclusão e toast continuam funcionando sem emojis',()=>{
 act(()=>actions.startFocus('t','2026-11-12',1,true));render(<FocusMode/>);act(()=>vi.advanceTimersByTime(60_001));expect(getUI().toasts.some(t=>t.message.includes('Bloco de foco concluído'))).toBe(true);expect(getUI().toasts.every(t=>!/[\p{Extended_Pictographic}]/u.test(t.message))).toBe(true);
 click('Iniciar pausa (5 min)');expect(host.querySelector('.timer-value')!.textContent).toBe('05:00');click('Pausar');act(()=>vi.advanceTimersByTime(10_000));expect(host.querySelector('.timer-value')!.textContent).toBe('05:00');click('Continuar');act(()=>vi.advanceTimersByTime(300_001));expect(host.textContent).toContain('Pausa encerrada');click('Próximo foco (25 min)');expect(host.querySelector('.timer-value')!.textContent).toBe('25:00');click('+5 min');expect(host.querySelector('.timer-value')!.textContent).toBe('30:00');click('Concluir tarefa');expect(getState().tasks[0].status).toBe('done');
});
it('seletor Pomodoro mantém três fases nomeadas, com SVG e estado acessível',()=>{
 act(()=>actions.startFocus('t','2026-11-12',25,false));render(<FocusMode/>);act(()=>host.querySelector<HTMLElement>('.focus-options summary')!.click());
 for(const [label,time] of [['Foco (25m)','25:00'],['Pausa (5m)','05:00'],['Longa (15m)','15:00']]){click(label);expect(host.querySelector('.timer-value')!.textContent).toBe(time);expect(button(label).getAttribute('aria-pressed')).toBe('true');expect(button(label).querySelector('svg[aria-hidden="true"]')).not.toBeNull();}
});
