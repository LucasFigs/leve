import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { Project } from '../domain/types';
import { useStore } from '../store/store';
import { openSheet, setUI, useUI } from '../store/ui';
import { useClock } from '../hooks/hooks';
import { ProjectIcon } from '../components/ProjectIcon';
import { QuickAdd } from '../components/QuickAdd';
import { TaskCard } from '../components/TaskCard';
import { Icon } from '../components/Icon';
import { EmptyState, ProgressBar } from '../components/ui';
import { TopActions } from './TopActions';
import { TasksProjectsSwitch } from './Tasks';
import { projectOverview } from './projectOverview';
import type { CatalogRow } from './taskCatalog';

export function ProjectsScreen() {
  const openId=useUI(u=>u.openProjectId);
  const project=useStore(s=>s.projects.find(p=>p.id===openId));
  const container=useRef<HTMLDivElement>(null), previous=useRef(openId);
  useEffect(()=>{
    const returned=previous.current && !project;
    const id=previous.current;
    previous.current=openId;
    if(returned) {
      const card=[...(container.current?.querySelectorAll<HTMLButtonElement>('[data-project-id]')??[])].find(b=>b.dataset.projectId===id);
      (card??container.current?.querySelector<HTMLHeadingElement>('h1'))?.focus();
    }
  },[openId,project]);
  return <div ref={container}>{project ? <ProjectDetail key={project.id} project={project}/> : <ProjectList/>}</div>;
}

function ProjectList() {
  const allProjects=useStore(s=>s.projects), tasks=useStore(s=>s.tasks);
  const {today}=useClock();
  const cards=useMemo(()=>allProjects.filter(p=>!p.archived).map(project=>({project,overview:projectOverview(tasks,project.id,today)})),[allProjects,tasks,today]);
  return <div className="screen projects-screen">
    <div className="topbar">
      <h1 className="page-title" tabIndex={-1}>Projetos</h1>
      <TopActions><button className="btn btn-sm btn-soft" onClick={()=>openSheet({type:'project'})} aria-label="Novo projeto"><Icon name="plus" size={16}/>Novo projeto</button></TopActions>
    </div>
    <TasksProjectsSwitch current="projects"/>
    {!cards.length ? <EmptyState icon={<Icon name="folder" size={28}/>} title="Nenhum projeto ainda." text="Reúna os próximos passos de um objetivo." action={<button className="btn btn-primary" onClick={()=>openSheet({type:'project'})}><Icon name="plus" size={18}/>Novo projeto</button>}/>
      : <div className="projects-grid project-collection">{cards.map(({project,overview})=><button key={project.id} className="project-card" data-project-id={project.id} onClick={()=>setUI({openProjectId:project.id})}>
        <span className={`project-symbol tone-${project.color}`} aria-hidden="true"><ProjectIcon project={project} size={22}/></span>
        <span className="project-card-content">
          <span className="project-card-name">{project.name}</span>
          <span className="project-summary small muted">{overview.summary}</span>
          {overview.progress.total>0 && <span className="project-progress">
            <span className="xs muted num">{overview.progress.done} de {overview.progress.total} tarefas pontuais concluídas</span>
            <ProgressBar value={overview.progress.pct} label={`Tarefas pontuais de ${project.name}`}/>
          </span>}
        </span>
        <Icon name="chevron-right" size={18} className="faint"/>
      </button>)}</div>}
  </div>;
}

function ProjectDetail({project}:{project:Project}) {
  const tasks=useStore(s=>s.tasks),{today}=useClock();
  const overview=useMemo(()=>projectOverview(tasks,project.id,today),[tasks,project.id,today]);
  const [showDone,setShowDone]=useState(false),[showArchived,setShowArchived]=useState(false);
  const historyId=useId(), archiveId=useId();
  const heading=useRef<HTMLHeadingElement>(null), sheet=useUI(u=>u.sheet),previousSheet=useRef(sheet);
  useEffect(()=>{heading.current?.focus();},[]);
  useEffect(()=>{
    const closed=previousSheet.current&&!sheet;previousSheet.current=sheet;
    if(closed&&document.activeElement===document.body)heading.current?.focus();
  },[sheet]);
  return <div className="screen projects-screen project-detail">
    <div className="topbar">
      <button className="btn btn-ghost" onClick={()=>setUI({openProjectId:undefined})}><Icon name="chevron-left" size={18}/>Projetos</button>
      <button className="btn btn-sm btn-soft" onClick={()=>openSheet({type:'project',id:project.id})} aria-label="Editar projeto"><Icon name="edit" size={16}/>Editar</button>
    </div>
    <header className="project-heading">
      <span className={`project-symbol tone-${project.color}`} aria-hidden="true"><ProjectIcon project={project} size={24}/></span>
      <div className="grow"><h1 className="page-title" ref={heading} tabIndex={-1}>{project.name}</h1><p className="small muted project-summary">{overview.summary}</p></div>
    </header>
    {overview.progress.total>0 && <div className="project-progress project-detail-progress">
      <p className="xs muted num">{overview.progress.done} de {overview.progress.total} tarefas pontuais concluídas</p>
      <ProgressBar value={overview.progress.pct} label="Tarefas pontuais do projeto"/>
    </div>}
    <div className="project-capture"><QuickAdd defaults={{projectId:project.id}} showProjectContext={false} hint={false} placeholder="Adicionar uma tarefa ao projeto…"/></div>
    {overview.pending.length>0 && <>
      <ProjectRows title="Pendências" rows={overview.actions}/>
      <ProjectRows title="Compromissos" rows={overview.events}/>
      <ProjectRows title="Atividades contínuas" rows={overview.continuous}/>
    </>}
    {overview.history.length>0 && <section className="project-history">
      <button className="collapse-btn" aria-expanded={showDone} aria-controls={historyId} onClick={()=>setShowDone(v=>!v)}><Icon name={showDone?'chevron-down':'chevron-right'} size={16}/>Concluídas e encerradas · {overview.history.length}</button>
      {showDone&&<div id={historyId}><ProjectRows title="Concluídas e encerradas" rows={overview.history} hideHeading/></div>}
    </section>}
    {overview.archived.length>0 && <section className="project-history">
      <button className="collapse-btn" aria-expanded={showArchived} aria-controls={archiveId} onClick={()=>setShowArchived(v=>!v)}><Icon name={showArchived?'chevron-down':'chevron-right'} size={16}/>Arquivadas · {overview.archived.length}</button>
      {showArchived&&<div id={archiveId}><ProjectRows title="Arquivadas" rows={overview.archived} hideHeading/></div>}
    </section>}
  </div>;
}

function ProjectRows({title,rows,hideHeading=false}:{title:string;rows:CatalogRow[];hideHeading?:boolean}) {
  const [limit,setLimit]=useState(40);
  if(!rows.length)return null;
  return <section className="project-activities" aria-label={title}>
    {!hideHeading&&<h2 className="section-title">{title}<span className="xs faint num">{rows.length}</span></h2>}
    <div className="list">{rows.slice(0,limit).map(row=><TaskCard key={row.task.id} task={row.task} date={row.date} catalog={{ended:row.ended}}
      showProject={false} showStart exitOnDone={false}/>)}</div>
    {rows.length>limit&&<button className="btn btn-sm btn-ghost project-show-more" onClick={()=>setLimit(n=>n+40)} aria-label={`Mostrar mais de ${title}`}>Mostrar mais {Math.min(40,rows.length-limit)}</button>}
  </section>;
}
