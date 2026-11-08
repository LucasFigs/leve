// @vitest-environment jsdom
import {act} from 'react';import {createRoot,type Root} from 'react-dom/client';
import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {TasksScreen} from './Tasks';import {HabitsScreen} from './Habits';import {ProjectsScreen} from './Projects';import {ProfileScreen} from './Profile';import {AgendaScreen} from './Agenda';
import {emptyState,replaceState} from '../store/store';import {getUI,setUI,useUI,closeAllSheets} from '../store/ui';
const fixture=vi.hoisted(()=>({cloud:false}));
vi.mock('../store/sync',()=>({get cloudEnabled(){return fixture.cloud;},useCloud:(select:(s:unknown)=>unknown)=>select({auth:fixture.cloud?'in':'out',status:'synced',userId:fixture.cloud?'fixture':undefined,email:'fixture@example.test',user:{fullName:'Pessoa fictícia',provider:'email'}}),supabase:undefined,confirmSignOut:vi.fn(),syncNow:vi.fn()}));
vi.mock('../services/googleCalendar',()=>({useGoogleCalendar:(select?:(s:unknown)=>unknown)=>{const s={connected:false,status:'idle'};return select?select(s):s;},restoreGoogleCalendarConnection:vi.fn(),disconnectGoogleCalendar:vi.fn()}));
let host:HTMLDivElement,root:Root;
function Host(){const tab=useUI(u=>u.tab);return tab==='profile'?<ProfileScreen/>:tab==='projects'?<ProjectsScreen/>:tab==='habits'?<HabitsScreen/>:tab==='agenda'?<AgendaScreen/>:<TasksScreen/>;}
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.useFakeTimers();vi.stubGlobal('requestAnimationFrame',(callback:FrameRequestCallback)=>window.setTimeout(()=>callback(16),16));vi.setSystemTime(new Date('2026-11-08T12:00:00Z'));vi.spyOn(window,'scrollTo').mockImplementation(()=>{});Element.prototype.scrollIntoView=vi.fn();vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));fixture.cloud=false;replaceState({...emptyState(),projects:[{id:'p',name:'Projeto fictício',emoji:'',icon:'folder',color:'blue',createdAt:1}]},{resetUndo:true});setUI({tab:'tasks',profileReturn:undefined,agendaProfileRestore:false,agendaDate:'2026-11-12',agendaView:'week',agendaOpenDay:'2026-11-10',openProjectId:undefined});closeAllSheets();host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<Host/>));});
afterEach(()=>{act(()=>root.unmount());host.remove();replaceState(emptyState(),{resetUndo:true});closeAllSheets();vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
function click(label:string){const b=[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.getAttribute('aria-label')===label||b.textContent?.trim()===label);if(!b)throw Error(label);act(()=>b.click());}
it.each([['tasks','Nova tarefa','newTask'],['habits','Novo hábito','newTask'],['projects','Novo projeto','project']] as const)('criação específica de %s usa só ícone com nome acessível', (tab,label,type)=>{
 act(()=>setUI({tab}));const b=host.querySelector<HTMLButtonElement>(`.topbar [aria-label="${label}"]`)!;expect(b.textContent).toBe('');expect(b.querySelector('svg')).not.toBeNull();click(label);expect(getUI().sheet?.type).toBe(type);
 if(tab==='habits')expect(getUI().sheet).toMatchObject({task:{kind:'habit',recurrence:{freq:'daily',anchor:'2026-11-08'}}});if(tab==='tasks')expect(getUI().sheet).toMatchObject({task:{kind:'task'}});
});
it.each([false,true])('avatar vai direto às configurações e volta à tela de origem (cloud=%s)',cloud=>{
 fixture.cloud=cloud;act(()=>setUI({tab:'habits'}));expect(host.querySelector('[aria-label="Buscar"]')).not.toBeNull();click('Conta e perfil');expect(getUI().tab).toBe('profile');expect(getUI().sheet).toBeUndefined();expect(host.querySelector('.topbar [aria-label="Conta e perfil"]')).toBeNull();expect(host.textContent).toContain('Conta e sincronização');click('Voltar');expect(getUI().tab).toBe('habits');act(()=>vi.advanceTimersByTime(20));expect(document.activeElement).toBe(host.querySelector('[aria-label="Conta e perfil"]'));
});
it('detalhe preserva editar, perfil, projeto aberto e retorno à lista',()=>{
 act(()=>setUI({tab:'projects',openProjectId:'p'}));expect(host.querySelector('h1')?.textContent).toBe('Projeto fictício');click('Editar projeto');expect(getUI().sheet).toEqual({type:'project',id:'p'});act(()=>closeAllSheets());expect(host.querySelector('.project-capture')).not.toBeNull();click('Conta e perfil');click('Voltar');expect(getUI()).toMatchObject({tab:'projects',openProjectId:'p'});click('Projetos');expect(getUI().openProjectId).toBeUndefined();
});
it('retorno da Agenda mantém data, modo e dia expandido, sem reinicializar o contexto',()=>{
 act(()=>setUI({tab:'agenda'}));act(()=>setUI({agendaOpenDay:'2026-11-10'}));click('Conta e perfil');click('Voltar');act(()=>vi.advanceTimersByTime(150));expect(getUI()).toMatchObject({tab:'agenda',agendaDate:'2026-11-12',agendaView:'week',agendaOpenDay:'2026-11-10'});expect(host.querySelector('.agenda-header .topbar')).not.toBeNull();expect(host.querySelector('.agenda-body [aria-label="Visualização"]')).not.toBeNull();
});
