import type { Project, Task } from '../domain/types';
import { formatDay, formatDuration } from '../domain/dates';
import { CATEGORIES } from '../domain/category';
import { recurrenceLabel } from '../domain/recurrence';
import { PRIORITY_META } from '../domain/priority';
import { Disclosure } from './Disclosure';
import { Icon } from './Icon';
import { HabitIdentity } from './HabitAppearance';
import { habitStyle } from './habitStyle';
import { ProgressBar } from './ui';

interface Props {
  task: Task;
  project?: Project;
  today: string;
  occurrence: string;
  endTime?: string;
  defaultDuration: number;
  isDone: boolean;
  missed: boolean;
  onToggleStep: (id: string) => void;
  onArchive: () => void;
  onRemove: () => void;
}

/** Consulta voltada à execução: contexto breve, passos acionáveis e detalhes legíveis. */
export function TaskOverview({ task, project, today, occurrence, endTime, defaultDuration, isDone, missed, onToggleStep, onArchive, onRemove }: Props) {
  const done = task.subtasks.filter(step => step.done).length;
  const nextStep = !isDone && task.status === 'active' ? task.subtasks.find(step => !step.done)?.id : undefined;
  const scheduled = task.recurrence ? occurrence : task.date;
  const category = CATEGORIES.find(item => item.id === task.category);
  const deadlineLate = !!task.due && !isDone && (task.due < today || !!scheduled && scheduled > task.due);
  const archived = task.status === 'archived';
  const statusLabel = archived ? 'Arquivada' : isDone ? missed ? 'Não aconteceu' : task.kind === 'event' ? 'Realizado' : 'Concluída' : undefined;
  const hasTags = !!(statusLabel || task.priority || project || category || task.kind === 'habit');

  return <article className="task-overview">
    <header className="task-overview-header">
      <h2 className="task-overview-title" tabIndex={-1} data-autofocus="">{task.title}</h2>
      {hasTags && <div className="task-overview-tags" aria-label="Contexto">
        {task.kind === 'habit' && <span style={habitStyle(task)}><HabitIdentity task={task} /></span>}
        {statusLabel && <span className={`task-context-chip${isDone && !missed && !archived ? ' task-status-done' : ''}`}>
          <Icon name={archived ? 'archive' : missed ? 'x-circle' : 'check-circle'} size={13} />{statusLabel}
        </span>}
        {task.priority && <span className={`task-context-chip prio ${task.priority}`}><span className="prio-dot" aria-hidden="true" />{PRIORITY_META[task.priority].label}</span>}
        {project && <span className="task-context-chip"><Icon name="folder" size={13} />{project.name}</span>}
        {category && <span className="task-context-chip">{category.label}</span>}
      </div>}
    </header>

    <section className="task-overview-plan" aria-label="Planejamento">
      <div className="task-plan-main">
        <span className="task-plan-icon" aria-hidden="true"><Icon name="calendar" size={19} /></span>
        <div className="task-plan-date">
          <p>{scheduled ? formatDay(scheduled, today, { long: true }) : 'Quando der'}</p>
          <span className="small muted num">{task.time ? `${task.time}${endTime ? `–${endTime}` : ''}` : scheduled ? 'Sem horário fixo' : 'Sem data definida'}</span>
        </div>
        <span className="task-plan-duration num" aria-label={`Duração estimada: ${formatDuration(task.duration ?? defaultDuration)}`} title={task.duration ? 'Duração estimada' : 'Estimativa padrão do Leve'}><Icon name="clock" size={14} />{formatDuration(task.duration ?? defaultDuration)}</span>
      </div>
      {task.recurrence && <p className="task-plan-repeat"><Icon name="repeat" size={13} />{recurrenceLabel(task.recurrence)}</p>}
    </section>
    {task.due && <p className={`task-overview-deadline${deadlineLate ? ' warn-text' : ''}`}><Icon name="flag" size={14} /><span>Prazo final · {formatDay(task.due, today, { long: true })}</span></p>}

    {task.subtasks.length > 0 && <section className="task-overview-section" aria-label="Passos da tarefa">
      <div className="task-overview-section-head">
        <h3>Passos</h3>
        <span className="xs muted num" aria-live="polite">{done} de {task.subtasks.length}</span>
      </div>
      <ProgressBar value={done / task.subtasks.length} label="Passos concluídos" />
      <div className="task-overview-steps">
        {task.subtasks.map(step => <button
          key={step.id}
          type="button"
          role="checkbox"
          aria-checked={step.done}
          aria-label={`${step.done ? 'Reabrir' : 'Concluir'} passo: ${step.title}`}
          className={`task-overview-step${step.done ? ' done' : ''}${step.id === nextStep ? ' next' : ''}`}
          onClick={() => onToggleStep(step.id)}
        >
          <span className={`check${step.done ? ' on' : ''}`} aria-hidden="true"><Icon name="check" size={14} stroke={3} /></span>
          <span className="task-step-title">{step.title}</span>
          {step.id === nextStep && task.subtasks.length > 1 && <span className="task-step-next">Próximo</span>}
        </button>)}
      </div>
      {done === task.subtasks.length && !isDone && !archived && <p className="xs muted">Passos feitos. Você pode concluir a tarefa quando terminar.</p>}
      {task.recurrence && <p className="xs muted">Os passos são compartilhados entre as repetições. Concluir a tarefa se aplica à data exibida.</p>}
    </section>}

    {task.notes?.trim() && <section className="task-overview-section" aria-label="Notas">
      <div className="task-overview-section-head"><h3>Notas</h3></div>
      <p className="task-overview-notes">{task.notes}</p>
    </section>}
    {(task.focusMinutes ?? 0) > 0 && <p className="task-overview-focus"><Icon name="target" size={14} />{formatDuration(task.focusMinutes)} de foco nesta tarefa</p>}

    <Disclosure className="task-overview-more" title="Outras ações">
      <div className="task-overview-other-actions">
        {!archived && <button type="button" className="btn btn-sm btn-ghost" onClick={onArchive}><Icon name="archive" size={16} />{task.recurrence ? 'Arquivar e pausar repetições' : 'Arquivar'}</button>}
        <button type="button" className="btn btn-sm btn-danger" onClick={onRemove}><Icon name="trash" size={16} />Excluir {task.kind === 'event' ? 'compromisso' : task.kind === 'habit' ? 'hábito' : 'tarefa'}</button>
      </div>
    </Disclosure>
  </article>;
}
