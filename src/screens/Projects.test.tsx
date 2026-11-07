// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { ProjectsScreen } from './Projects';
import { TaskSheet } from '../sheets/TaskSheet';
import { ProjectSheet } from '../sheets/OtherSheets';
import { actions, emptyState, getState, newTask, replaceState } from '../store/store';
import { closeAllSheets, getUI, setUI, useUI } from '../store/ui';
vi.mock('../store/sync',()=>({cloudEnabled:false,useCloud:(select:(s:unknown)=>unknown)=>select({auth:'out'})}));
vi.mock('../services/googleCalendar',()=>({useGoogleCalendar:(select:(s:unknown)=>unknown)=>select({connected:false,autoSync:false})}));
let host:HTMLDivElement,root:Root;
const task=(id:string,extra={})=>newTask({id,title:id,status:'active',projectId:'p',createdAt:1,updatedAt:1,...extra});
function Host(){const sheet=useUI(u=>u.sheet);return <><ProjectsScreen/>{sheet?.type==='task'&&<TaskSheet id={sheet.id} date={sheet.date} mode={sheet.mode}/>} {sheet?.type==='project'&&<ProjectSheet id={sheet.id}/>}</>;}
function click(label:string){const el=[...(host.querySelector('[role=dialog]')??host).querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label||b.getAttribute('aria-label')===label);if(!el)throw Error(label);act(()=>el.click());}
function input(selector:string,value:string){const el=host.querySelector<HTMLInputElement|HTMLTextAreaElement>(selector)!;act(()=>{Object.getOwnPropertyDescriptor(el.tagName==='TEXTAREA'?HTMLTextAreaElement.prototype:HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
function seed(tasks:ReturnType<typeof task>[]){act(()=>replaceState({...getState(),tasks}));}
function open(){act(()=>host.querySelector<HTMLButtonElement>('[data-project-id="p"]')!.click());}
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-07T12:00:00Z'));vi.spyOn(window,'scrollTo').mockImplementation(()=>{});vi.spyOn(window,'confirm').mockReturnValue(true);vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
 replaceState({...emptyState(),projects:[{id:'p',name:'Viagem',emoji:'✈️',color:'blue',createdAt:1},{id:'q',name:'Curso',emoji:'📚',color:'green',createdAt:2},{id:'archive',name:'Antigo',emoji:'📁',color:'blue',createdAt:3,archived:true}],tasks:[task('Reservar hospedagem')]},{resetUndo:true});closeAllSheets();setUI({tab:'projects',openProjectId:undefined,toasts:[]});host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<Host/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();closeAllSheets();replaceState(emptyState(),{resetUndo:true});vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
it('lista só projetos ativos em ordem estável, sem botão aninhado, com ícone legado',()=>{
 expect([...host.querySelectorAll('.project-card-name')].map(e=>e.textContent)).toEqual(['Viagem','Curso']);expect(host.querySelector('button button')).toBeNull();expect(host.querySelector('.project-symbol svg')).not.toBeNull();expect(host.textContent).not.toContain('✈');act(()=>actions.complete('Reservar hospedagem','2026-11-07'));expect([...host.querySelectorAll('.project-card-name')].map(e=>e.textContent)).toEqual(['Viagem','Curso']);
});
it('abre o detalhe, foca título, edita projeto sem mudar legado e devolve foco ao card ao voltar',()=>{
 open();expect(document.activeElement).toBe(host.querySelector('h1'));click('Editar projeto');input('[aria-label="Nome do projeto"]','Viagem planejada');click('Salvar');expect(getState().projects[0]).toMatchObject({name:'Viagem planejada',emoji:'✈️'});expect(getUI().openProjectId).toBe('p');click('Projetos');expect(document.activeElement).toBe(host.querySelector('[data-project-id="p"]'));
});
it('captura rápida cria tarefa ativa já vinculada sem formulário intermediário',()=>{
 open();input('.quick textarea','Comprar passagem');act(()=>host.querySelector<HTMLFormElement>('.quick')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));expect(getState().tasks.find(t=>t.title==='Comprar passagem')).toMatchObject({projectId:'p',status:'active'});expect(getUI().sheet).toBeUndefined();
});
it('captura não repete projeto no selo nem promete Inbox; Detalhar preserva vínculo e data interpretada',()=>{
 open();expect(host.querySelector('.quick-chips')).toBeNull();input('.quick textarea','Comprar passagem amanhã');expect(host.querySelector('.quick-chips')!.textContent).not.toContain('Viagem');expect(host.querySelector('.quick-hint')).toBeNull();click('Detalhar');expect(getUI().sheet).toMatchObject({type:'newTask',task:{projectId:'p',date:'2026-11-08'}});expect(getState().tasks).toHaveLength(1);
});
it('vazio não tem barra; concluído mantém captura e histórico com reabertura',()=>{
 seed([]);open();expect(host.querySelector('[role="progressbar"]')).toBeNull();expect(host.textContent).toContain('Adicione a primeira tarefa');seed([task('Feita',{status:'done'})]);expect(host.textContent).toContain('Tarefas pontuais concluídas');expect(host.querySelector('.quick')).not.toBeNull();click('Concluídas e encerradas · 1');click('Reabrir: Feita');expect(getState().tasks[0].status).toBe('active');expect(host.textContent).toContain('1 pendência');
});
it('conclui uma tarefa e atualiza o progresso sem trocar de projeto',()=>{open();click('Concluir: Reservar hospedagem');expect(getState().tasks[0].status).toBe('done');expect(host.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('100');expect(getUI().openProjectId).toBe('p');});
it('semanal abre, conclui e inicia foco na próxima segunda, nunca no sábado atual',()=>{
 seed([task('Semanal',{recurrence:{freq:'weekly',weekdays:[1],anchor:'2026-11-02'}})]);open();act(()=>host.querySelector<HTMLButtonElement>('.task-main')!.click());expect(getUI().sheet).toMatchObject({date:'2026-11-09'});act(()=>closeAllSheets());act(()=>host.querySelector<HTMLButtonElement>('[role="checkbox"]')!.click());expect(getState().tasks[0].doneDates).toEqual(['2026-11-09']);expect(getState().tasks[0].status).toBe('active');click('Começar Semanal');expect(getState().focus).toMatchObject({date:'2026-11-16',taskId:'Semanal'});expect(getUI().openProjectId).toBe('p');
});
it('compromisso antecipado conserva horário e conclusão da exceção não altera série',()=>{
 seed([task('Série',{kind:'event',recurrence:{freq:'weekly',weekdays:[1],anchor:'2026-11-02'},time:'08:30'}),task('Antecipada',{kind:'event',seriesId:'Série',seriesDate:'2026-11-09',date:'2026-11-08',time:'08:00'})]);open();act(()=>host.querySelector<HTMLButtonElement>('[aria-label^="Abrir Antecipada"]')!.click());expect(getUI().sheet).toMatchObject({id:'Antecipada',date:'2026-11-08'});expect(host.querySelector('[role="dialog"]')!.textContent).toContain('08:00');act(()=>closeAllSheets());act(()=>host.querySelector<HTMLButtonElement>('[aria-label^="Marcar que aconteceu: Antecipada"]')!.click());expect(getState().tasks[1].status).toBe('done');expect(getState().tasks[0].doneDates).toBeUndefined();act(()=>host.querySelector<HTMLButtonElement>('[aria-label^="Marcar que aconteceu: Série"]')!.click());expect(getState().tasks[0].doneDates).toEqual(['2026-11-16']);
});
it('série encerrada e arquivada não possuem checkbox nem início; arquivo abre restauração',()=>{
 seed([task('Encerrada',{recurrence:{freq:'daily',anchor:'2026-11-01',until:'2026-11-05'}}),task('Arquivo',{status:'archived'})]);open();click('Concluídas e encerradas · 1');click('Arquivadas · 1');expect(host.querySelector('[role="checkbox"]')).toBeNull();expect(host.querySelector('.task-action')).toBeNull();act(()=>host.querySelector<HTMLButtonElement>('[aria-label^="Abrir Arquivo"]')!.click());click('Restaurar tarefa');expect(getState().tasks[1].status).toBe('active');
});
it.each(['task','event'] as const)('abrir série %s encerrada não oferece ação de ocorrência inexistente',kind=>{
 seed([task('Encerrada',{kind,recurrence:{freq:'daily',anchor:'2026-11-01',until:'2026-11-05'}})]);open();click('Concluídas e encerradas · 1');act(()=>host.querySelector<HTMLButtonElement>('.task-main')!.click());expect(getUI().sheet).toMatchObject({type:'task',id:'Encerrada',mode:'edit'});expect(host.querySelector('[role="dialog"]')!.textContent).not.toMatch(/Começar agora|Aconteceu|Não aconteceu/);expect(host.querySelector('[role="dialog"]')!.textContent).toContain('Salvar alterações');expect(getState().tasks[0].doneDates).toBeUndefined();
});
it('tarefa abre, edita, salva e mantém vínculo e contexto, sem repetir projeto em cada linha',()=>{
 open();expect(host.querySelector('.catalog-meta')!.textContent).not.toContain('Viagem');act(()=>{host.querySelector<HTMLButtonElement>('.task-main')!.focus();host.querySelector<HTMLButtonElement>('.task-main')!.click();});click('Editar');input('[aria-label="Título"]','Reservar hotel');click('Salvar alterações');expect(getState().tasks[0]).toMatchObject({title:'Reservar hotel',projectId:'p'});expect(getUI().openProjectId).toBe('p');expect(host.querySelector('.task-title')!.textContent).toBe('Reservar hotel');
});
it('cem pendências possuem apresentação progressiva sem esconder o total',()=>{
 seed(Array.from({length:100},(_,i)=>task(`Tarefa ${i}`)));open();expect(host.querySelectorAll('.task')).toHaveLength(40);expect(host.textContent).toContain('100 pendências');click('Mostrar mais de Pendências');expect(host.querySelectorAll('.task')).toHaveLength(80);click('Mostrar mais de Pendências');expect(host.querySelectorAll('.task')).toHaveLength(100);
});
