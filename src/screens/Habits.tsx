/**
 * Tela de Hábitos — visão inspirada em habit trackers.
 * Mostra um card por hábito com:
 *  - Ícone + título + descrição (notes)
 *  - Botão para marcar hoje como feito
 *  - Grid de calor (heatmap) das últimas ~22 semanas (clicável para marcar dias passados)
 *  - Sequência atual (streak) e frequência alvo
 */
import { useMemo, useState } from 'react';
import type { Task } from '../domain/types';
import { todayISO } from '../domain/dates';
import { nextOccurrence, occursOn } from '../domain/recurrence';
import { actions, newTask, useStore } from '../store/store';
import { openSheet, toast } from '../store/ui';
import { Icon } from '../components/Icon';
import { EmptyState } from '../components/ui';
import { completeWithFeedback } from '../components/feedback';
import { TopActions } from './TopActions';
import { TasksProjectsSwitch } from './Tasks';
import {
  buildHabitGrid,
  getHabitIcon,
  getHabitStreak,
  getHabitTargetLabel,
  getHabitTheme,
} from '../domain/habits';

/* ------------------------------------------------------------------ */
/* Tela principal                                                      */
/* ------------------------------------------------------------------ */

export function HabitsScreen() {
  const tasks = useStore((s) => s.tasks);
  const today = todayISO();

  const habits = useMemo(() => {
    return tasks
      .filter(
        (t) =>
          t.kind === 'habit' &&
          t.status !== 'archived' &&
          t.status !== 'done' &&
          t.recurrence &&
          nextOccurrence(t.recurrence, today, t.skipDates),
      )
      .sort((a, b) => {
        // Não concluídos hoje primeiro, depois por título
        const aDone = a.doneDates?.includes(today) ?? false;
        const bDone = b.doneDates?.includes(today) ?? false;
        if (aDone !== bDone) return aDone ? 1 : -1;
        return a.title.localeCompare(b.title, 'pt-BR');
      });
  }, [tasks, today]);

  const handleNewHabit = () => {
    openSheet({
      type: 'newTask',
      task: newTask({
        title: '',
        kind: 'habit',
        recurrence: { freq: 'daily', anchor: today },
      }),
    });
  };

  return (
    <div className="screen">
      <div className="topbar">
        <h1 className="page-title">Hábitos</h1>
        <TopActions>
          <button
            className="icon-btn"
            onClick={handleNewHabit}
            aria-label="Novo hábito"
          >
            <Icon name="plus" />
          </button>
        </TopActions>
      </div>

      <TasksProjectsSwitch current="habits" />

      {habits.length === 0 ? (
        <EmptyState
          icon="🔁"
          title="Nenhum hábito ainda."
          text="Crie tarefas do tipo Hábito para acompanhá-las aqui."
          action={
            <button className="btn btn-primary" onClick={handleNewHabit}>
              <Icon name="plus" size={18} />
              Novo hábito
            </button>
          }
        />
      ) : (
        <div className="habit-list">
          {habits.map((task, idx) => (
            <HabitCard key={task.id} task={task} today={today} index={idx} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Card de hábito individual                                           */
/* ------------------------------------------------------------------ */

function HabitCard({ task, today, index }: { task: Task; today: string; index: number }) {
  const theme = useMemo(() => getHabitTheme(task, index), [task, index]);
  const icon = useMemo(() => getHabitIcon(task), [task]);
  const streak = useMemo(() => getHabitStreak(task, today), [task, today]);
  const target = useMemo(() => getHabitTargetLabel(task), [task]);
  const isDoneToday = task.doneDates?.includes(today) ?? false;

  const toggle = () => {
    if (isDoneToday) {
      actions.reopen(task.id, today);
      toast('Desmarcado', { label: 'Desfazer', run: () => actions.undo() });
    } else {
      completeWithFeedback(task.id, today);
    }
  };

  return (
    <div
      className={`habit-card${isDoneToday ? ' habit-done' : ''}`}
      style={{
        '--habit-primary': theme.primary,
        '--habit-glow': theme.glow,
        '--habit-bg': theme.bgLight,
        '--habit-border': theme.border,
      } as React.CSSProperties}
    >
      {/* Header */}
      <div className="habit-header">
        <div className="habit-icon-wrap">
          <Icon name={icon} size={20} />
        </div>
        <button
          className="habit-title-btn"
          onClick={() => openSheet({ type: 'task', id: task.id })}
        >
          <span className="habit-name">{task.title}</span>
          {task.notes && (
            <span className="habit-desc">{task.notes}</span>
          )}
        </button>
        <button
          className={`habit-check-btn${isDoneToday ? ' done' : ''}`}
          onClick={toggle}
          aria-label={isDoneToday ? 'Desmarcar hábito hoje' : 'Marcar hábito como feito hoje'}
        >
          {isDoneToday ? (
            <Icon name="check" size={18} />
          ) : (
            <Icon name="plus" size={18} />
          )}
        </button>
      </div>

      {/* Heatmap grid */}
      <HabitGrid task={task} today={today} />

      {/* Footer stats */}
      <div className="habit-footer">
        {streak > 0 && (
          <span className="habit-stat">
            <Icon name="flame" size={13} />
            {streak}
          </span>
        )}
        <span className="habit-stat">
          <Icon name="repeat" size={13} />
          {target}
        </span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Heatmap Grid                                                        */
/* ------------------------------------------------------------------ */

const WEEK_DAY_LABELS = ['Dom', 'Ter', 'Qui', 'Sáb'];
const WEEK_DAY_POSITIONS = [0, 2, 4, 6]; // Índices no array que têm rótulo

function HabitGrid({ task, today }: { task: Task; today: string }) {
  const weeks = useMemo(() => buildHabitGrid(today, 22), [today]);
  const doneDates = useMemo(() => new Set(task.doneDates ?? []), [task.doneDates]);

  // Tooltip de confirmação: quando o usuário clica em uma célula passada
  const [pendingDate, setPendingDate] = useState<string | null>(null);

  // Auto-scroll para a direita (semana atual) no mount
  const refCallback = (el: HTMLDivElement | null) => {
    if (el) {
      el.scrollLeft = el.scrollWidth;
    }
  };

  const getCellState = (dateStr: string, isFuture: boolean): 'future' | 'done' | 'missed' | 'na' => {
    if (isFuture) return 'future';
    if (doneDates.has(dateStr)) return 'done';

    // Se a regra de recorrência deveria ocorrer naquele dia mas não foi feito
    if (task.recurrence && occursOn(task.recurrence, dateStr) && !task.skipDates?.includes(dateStr)) {
      return 'missed';
    }
    return 'na'; // Não era esperado naquele dia
  };

  const handleCellClick = (dateStr: string, isFuture: boolean, state: 'future' | 'done' | 'missed' | 'na') => {
    if (isFuture) return; // Dias futuros não são clicáveis

    if (state === 'done') {
      // Desmarcar
      actions.reopen(task.id, dateStr);
      toast('Desmarcado', { label: 'Desfazer', run: () => actions.undo() });
      setPendingDate(null);
    } else if (state === 'missed' || state === 'na') {
      if (pendingDate === dateStr) {
        // Confirmação: segundo clique marca como feito
        actions.complete(task.id, dateStr);
        toast(`✓ Marcado para ${dateStr}`, { label: 'Desfazer', run: () => actions.undo() });
        setPendingDate(null);
      } else {
        // Primeiro clique: mostra tooltip de confirmação
        setPendingDate(dateStr);
      }
    }
  };

  // Formatar data para exibição amigável
  const formatCellDate = (dateStr: string): string => {
    try {
      const d = new Date(dateStr + 'T12:00:00');
      return d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="habit-grid-wrap">
      {/* Tooltip de confirmação */}
      {pendingDate && (
        <div className="habit-date-confirm" role="status">
          <span className="xs">Marcar <b>{formatCellDate(pendingDate)}</b> como feito?</span>
          <button
            className="btn btn-xs btn-primary"
            onClick={() => handleCellClick(pendingDate, false, getCellState(pendingDate, false))}
          >
            Confirmar
          </button>
          <button className="btn btn-xs btn-ghost" onClick={() => setPendingDate(null)}>
            Cancelar
          </button>
        </div>
      )}

      {/* Day-of-week labels column */}
      <div className="habit-grid-labels" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5, 6].map((d) => (
          <span key={d} className="habit-day-label">
            {WEEK_DAY_POSITIONS.includes(d) ? WEEK_DAY_LABELS[WEEK_DAY_POSITIONS.indexOf(d)] : ''}
          </span>
        ))}
      </div>

      {/* Scrollable grid */}
      <div className="habit-grid-scroll" ref={refCallback}>
        {/* Month labels row */}
        <div className="habit-month-row">
          {weeks.map((week, wi) => (
            <div key={wi} className="habit-month-cell">
              {week.monthLabel && (
                <span className="habit-month-label">{week.monthLabel}</span>
              )}
            </div>
          ))}
        </div>

        {/* Grid cells: each column = one week, rows = day of week */}
        <div className="habit-grid-cols">
          {weeks.map((week, wi) => (
            <div key={wi} className="habit-grid-col">
              {week.days.map((day) => {
                const state = getCellState(day.date, day.isFuture);
                const isPending = pendingDate === day.date;
                const isClickable = !day.isFuture;
                return (
                  <button
                    key={day.date}
                    className={`habit-cell habit-cell-${state}${day.isToday ? ' habit-cell-today' : ''}${isPending ? ' habit-cell-pending' : ''}${isClickable ? ' habit-cell-clickable' : ''}`}
                    onClick={() => handleCellClick(day.date, day.isFuture, state)}
                    aria-label={
                      day.isFuture
                        ? day.date
                        : state === 'done'
                        ? `${formatCellDate(day.date)} — feito (clique para desmarcar)`
                        : `${formatCellDate(day.date)} — clique para marcar como feito`
                    }
                    title={
                      day.isFuture
                        ? undefined
                        : state === 'done'
                        ? `${formatCellDate(day.date)} ✓ feito`
                        : `${formatCellDate(day.date)} — marcar como feito`
                    }
                    disabled={day.isFuture}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
