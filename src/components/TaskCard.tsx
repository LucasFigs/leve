import { ProjectIcon } from './ProjectIcon';
import { useState } from 'react';
import type { Project, Task } from '../domain/types';
import { formatDay, formatDuration, todayISO } from '../domain/dates';
import { recurrenceLabel } from '../domain/parser';
import { CATEGORY_MAP } from '../domain/category';
import { actions, useStore } from '../store/store';
import { openSheet, toast } from '../store/ui';
import { Checkbox, PriorityBadge } from './ui';
import { Icon } from './Icon';
import { completeWithFeedback } from './feedback';
import { startTask } from './focusFlow';
import { HabitIdentity } from './HabitAppearance';
import { habitStyle } from './habitStyle';

interface Props {
  task: Task;
  /** dia da ocorrência (tarefas recorrentes) */
  date?: string;
  done?: boolean;
  showTime?: boolean;
  showDate?: boolean;
  showProject?: boolean;
  showStart?: boolean;
  /** Lista do dia: mostra apenas o contexto necessário para executar. */
  compact?: boolean;
  /** remove o item da lista com animação ao concluir */
  exitOnDone?: boolean;
  /** Ação contextual exclusiva das capturas elegíveis do Inbox. */
  onDeleteCapture?: () => void;
  /** Apresentação exclusiva do acervo, sem mudar os demais consumidores. */
  catalog?: { ended: boolean };
}

export function TaskCard({ task, date, done, showTime, showDate, showProject = true, showStart, compact = false, exitOnDone = true, onDeleteCapture, catalog }: Props) {
  const project = useStore((s) => (task.projectId ? s.projects.find((p) => p.id === task.projectId) : undefined));
  const [leaving, setLeaving] = useState(false);
  const today = todayISO();
  const occurrence = date ?? task.date ?? today;
  const isDone = done ?? (task.recurrence ? !!task.doneDates?.includes(occurrence) || !!task.missedDates?.includes(occurrence) : task.status === 'done');
  const isEvent = task.kind === 'event';
  const isHabit = task.kind === 'habit';
  const overdue = !isDone && !task.recurrence && ((task.date && task.date < today) || (task.due && task.due < today));
  const subDone = task.subtasks.filter((s) => s.done).length;
  const missed = task.recurrence ? !!task.missedDates?.includes(occurrence) : task.status === 'done' && !!task.missed;

  const toggle = () => {
    if (leaving) return;
    if (isDone) {
      actions.reopen(task.id, occurrence);
      return;
    }
    if (exitOnDone) {
      setLeaving(true);
      setTimeout(() => completeWithFeedback(task.id, occurrence), 300);
    } else completeWithFeedback(task.id, occurrence);
  };

  /** Compromisso: um toque marca que aconteceu (para “não aconteceu”, abra o compromisso). */
  const toggleEvent = () => {
    if (isDone && !missed) {
      actions.markEvent(task.id, occurrence);
      return;
    }
    actions.markEvent(task.id, occurrence, 'held');
    toast('Marcado como realizado', { label: 'Desfazer', run: () => actions.undo() });
  };

  const actionTitle = `${task.title}${catalog&&(task.recurrence||task.seriesId)&&date?`, ${formatDay(date)}`:''}`;
  const label = `${task.title}${catalog?`, ${task.status==='archived'?'arquivada':catalog.ended?'série encerrada':task.recurrence?'série recorrente':task.seriesId?'ocorrência alterada':task.status==='inbox'?'captura do Inbox':'atividade'}${date?`, ${formatDay(date)}`:''}`:''}${task.time ? `, às ${task.time}` : ''}`;
  const readOnly = !!catalog && (task.status === 'archived' || catalog.ended);
  // Uma série encerrada permite editar suas regras, sem inventar uma ocorrência.
  // Hábitos mantêm o calendário; arquivos mantêm a consulta/restauração.
  const open = () => openSheet(catalog?.ended && !isHabit && task.status !== 'archived'
    ? { type: 'task', id: task.id, mode: 'edit' }
    : { type: 'task', id: task.id, date: occurrence });

  return (
    <div className={`task${catalog ? ' task-catalog' : ''}${isHabit ? ' task-habit' : ''}${isDone ? ' done' : ''}${missed ? ' missed' : ''}${leaving ? ' leaving' : ''}`} style={isHabit ? habitStyle(task) : undefined}>
      {showTime && <span className="task-time num">{task.time ?? '—'}</span>}
      {readOnly ? <span className="catalog-record-icon" aria-hidden="true"><Icon name={task.status==='archived'?'archive':'repeat'} size={20}/></span> : isEvent ? (
        <Checkbox
          checked={isDone && !missed}
          onToggle={toggleEvent}
          event
          label={`${isDone && !missed ? 'Desmarcar' : 'Marcar que aconteceu'}: ${actionTitle}`}
        />
      ) : (
        <Checkbox
          checked={isDone || leaving}
          onToggle={toggle}
          tone={task.priority}
          habit={task.kind === 'habit'}
          label={`${isDone ? 'Reabrir' : 'Concluir'}: ${actionTitle}`}
        />
      )}
      <button className="task-main" onClick={open} aria-label={`Abrir ${label}`}>
        <div className="task-title">{task.title}</div>
        {catalog ? <CatalogMetadata task={task} project={showProject ? project : undefined} date={date} ended={catalog.ended} isDone={isDone}/> : <div className="task-meta">
          {isHabit && <HabitIdentity task={task} />}
          {isEvent && !compact && <span>Compromisso</span>}
          {isEvent && isDone && <span className={missed ? 'warn' : ''}>{missed ? 'Não aconteceu' : 'Aconteceu'}</span>}
          {showDate && task.date && !task.recurrence && (
            <span className={overdue ? 'warn' : ''}>
              <Icon name="calendar" size={12} />
              {formatDay(task.date)}
            </span>
          )}
          {!showTime && task.time && (
            <span className="num">
              <Icon name="clock" size={12} />
              {task.time}
            </span>
          )}
          {task.duration && !isDone && <span>{formatDuration(task.duration)}</span>}
          {!compact && task.recurrence && (
            <span>
              <Icon name="repeat" size={12} />
              {recurrenceLabel(task.recurrence)}
            </span>
          )}
          {task.subtasks.length > 0 && (!compact || !isDone) && (
            <span aria-label={`${subDone} de ${task.subtasks.length} passos concluídos`}>
              <Icon name="list" size={12} />
              {subDone}/{task.subtasks.length}
            </span>
          )}
          {!compact && task.category && !project && !task.priority && CATEGORY_MAP[task.category] && (
            <span>
              <Icon name={CATEGORY_MAP[task.category].icon} size={12} /> {CATEGORY_MAP[task.category].label}
            </span>
          )}
          {!compact && showProject && project && (
            <span>
              <ProjectIcon project={project} size={12} /> {project.name}
            </span>
          )}
          {!isDone && task.priority && task.priority !== 'optional' && <PriorityBadge priority={task.priority} />}
          {overdue && !showDate && <span className="warn">Atrasada</span>}
          {!compact && !isDone && task.postponed >= 3 && <span>Adiada {task.postponed}×</span>}
        </div>}
      </button>
      {onDeleteCapture && <button type="button" className="icon-btn inbox-trash" aria-label={`Excluir captura: ${task.title}`} onClick={e => { e.stopPropagation(); onDeleteCapture(); }}>
        <Icon name="trash" size={17} />
      </button>}
      {showStart && !isDone && !isEvent && !readOnly && (
        <button className="icon-btn sm task-action" onClick={() => startTask(task.id, occurrence)} aria-label={`Começar ${task.title}`}>
          <Icon name="play" size={16} />
        </button>
      )}
    </div>
  );
}

function CatalogMetadata({task,project,date,ended,isDone}:{task:Task;project?:Project;date?:string;ended:boolean;isDone:boolean}) {
  const scheduled=date??task.date;
  const late=!isDone&&!task.recurrence&&((task.date&&task.date<todayISO())||(task.due&&task.due<todayISO()));
  const category=task.category?CATEGORY_MAP[task.category]:undefined;
  return <div className="task-meta catalog-meta">
    {task.status==='archived'?<span><Icon name="archive" size={12}/>Arquivada</span>:ended?<span>Série encerrada</span>:task.status==='inbox'?<span><Icon name="inbox" size={12}/>Captura do Inbox</span>:<span className={late?'warn':''}><Icon name="calendar" size={12}/>{scheduled?formatDay(scheduled):'Sem data'}{task.time?` · ${task.time}`:''}</span>}
    {late&&<span className="warn">{task.kind==='event'?'Compromisso passado':task.due&&task.due<todayISO()?'Prazo vencido':'Atrasada'}</span>}
    {task.kind==='habit'?<HabitIdentity task={task}/>:task.kind==='event'&&!late&&<span>Compromisso</span>}
    {task.kind==='event'&&isDone&&<span>{(task.recurrence?task.missedDates?.includes(date??''):task.missed)?'Não aconteceu':'Realizado'}</span>}
    {task.recurrence&&!ended&&<span><Icon name="repeat" size={12}/>{recurrenceLabel(task.recurrence,{ends:false})}</span>}
    {!task.recurrence&&task.seriesId&&<span><Icon name="repeat" size={12}/>Ocorrência alterada</span>}
    {!isDone&&task.priority&&<PriorityBadge priority={task.priority}/>}
    {project?<span><ProjectIcon project={project} size={12}/>{project.name}</span>:category&&<span><Icon name={category.icon} size={12}/>{category.label}</span>}
  </div>;
}
