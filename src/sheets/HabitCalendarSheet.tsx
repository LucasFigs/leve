import { useMemo, useState } from 'react';
import { todayISO } from '../domain/dates';
import {
  buildHabitGrid,
  buildMonthCalendar,
  getHabitIcon,
  getHabitStreak,
  getHabitTargetLabel,
  getHabitTheme,
} from '../domain/habits';
import { occursOn } from '../domain/recurrence';
import { actions, useStore } from '../store/store';
import { closeSheet, openSheet } from '../store/ui';
import { BottomSheet } from '../components/BottomSheet';
import { Icon } from '../components/Icon';
import { removeWithFeedback } from '../components/feedback';

const WEEKDAYS = ['dom.', 'seg.', 'ter.', 'qua.', 'qui.', 'sex.', 'sáb.'];
const MONTH_NAMES = [
  'jan.',
  'fev.',
  'mar.',
  'abr.',
  'maio',
  'jun.',
  'jul.',
  'ago.',
  'set.',
  'out.',
  'nov.',
  'dez.',
];

export function HabitCalendarSheet({ id }: { id: string }) {
  const task = useStore((s) => s.tasks.find((t) => t.id === id));
  const today = todayISO();

  const todayDate = useMemo(() => new Date(today + 'T12:00:00'), [today]);
  const [viewYear, setViewYear] = useState(todayDate.getFullYear());
  const [viewMonth, setViewMonth] = useState(todayDate.getMonth()); // 0..11

  const theme = useMemo(() => (task ? getHabitTheme(task) : undefined), [task]);
  const icon = useMemo(() => (task ? getHabitIcon(task) : 'bolt'), [task]);
  const streak = useMemo(() => (task ? getHabitStreak(task, today) : 0), [task, today]);
  const target = useMemo(() => (task ? getHabitTargetLabel(task) : 'Diário'), [task]);
  const weeks = useMemo(
    () => buildMonthCalendar(viewYear, viewMonth, today),
    [viewYear, viewMonth, today],
  );
  const doneDates = useMemo(() => new Set(task?.doneDates ?? []), [task?.doneDates]);

  if (!task || !theme) return null;

  const toggleDay = (dateStr: string, isFuture: boolean) => {
    if (isFuture) return;
    if (doneDates.has(dateStr)) {
      actions.reopen(task.id, dateStr);
    } else {
      actions.complete(task.id, dateStr);
    }
  };

  const prevMonth = () => {
    if (viewMonth === 0) {
      setViewMonth(11);
      setViewYear((y) => y - 1);
    } else {
      setViewMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (viewMonth === 11) {
      setViewMonth(0);
      setViewYear((y) => y + 1);
    } else {
      setViewMonth((m) => m + 1);
    }
  };

  const goToday = () => {
    setViewYear(todayDate.getFullYear());
    setViewMonth(todayDate.getMonth());
  };

  const monthLabel = `${MONTH_NAMES[viewMonth]} de ${viewYear}`;

  return (
    <BottomSheet
      onClose={closeSheet}
      full
      headerExtra={
        <div className="row" style={{ gap: 6 }}>
          <button
            className="icon-btn sm"
            onClick={() => openSheet({ type: 'task', id: task.id }, { stack: true })}
            aria-label="Editar hábito"
            title="Editar hábito"
          >
            <Icon name="edit" size={17} />
          </button>
          <button
            className="icon-btn sm btn-danger"
            onClick={() => {
              if (confirm(`Excluir o hábito “${task.title}”?`)) {
                closeSheet();
                removeWithFeedback(task.id);
              }
            }}
            aria-label="Excluir hábito"
            title="Excluir hábito"
          >
            <Icon name="trash" size={17} />
          </button>
        </div>
      }
    >
      <div
        className="habit-calendar-view"
        style={{
          '--habit-primary': theme.primary,
          '--habit-glow': theme.glow,
          '--habit-bg': theme.bgLight,
          '--habit-border': theme.border,
        } as React.CSSProperties}
      >
        {/* Cabeçalho do Hábito */}
        <div className="habit-cal-header">
          <div className="habit-cal-icon-wrap">
            <Icon name={icon} size={24} />
          </div>
          <div className="habit-cal-header-info">
            <h2 className="habit-cal-title">{task.title}</h2>
            {task.notes && <p className="habit-cal-notes">{task.notes}</p>}
          </div>
        </div>

        {/* Card de Resumo: Heatmap + Badges */}
        <div className="habit-cal-summary-card">
          <HabitMiniGrid taskDoneDates={doneDates} today={today} recurrence={task.recurrence} skipDates={task.skipDates} />
          <div className="habit-cal-badges">
            <span className="habit-stat">
              <Icon name="flame" size={14} />
              {streak}
            </span>
            <span className="habit-stat">
              <Icon name="repeat" size={14} />
              {target}
            </span>
          </div>
        </div>

        {/* Card do Calendário Mensal */}
        <div className="habit-cal-card">
          {/* Cabeçalho dos dias da semana */}
          <div className="habit-cal-weekdays">
            {WEEKDAYS.map((w) => (
              <span key={w} className="habit-cal-wd">
                {w}
              </span>
            ))}
          </div>

          {/* Grid de dias do mês */}
          <div className="habit-cal-grid">
            {weeks.map((week, wi) => (
              <div key={wi} className="habit-cal-row">
                {week.map((day) => {
                  const isDone = doneDates.has(day.date);
                  const isClickable = !day.isFuture;

                  let cellClass = 'habit-cal-cell';
                  if (!day.isCurrentMonth) cellClass += ' habit-cal-other-month';
                  if (day.isToday) cellClass += ' habit-cal-today';
                  if (isDone) cellClass += ' habit-cal-done';
                  if (day.isFuture) cellClass += ' habit-cal-future';

                  return (
                    <button
                      key={day.date}
                      type="button"
                      className={cellClass}
                      onClick={() => toggleDay(day.date, day.isFuture)}
                      disabled={!isClickable}
                      aria-label={`${day.date}${isDone ? ' (concluído)' : ''}`}
                    >
                      <span className="habit-cal-num">{day.dayNumber}</span>
                      {isDone && <span className="habit-cal-dot" />}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>

          {/* Barra inferior de navegação do calendário */}
          <div className="habit-cal-nav">
            <div className="habit-cal-month-pill">
              <span>{monthLabel}</span>
              <Icon name="chevron-down" size={14} />
              <input
                type="month"
                className="habit-cal-native-month"
                value={`${viewYear}-${String(viewMonth + 1).padStart(2, '0')}`}
                onChange={(e) => {
                  if (e.target.value) {
                    const [y, m] = e.target.value.split('-').map(Number);
                    setViewYear(y);
                    setViewMonth(m - 1);
                  }
                }}
                aria-label="Selecionar mês e ano"
              />
            </div>

            <div className="habit-cal-nav-actions">
              <button type="button" className="habit-cal-nav-btn pill" onClick={goToday}>
                Hoje
              </button>
              <button
                type="button"
                className="habit-cal-nav-btn icon"
                onClick={prevMonth}
                aria-label="Mês anterior"
              >
                <Icon name="chevron-left" size={16} />
              </button>
              <button
                type="button"
                className="habit-cal-nav-btn icon"
                onClick={nextMonth}
                aria-label="Próximo mês"
              >
                <Icon name="chevron-right" size={16} />
              </button>
            </div>
          </div>
        </div>

        <p className="habit-cal-hint">Toque em qualquer dia para marcar ou desmarcar como feito</p>
      </div>
    </BottomSheet>
  );
}

/** Mini-grid de heatmap das últimas ~16 semanas dentro da ficha de detalhes */
function HabitMiniGrid({
  taskDoneDates,
  today,
  recurrence,
  skipDates,
}: {
  taskDoneDates: Set<string>;
  today: string;
  recurrence?: any;
  skipDates?: string[];
}) {
  const weeks = useMemo(() => buildHabitGrid(today, 18), [today]);

  const refCallback = (el: HTMLDivElement | null) => {
    if (el) el.scrollLeft = el.scrollWidth;
  };

  const getCellState = (dateStr: string, isFuture: boolean): 'future' | 'done' | 'missed' | 'na' => {
    if (isFuture) return 'future';
    if (taskDoneDates.has(dateStr)) return 'done';
    if (recurrence && occursOn(recurrence, dateStr) && !skipDates?.includes(dateStr)) {
      return 'missed';
    }
    return 'na';
  };

  return (
    <div className="habit-grid-wrap" style={{ padding: '4px 0' }}>
      <div className="habit-grid-labels" aria-hidden="true">
        {['Dom', '', 'Ter', '', 'Qui', '', 'Sáb'].map((lbl, idx) => (
          <span key={idx} className="habit-day-label">
            {lbl}
          </span>
        ))}
      </div>
      <div className="habit-grid-scroll" ref={refCallback} aria-hidden="true">
        <div className="habit-month-row">
          {weeks.map((week, wi) => (
            <div key={wi} className="habit-month-cell">
              {week.monthLabel && <span className="habit-month-label">{week.monthLabel}</span>}
            </div>
          ))}
        </div>
        <div className="habit-grid-cols">
          {weeks.map((week, wi) => (
            <div key={wi} className="habit-grid-col">
              {week.days.map((day) => {
                const state = getCellState(day.date, day.isFuture);
                return (
                  <div
                    key={day.date}
                    className={`habit-cell habit-cell-${state}${day.isToday ? ' habit-cell-today' : ''}`}
                    title={day.date}
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

