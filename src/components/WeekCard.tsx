/** “Sua semana”: evolução dos últimos 7 dias — recolhido por padrão, abre com um toque. */
import { useMemo, useState } from 'react';
import { addDays, formatDay, formatDuration, todayISO, weekdayOf, WEEKDAYS_SHORT } from '../domain/dates';
import { completedOn } from '../domain/selectors';
import { useStore } from '../store/store';
import { Icon } from './Icon';

const OPEN_KEY = 'leve:week-open';

export function WeekCard() {
  const tasks = useStore((s) => s.tasks);
  const today = todayISO();
  const [open, setOpen] = useState(() => {
    try {
      return localStorage.getItem(OPEN_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [picked, setPicked] = useState<string>();

  const data = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
    const counts = days.map((d) => ({ date: d, n: completedOn(tasks, d) }));
    const week = counts.reduce((s, c) => s + c.n, 0);
    const prev = Array.from({ length: 7 }, (_, i) => addDays(today, i - 13)).reduce((s, d) => s + completedOn(tasks, d), 0);
    const focus = tasks.reduce((s, t) => s + (t.focusMinutes ?? 0), 0);
    return { counts, week, prev, focus, max: Math.max(1, ...counts.map((c) => c.n)) };
  }, [tasks, today]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(OPEN_KEY, next ? '1' : '0');
    } catch {
      /* noop */
    }
  };

  const best = data.counts.reduce((a, b) => (b.n > a.n ? b : a), data.counts[0]);
  const sel = data.counts.find((c) => c.date === picked);
  const diff = data.week - data.prev;
  const trend = data.prev === 0 && data.week === 0 ? '' : diff > 0 ? `↑ ${diff} vs. semana anterior` : diff < 0 ? `↓ ${-diff} vs. semana anterior` : 'igual à semana anterior';

  return (
    <div className="card week-card">
      <button className="week-head" aria-expanded={open} onClick={toggle}>
        <span className="grow">
          <span className="week-title">Sua semana</span>
          <span className="xs muted" style={{ display: 'block' }}>
            <b className="num" style={{ color: 'var(--text)' }}>{data.week}</b> {data.week === 1 ? 'tarefa feita' : 'tarefas feitas'}
            {trend && ` · ${trend}`}
          </span>
        </span>
        <Icon name="chevron-down" size={18} className="faint week-chevron" />
      </button>

      {open && (
        <div className="week-body">
          <div className="rhythm-chart" role="group" aria-label="Tarefas feitas nos últimos 7 dias">
            {data.counts.map((c) => {
              const isToday = c.date === today;
              const labeled = isToday || (c === best && c.n > 0);
              const h = c.n ? Math.max(6, (c.n / data.max) * 56) : 0;
              return (
                <button
                  key={c.date}
                  type="button"
                  className={`rhythm-col${picked === c.date ? ' on' : ''}`}
                  aria-label={`${formatDay(c.date)}: ${c.n} ${c.n === 1 ? 'tarefa feita' : 'tarefas feitas'}`}
                  aria-pressed={picked === c.date}
                  onClick={() => setPicked(picked === c.date ? undefined : c.date)}
                >
                  <span className="rhythm-val num" aria-hidden="true">{labeled || picked === c.date ? c.n : ''}</span>
                  <span className="rhythm-track" aria-hidden="true">
                    {h > 0 ? <span className="rhythm-bar" style={{ height: h }} /> : <span className="rhythm-zero" />}
                  </span>
                  <span className={`rhythm-day${isToday ? ' today' : ''}`} aria-hidden="true">
                    {isToday ? 'hoje' : WEEKDAYS_SHORT[weekdayOf(c.date)]}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="xs faint" aria-live="polite" style={{ marginTop: 8 }}>
            {sel
              ? `${formatDay(sel.date)}: ${sel.n} ${sel.n === 1 ? 'tarefa feita' : 'tarefas feitas'}`
              : `${formatDuration(data.focus) || '0 min'} em foco no total · toque em um dia para ver`}
          </p>
        </div>
      )}
    </div>
  );
}
