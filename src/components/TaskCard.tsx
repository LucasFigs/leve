import { useState } from 'react';
import type { Task } from '../domain/types';
import { formatDay, formatDuration, todayISO } from '../domain/dates';
import { recurrenceLabel } from '../domain/parser';
import { actions, useStore } from '../store/store';
import { openSheet, toast } from '../store/ui';
import { Checkbox, PriorityBadge } from './ui';
import { Icon } from './Icon';
import { completeWithFeedback } from './feedback';
import { startTask } from './focusFlow';

interface Props {
  task: Task;
  /** dia da ocorrência (tarefas recorrentes) */
  date?: string;
  done?: boolean;
  showTime?: boolean;
  showDate?: boolean;
  showProject?: boolean;
  showStart?: boolean;
  /** remove o item da lista com animação ao concluir */
  exitOnDone?: boolean;
}

export function TaskCard({ task, date, done, showTime, showDate, showProject = true, showStart, exitOnDone = true }: Props) {
  const project = useStore((s) => (task.projectId ? s.projects.find((p) => p.id === task.projectId) : undefined));
  const [leaving, setLeaving] = useState(false);
  const today = todayISO();
  const isDone = done ?? task.status === 'done';
  const isEvent = task.kind === 'event';
  const overdue = !isDone && !task.recurrence && ((task.date && task.date < today) || (task.due && task.due < today));
  const subDone = task.subtasks.filter((s) => s.done).length;
  const occurrence = date ?? task.date ?? today;
  const missed = task.recurrence ? !!task.missedDates?.includes(occurrence) : task.status === 'done' && !!task.missed;

  const toggle = () => {
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

  const label = `${task.title}${task.time ? `, às ${task.time}` : ''}`;

  return (
    <div className={`task${isDone ? ' done' : ''}${missed ? ' missed' : ''}${leaving ? ' leaving' : ''}`}>
      {showTime && <span className="task-time num">{task.time ?? '—'}</span>}
      {isEvent ? (
        <Checkbox
          checked={isDone && !missed}
          onToggle={toggleEvent}
          event
          label={`${isDone && !missed ? 'Desmarcar' : 'Marcar que aconteceu'}: ${task.title}`}
        />
      ) : (
        <Checkbox
          checked={isDone || leaving}
          onToggle={toggle}
          tone={task.priority}
          habit={task.kind === 'habit'}
          label={`${isDone ? 'Reabrir' : 'Concluir'}: ${task.title}`}
        />
      )}
      <button className="task-main" onClick={() => openSheet({ type: 'task', id: task.id, date: occurrence })} aria-label={`Abrir ${label}`}>
        <div className="task-title">{task.title}</div>
        <div className="task-meta">
          {isEvent && <span>Compromisso</span>}
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
          {task.recurrence && (
            <span>
              <Icon name="repeat" size={12} />
              {recurrenceLabel(task.recurrence)}
            </span>
          )}
          {task.subtasks.length > 0 && (
            <span>
              <Icon name="list" size={12} />
              {subDone}/{task.subtasks.length}
            </span>
          )}
          {showProject && project && (
            <span>
              {project.emoji} {project.name}
            </span>
          )}
          {!isDone && task.priority && task.priority !== 'optional' && <PriorityBadge priority={task.priority} />}
          {overdue && !showDate && <span className="warn">Atrasada</span>}
          {!isDone && task.postponed >= 3 && <span>Adiada {task.postponed}×</span>}
        </div>
      </button>
      {showStart && !isDone && !isEvent && (
        <button className="icon-btn sm task-action" onClick={() => startTask(task.id, occurrence)} aria-label={`Começar ${task.title}`}>
          <Icon name="play" size={16} />
        </button>
      )}
    </div>
  );
}
