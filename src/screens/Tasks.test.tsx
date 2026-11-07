// @vitest-environment jsdom
import {act} from 'react';
import {createRoot,type Root} from 'react-dom/client';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {TasksScreen} from './Tasks';
import {ProjectsScreen} from './Projects';
import {HabitsScreen} from './Habits';
import {TaskSheet} from '../sheets/TaskSheet';
import {actions,emptyState,getState,newTask,replaceState} from '../store/store';
import {closeAllSheets,getUI,setUI,useUI} from '../store/ui';
vi.mock('../store/sync',()=>({cloudEnabled:false,useCloud:(select:(s:unknown)=>unknown)=>select({auth:'out'})}));
vi.mock('../services/googleCalendar',()=>({useGoogleCalendar:(select:(s:unknown)=>unknown)=>select({connected:false,autoSync:false})}));
let host:HTMLDivElement,root:Root;
const t=(id:string,extra={})=>newTask({id,title:id,status:'active',createdAt:1,updatedAt:1,...extra});
function Host(){const sheet=useUI(u=>u.sheet),tab=useUI(u=>u.tab);return <>{tab==='projects'?<ProjectsScreen/>:tab==='habits'?<HabitsScreen/>:<TasksScreen/>}{sheet?.type==='task'&&<TaskSheet key={sheet.id} id={sheet.id} date={sheet.date}/>}</>;}
function click(label:string){const el=[...host.querySelectorAll<HTMLButtonElement>('button')].find(b=>b.textContent?.trim()===label||b.getAttribute('aria-label')===label);if(!el)throw Error(label);act(()=>el.click());}
function input(value:string){const el=host.querySelector<HTMLInputElement>('[aria-label="Filtrar tarefas"]')!;act(()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(el,value);el.dispatchEvent(new Event('input',{bubbles:true}));});}
function select(label:string,value:string){const el=host.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;act(()=>{el.value=value;el.dispatchEvent(new Event('change',{bubbles:true}));});}
function titles(){return [...host.querySelectorAll('.task-title')].map(e=>e.textContent);}
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-07T12:00:00Z'));vi.spyOn(window,'scrollTo').mockImplementation(()=>{});vi.spyOn(window,'confirm').mockReturnValue(true);vi.stubGlobal('ResizeObserver',class{observe(){}disconnect(){}});
 replaceState({...emptyState(),projects:[{id:'p',name:'Entrega',emoji:'💼',icon:'briefcase',color:'blue',createdAt:1}],tasks:[t('Enviar relatório',{projectId:'p',priority:'essential',category:'trabalho',notes:'Indicadores da entrega',subtasks:[{id:'step',title:'Validar números',done:false}]}),t('Atrasada',{date:'2026-11-06',priority:'important',category:'pessoal'}),t('Planejada',{date:'2026-11-09',time:'08:00',category:'casa'}),t('Captura',{status:'inbox'}),t('Concluída',{status:'done',completedAt:2}),t('Arquivada',{status:'archived'}),t('Consulta',{kind:'event',date:'2026-11-08',category:'saude'})]},{resetUndo:true});closeAllSheets();setUI({tab:'tasks',toasts:[],openProjectId:undefined});host=document.createElement('div');document.body.append(host);root=createRoot(host);act(()=>root.render(<Host/>));
});
afterEach(()=>{act(()=>root.unmount());host.remove();closeAllSheets();replaceState(emptyState(),{resetUndo:true});vi.clearAllTimers();vi.useRealTimers();vi.restoreAllMocks();vi.unstubAllGlobals();});
it.each(['Enviar relatório','indicadores','validar numeros'])('busca por título, notas e passos: %s',term=>{input(term);expect(titles()).toEqual(['Enviar relatório']);expect(host.textContent).toContain('1 resultado');click('Limpar pesquisa');expect(titles()).toHaveLength(5);});
it('combina filtros e pesquisa sem alterar dados, remove um critério e limpa filtros sem apagar pesquisa',()=>{
 const before=getState();click('Filtros');select('Prioridade','essential');select('Categoria','trabalho');select('Projeto','p');input('relatório');expect(titles()).toEqual(['Enviar relatório']);
 click('Remover filtro: Prioridade');expect(host.textContent).toContain('Trabalho');expect(host.textContent).toContain('Entrega');expect(host.querySelector<HTMLInputElement>('[aria-label="Filtrar tarefas"]')!.value).toBe('relatório');
 click('Limpar filtros');expect(host.querySelector<HTMLInputElement>('[aria-label="Filtrar tarefas"]')!.value).toBe('relatório');expect(getState()).toBe(before);
});
it.each([['Prioridade','important','Atrasada'],['Prioridade','optional','Se der'],['Prioridade','none','Sem prioridade'],['Categoria','saude','Consulta'],['Categoria','none','Sem categoria'],['Projeto','p','Enviar relatório'],['Projeto','none','Sem projeto'],['Tipo','event','Consulta'],['Tipo','habit','Hábito']])('filtra %s=%s', (label,value,expected)=>{
 act(()=>actions.add(t(`filter-${label}-${value}`,{title:expected,kind:value==='habit'?'habit':'task',priority:value==='optional'?'optional':undefined})));
 click('Filtros');select(label,value);expect(titles()).toContain(expected);
});
it('situações incluem concluídas/arquivadas quando solicitadas e permitem reabrir e concluir',()=>{
 click('Concluídas');expect(titles()).toEqual(['Concluída']);click('Reabrir: Concluída');expect(getState().tasks.find(t=>t.id==='Concluída')!.status).toBe('active');click('Abertas');click('Concluir: Concluída');expect(getState().tasks.find(t=>t.id==='Concluída')!.status).toBe('done');
 click('Todas');expect(titles()).toContain('Arquivada');expect(host.querySelector('[aria-label="Concluir: Arquivada"]')).toBeNull();
});
it('acesso Sem data distingue pendências organizadas de capturas',()=>{click('Sem data');expect(titles()).toEqual(['Enviar relatório']);expect(host.textContent).not.toContain('Capturas do Inbox');click('Remover filtro: Sem data');expect(titles()).toContain('Captura');});
it('estado sem resultado oferece limpeza específica e preserva filtros ao limpar pesquisa',()=>{
 click('Filtros');select('Prioridade','essential');input('inexistente');expect(host.textContent).toContain('Nenhum resultado');click('Limpar pesquisa');expect(titles()).toEqual(['Enviar relatório']);expect(host.textContent).toContain('Essencial');
});
it('série com exceção não abre ocorrência original substituída e preserva horário/duração da exceção',()=>{
 act(()=>replaceState({...getState(),tasks:[t('Série',{kind:'event',time:'08:30',duration:60,recurrence:{freq:'daily',anchor:'2026-11-07'}}),t('Exceção',{kind:'event',seriesId:'Série',seriesDate:'2026-11-07',date:'2026-11-08',time:'08:00',duration:30})]}));
 act(()=>host.querySelector<HTMLButtonElement>('[aria-label^="Abrir Série"]')!.click());expect(getUI().sheet).toMatchObject({id:'Série',date:'2026-11-08'});act(()=>closeAllSheets());act(()=>host.querySelector<HTMLButtonElement>('[aria-label^="Abrir Exceção"]')!.click());expect(getUI().sheet).toMatchObject({id:'Exceção',date:'2026-11-08'});expect(host.querySelector('[role="dialog"]')!.textContent).toContain('08:00');expect(getState().tasks[1].duration).toBe(30);
});
it('concluir hoje não conclui toda série; encerrada não oferece ação para uma data inventada',()=>{
 act(()=>replaceState({...getState(),tasks:[t('Diária',{recurrence:{freq:'daily',anchor:'2026-11-07'},doneDates:['2026-11-07']}),t('Encerrada',{recurrence:{freq:'daily',anchor:'2026-11-01',until:'2026-11-05'}})]}));
 act(()=>host.querySelector<HTMLButtonElement>('[aria-label^="Abrir Diária"]')!.click());expect(getUI().sheet).toMatchObject({date:'2026-11-08'});act(()=>closeAllSheets());click('Concluídas');expect(titles()).toEqual(['Encerrada']);expect(host.querySelector('[role="checkbox"]')).toBeNull();
});
it('abre consulta, edita pelo fluxo existente e mantém início de foco disponível',()=>{
 act(()=>host.querySelector<HTMLButtonElement>('[aria-label^="Abrir Enviar relatório"]')!.click());expect(host.querySelector('.task-overview')).not.toBeNull();click('Editar');expect(host.querySelector('[aria-label="Categoria"]')).not.toBeNull();
 const title=host.querySelector<HTMLTextAreaElement>('[aria-label="Título"]')!;act(()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(title,'Enviar relatório revisado');title.dispatchEvent(new Event('input',{bubbles:true}));});click('Salvar alterações');expect(getState().tasks[0].title).toBe('Enviar relatório revisado');act(()=>closeAllSheets());click('Começar Enviar relatório revisado');expect(getState().focus).toMatchObject({taskId:'Enviar relatório',running:true});
});
it('registros arquivados abrem o fluxo de restauração existente',()=>{
 click('Todas');act(()=>host.querySelector<HTMLButtonElement>('[aria-label^="Abrir Arquivada"]')!.click());click('Restaurar tarefa');expect(getState().tasks.find(t=>t.id==='Arquivada')!.status).toBe('active');
});
it('retorna à pesquisa se a edição retirar o acionador dos resultados',()=>{
 input('Enviar relatório');const opener=host.querySelector<HTMLButtonElement>('.task-main')!;act(()=>{opener.focus();opener.click();});click('Editar');
 const title=host.querySelector<HTMLTextAreaElement>('[aria-label="Título"]')!;act(()=>{Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value')!.set!.call(title,'Outro título');title.dispatchEvent(new Event('input',{bubbles:true}));});click('Salvar alterações');
 expect(titles()).toEqual([]);expect(document.activeElement).toBe(host.querySelector('[aria-label="Filtrar tarefas"]'));
});
it('marcar compromisso realizado não abre o editor e navegação compartilhada mantém destinos',()=>{
 click('Marcar que aconteceu: Consulta');expect(getState().tasks.find(t=>t.id==='Consulta')!.status).toBe('done');expect(getUI().sheet).toBeUndefined();click('Hábitos');expect(getUI().tab).toBe('habits');click('Projetos');expect(getUI().tab).toBe('projects');click('Tarefas');expect(getUI().tab).toBe('tasks');
});
it('volume grande tem apresentação progressiva e busca examina registros ainda não renderizados',()=>{
 act(()=>replaceState({...getState(),tasks:Array.from({length:500},(_,i)=>t(`Tarefa longa ${i} com detalhes para continuar`,{category:'trabalho'}))}));expect(host.querySelectorAll('.task')).toHaveLength(40);expect(host.textContent).toContain('500 resultados');click('Mostrar mais 40');expect(host.querySelectorAll('.task')).toHaveLength(80);input('499');expect(titles()).toEqual(['Tarefa longa 499 com detalhes para continuar']);
});
it('nova tarefa usa formulário existente e filtros não escondem tarefas profissionais fora do expediente',()=>{click('Nova tarefa');expect(getUI().sheet?.type).toBe('newTask');expect(titles()).toContain('Enviar relatório');});
