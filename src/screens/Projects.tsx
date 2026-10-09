import { useMemo, useState } from 'react';
import type { Project } from '../domain/types';
import { projectProgress } from '../domain/selectors';
import { useStore } from '../store/store';
import { openSheet, setUI, useUI } from '../store/ui';
import { QuickAdd } from '../components/QuickAdd';
import { TaskCard } from '../components/TaskCard';
import { Icon } from '../components/Icon';
import { EmptyState, ProgressBar, SectionHead } from '../components/ui';
import { TopActions } from './TopActions';
import { TasksProjectsSwitch } from './Tasks';

export function ProjectsScreen() {
  const openId = useUI((u) => u.openProjectId);
  const project = useStore((s) => s.projects.find((p) => p.id === openId));
  return project ? <ProjectDetail project={project} /> : <ProjectList />;
}

function ProjectList() {
  const allProjects = useStore((s) => s.projects);
  const projects = useMemo(() => allProjects.filter((p) => !p.archived), [allProjects]);
  const tasks = useStore((s) => s.tasks);

  return (
    <div className="screen">
      <div className="topbar">
        <h1 className="page-title">Projetos</h1>
        <TopActions>
          <button className="icon-btn" onClick={() => openSheet({ type: 'project' })} aria-label="Novo projeto">
            <Icon name="plus" />
          </button>
        </TopActions>
      </div>

      <TasksProjectsSwitch current="projects" />

      {projects.length === 0 ? (
        <EmptyState
          icon="📁"
          title="Nenhum projeto ainda."
          text="Comece quando precisar organizar algo maior."
          action={
            <button className="btn btn-primary" onClick={() => openSheet({ type: 'project' })}>
              <Icon name="plus" size={18} />
              Novo projeto
            </button>
          }
        />
      ) : (
        <div className="stack projects-grid" style={{ marginTop: 8 }}>
          {projects.map((p) => (
            <ProjectCard key={p.id} project={p} progress={projectProgress(tasks, p.id)} next={tasks.find((t) => t.projectId === p.id && t.status === 'active' && t.kind !== 'event')?.title} />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectCard({ project, progress, next }: { project: Project; progress: ReturnType<typeof projectProgress>; next?: string }) {
  return (
    <button className="project-card" onClick={() => setUI({ openProjectId: project.id })}>
      <span className={`project-emoji tone-${project.color}`} aria-hidden="true">{project.emoji}</span>
      <span className="grow">
        <span className="row" style={{ justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 650 }} className="truncate">{project.name}</span>
          <span className="xs faint num">
            {progress.done}/{progress.total}
          </span>
        </span>
        <span className="small muted truncate" style={{ display: 'block', margin: '2px 0 8px' }}>
          {progress.total === 0 ? 'Sem tarefas ainda' : next ? `Próxima: ${next}` : 'Tudo concluído'}
        </span>
        <ProgressBar value={progress.pct} label={`Progresso de ${project.name}`} />
      </span>
    </button>
  );
}

function ProjectDetail({ project }: { project: Project }) {
  const tasks = useStore((s) => s.tasks);
  const [showDone, setShowDone] = useState(false);
  const list = useMemo(() => tasks.filter((t) => t.projectId === project.id && t.status !== 'archived'), [tasks, project.id]);
  const pending = list
    .filter((t) => t.status !== 'done')
    .sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999') || a.createdAt - b.createdAt);
  const done = list.filter((t) => t.status === 'done');
  const progress = projectProgress(tasks, project.id);

  return (
    <div className="screen">
      <div className="topbar">
        <button className="btn btn-ghost" style={{ paddingLeft: 4 }} onClick={() => setUI({ openProjectId: undefined })}>
          <Icon name="chevron-left" size={18} />
          Projetos
        </button>
        <TopActions>
          <button className="icon-btn" onClick={() => openSheet({ type: 'project', id: project.id })} aria-label="Editar projeto">
            <Icon name="more" />
          </button>
        </TopActions>
      </div>

      <div className="row" style={{ gap: 14 }}>
        <span className={`project-emoji tone-${project.color}`} style={{ width: 52, height: 52, fontSize: 26 }} aria-hidden="true">
          {project.emoji}
        </span>
        <div className="grow">
          <h1 className="page-title">{project.name}</h1>
          <p className="small muted num">
            {progress.done} de {progress.total} concluídas
          </p>
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <ProgressBar value={progress.pct} label="Progresso do projeto" />
      </div>

      <div className="section">
        <QuickAdd defaults={{ projectId: project.id }} placeholder={`Adicionar em ${project.name}…`} />
      </div>

      <section className="section">
        <SectionHead title="Pendentes" />
        {pending.length ? (
          <div className="list">
            {pending.map((t) => (
              <TaskCard key={t.id} task={t} showDate showProject={false} showStart />
            ))}
          </div>
        ) : (
          <EmptyState icon="🎯" title="Nada pendente." text="Adicione o próximo passo quando ele aparecer." />
        )}
      </section>

      {done.length > 0 && (
        <section className="section">
          <button className="collapse-btn" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)} style={{ marginBottom: 8 }}>
            <Icon name="chevron-right" size={16} />
            Concluídas · {done.length}
          </button>
          {showDone && (
            <div className="list">
              {done.map((t) => (
                <TaskCard key={t.id} task={t} showProject={false} exitOnDone={false} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
