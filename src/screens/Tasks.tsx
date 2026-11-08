/** Acervo de atividades: localizar e gerenciar sem reproduzir a agenda. */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { CATEGORIES } from '../domain/category';
import { PRIORITY_META } from '../domain/priority';
import { newTask, useStore } from '../store/store';
import { goTo, openSheet, useUI } from '../store/ui';
import { TaskCard } from '../components/TaskCard';
import { Icon } from '../components/Icon';
import { EmptyState } from '../components/ui';
import { TopActions } from './TopActions';
import { useClock } from '../hooks/hooks';
import { emptyCatalogFilters, taskCatalog, type CatalogFilters } from './taskCatalog';

/** Navegação compartilhada preservada. */
export function TasksProjectsSwitch({ current }: { current: 'tasks' | 'habits' | 'projects' }) {
  return <nav className="area-nav mobile-only" aria-label="Áreas de atividades">
    {([{value:'tasks',label:'Tarefas'},{value:'habits',label:'Hábitos'},{value:'projects',label:'Projetos'}] as const).map(o=><button type="button" key={o.value} aria-current={current===o.value?'page':undefined} onClick={()=>{if(current!==o.value)goTo(o.value);}}>{o.label}</button>)}
  </nav>;
}

export function TasksScreen() {
  const tasks=useStore(s=>s.tasks),projects=useStore(s=>s.projects);
  const [filters,setFilters]=useState(emptyCatalogFilters);
  const [showFilters,setShowFilters]=useState(false);
  const [limits,setLimits]=useState<Record<string,number>>({});
  const input=useRef<HTMLInputElement>(null),filterToggle=useRef<HTMLButtonElement>(null);
  const sheet=useUI(u=>u.sheet),previousSheet=useRef(sheet);
  useEffect(()=>{
    const closed=previousSheet.current&&!sheet;
    previousSheet.current=sheet;
    if(closed&&document.activeElement===document.body)input.current?.focus();
  },[sheet]);
  const panelId=useId();
  const {today}=useClock();
  const groups=useMemo(()=>taskCatalog(tasks,filters,today),[tasks,filters,today]);
  const total=groups.reduce((n,g)=>n+g.rows.length,0);
  const update=<K extends keyof CatalogFilters>(key:K,value:CatalogFilters[K])=>{setFilters(f=>({...f,[key]:value}));setLimits({});};
  // Itens removidos/organizados durante a consulta não mantêm páginas inválidas.
  useEffect(()=>{if(!tasks.length)setLimits({});},[tasks.length]);
  const criteria: {key:keyof CatalogFilters;label:string;value:string}[]=[];
  if(filters.undated)criteria.push({key:'undated',label:'Sem data',value:'Sem data'});
  if(filters.kind)criteria.push({key:'kind',label:'Tipo',value:({task:'Tarefa',event:'Compromisso',habit:'Hábito'})[filters.kind]});
  if(filters.priority)criteria.push({key:'priority',label:'Prioridade',value:filters.priority==='none'?'Sem prioridade':PRIORITY_META[filters.priority].label});
  if(filters.projectId)criteria.push({key:'projectId',label:'Projeto',value:filters.projectId==='none'?'Sem projeto':projects.find(p=>p.id===filters.projectId)?.name??'Projeto indisponível'});
  if(filters.category)criteria.push({key:'category',label:'Categoria',value:filters.category==='none'?'Sem categoria':CATEGORIES.find(c=>c.id===filters.category)!.label});
  const clearFilters=()=>{setFilters(f=>({...emptyCatalogFilters(),q:f.q,status:f.status}));setLimits({});filterToggle.current?.focus();};
  const clearSearch=()=>{update('q','');input.current?.focus();};
  const removeCriterion=(key:keyof CatalogFilters)=>{setFilters(f=>({...f,[key]:key==='undated'?false:''}));setLimits({});filterToggle.current?.focus();};
  const searching=!!filters.q.trim();
  return <div className="screen tasks-screen">
    <div className="topbar">
      <h1 className="page-title">Tarefas</h1>
      <TopActions hideSearch><button type="button" className="btn btn-sm btn-soft tasks-new" onClick={()=>openSheet({type:'newTask',task:newTask({title:''})})}><Icon name="plus" size={16}/>Nova tarefa</button></TopActions>
    </div>
    <TasksProjectsSwitch current="tasks"/>
    <div className="search-bar tasks-search">
      <Icon name="search" size={18} className="faint"/>
      <input ref={input} value={filters.q} onChange={e=>update('q',e.target.value)} placeholder="Buscar nas tarefas…" aria-label="Filtrar tarefas" autoComplete="off"/>
      {filters.q&&<button type="button" className="icon-btn" aria-label="Limpar pesquisa" onClick={clearSearch}><Icon name="x" size={16}/></button>}
    </div>
    <div className="task-status-filters" role="group" aria-label="Situação">
      {([{value:'open',label:'Abertas'},{value:'done',label:'Concluídas'},{value:'all',label:'Todas'}] as const).map(o=><button type="button" key={o.value} aria-pressed={filters.status===o.value} onClick={()=>update('status',o.value)}>{filters.status===o.value&&<Icon name="check" size={13}/>} {o.label}</button>)}
    </div>
    <div className="tasks-results-bar">
      <p className="xs muted" role="status">{total} {total===1?'resultado':'resultados'}{criteria.length>0?' · filtrados':''}</p>
      <div className="tasks-list-tools">
        <button type="button" className={`btn btn-sm btn-ghost${filters.undated?' tasks-tool-on':''}`} aria-pressed={filters.undated} onClick={()=>update('undated',!filters.undated)}>Sem data</button>
        <button type="button" ref={filterToggle} className="btn btn-sm btn-ghost tasks-filter-toggle" aria-expanded={showFilters} aria-controls={panelId} onClick={()=>setShowFilters(v=>!v)}><Icon name="settings" size={15}/>Filtros{criteria.length>0&&<span className="tasks-filter-count">{criteria.length}</span>}</button>
      </div>
    </div>
    {showFilters&&<div className="tasks-filter-panel" id={panelId}>
      <div className="tasks-filter-fields">
        <label>Prioridade<select className="input" aria-label="Prioridade" value={filters.priority} onChange={e=>update('priority',e.target.value as CatalogFilters['priority'])}>
          <option value="">Todas</option>{Object.entries(PRIORITY_META).map(([id,p])=><option key={id} value={id}>{p.label}</option>)}<option value="none">Sem prioridade</option>
        </select></label>
        <label>Categoria<select className="input" aria-label="Categoria" value={filters.category} onChange={e=>update('category',e.target.value as CatalogFilters['category'])}>
          <option value="">Todas</option>{CATEGORIES.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}<option value="none">Sem categoria</option>
        </select></label>
        <label>Projeto<select className="input" aria-label="Projeto" value={filters.projectId} onChange={e=>update('projectId',e.target.value)}>
          <option value="">Todos</option><option value="none">Sem projeto</option>{projects.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}
        </select></label>
        <label>Tipo<select className="input" aria-label="Tipo" value={filters.kind} onChange={e=>update('kind',e.target.value as CatalogFilters['kind'])}>
          <option value="">Todos</option><option value="task">Tarefas</option><option value="event">Compromissos</option><option value="habit">Hábitos</option>
        </select></label>
      </div>
    </div>}
    {criteria.length>0&&<div className="tasks-active-filters" aria-label="Filtros ativos">
      {criteria.map(c=><button key={c.key} type="button" className="chip" aria-label={`Remover filtro: ${c.label}`} title={`${c.label}: ${c.value}`} onClick={()=>removeCriterion(c.key)}>{c.value}<Icon name="x" size={13}/></button>)}
      <button type="button" className="btn btn-sm btn-ghost" onClick={clearFilters}>Limpar filtros</button>
    </div>}
    {total===0?<EmptyState icon={<Icon name={searching?'search':'list'} size={28}/>} title={searching||criteria.length?'Nenhum resultado.':filters.status==='done'?'Nenhuma tarefa concluída ainda.':filters.status==='open'?'Nenhuma tarefa aberta.':'Nenhuma tarefa aqui.'}
      text={searching||criteria.length?'Tente outro termo ou ajuste os filtros.':filters.status==='done'?'As tarefas que você concluir aparecem aqui.':'Capture algo quando precisar liberar espaço na cabeça.'}
      action={searching||criteria.length?<div className="tasks-empty-actions">{searching&&<button className="btn btn-soft" onClick={clearSearch}>Limpar pesquisa</button>}{criteria.length>0&&<button className="btn btn-ghost" onClick={clearFilters}>Limpar filtros</button>}</div>:filters.status!=='done'&&<button className="btn btn-primary" onClick={()=>openSheet({type:'quickAdd'})}>Capturar uma tarefa</button>}/>
      :groups.map(g=>{const limit=limits[g.key]??40;return <section className="tasks-group" key={g.key} aria-label={g.title}>
        <h2 className="section-title">{g.title}<span className="xs faint num">{g.rows.length}</span></h2>
        <div className="list">{g.rows.slice(0,limit).map(row=><TaskCard key={row.task.id} task={row.task} date={row.date} catalog={{ended:row.ended}} showStart exitOnDone={false}/>)}</div>
        {g.rows.length>limit&&<button type="button" className="btn btn-sm btn-ghost tasks-show-more" aria-label={`Mostrar mais ${Math.min(40,g.rows.length-limit)} de ${g.title}`} onClick={()=>setLimits(x=>({...x,[g.key]:limit+40}))}>Mostrar mais {Math.min(40,g.rows.length-limit)}</button>}
      </section>;})}
  </div>;
}
