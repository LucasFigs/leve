import { useEffect, useMemo } from 'react';
import {
  addDays, formatDay, formatDuration, fromISODate, monthMatrix, MONTHS_LONG, startOfWeek, toISODate, todayISO, WEEKDAYS_SHORT,
} from '../domain/dates';
import { itemsForDate } from '../domain/selectors';
import type { DayItem } from '../domain/types';
import { useClock, useDay } from '../hooks/hooks';
import { useStore } from '../store/store';
import { openSheet, setUI, useUI, type AgendaView } from '../store/ui';
import { DayTimeline } from '../components/DayTimeline';
import { TaskCard } from '../components/TaskCard';
import { Icon } from '../components/Icon';
import { EmptyState, Segmented, SectionHead } from '../components/ui';
import { TopActions } from './TopActions';

export function AgendaScreen() {
  const { today } = useClock();
  const view = useUI((u) => u.agendaView);
  const date = useUI((u) => u.agendaDate) ?? today;
  const setDate = (d: string) => setUI({ agendaDate: d });
  const setView = (v: AgendaView) => setUI({ agendaView: v });

  const step = view === 'day' ? 1 : view === 'week' ? 7 : 0;
  const move = (dir: number) => {
    if (view === 'month') {
      const d = fromISODate(date);
      setDate(toISODate(new Date(d.getFullYear(), d.getMonth() + dir, 1)));
    } else setDate(addDays(date, dir * step));
  };

  const d = fromISODate(date);
  const heading =
    view === 'day' ? formatDay(date, today, { long: true }) : view === 'week' ? weekLabel(date) : `${cap(MONTHS_LONG[d.getMonth()])} ${d.getFullYear()}`;

  return (
    <div className="screen agenda-screen">
      {/* ── Cabeçalho fixo (não rola) ── */}
      <div className="agenda-header">
        <div className="topbar">
          <h1 className="page-title">Agenda</h1>
          <TopActions />
        </div>

        <Segmented<AgendaView>
          label="Visualização"
          value={view}
          onChange={setView}
          options={[
            { value: 'day', label: 'Dia' },
            { value: 'week', label: 'Semana' },
            { value: 'month', label: 'Mês' },
          ]}
        />

        <div className="row" style={{ marginTop: 14, justifyContent: 'space-between' }}>
          <div className="daynav">
            <button className="icon-btn sm" onClick={() => move(-1)} aria-label="Anterior">
              <Icon name="chevron-left" size={18} />
            </button>
            <button className="icon-btn sm" onClick={() => move(1)} aria-label="Próximo">
              <Icon name="chevron-right" size={18} />
            </button>
            <h2 style={{ fontSize: 'var(--fs-md)', fontWeight: 650, marginLeft: 4 }}>{heading}</h2>
          </div>
          {date !== today && (
            <button className="btn btn-sm btn-ghost" onClick={() => setDate(today)}>
              Hoje
            </button>
          )}
        </div>

        {/* Strip de dias fixo somente na visão semana */}
        {view === 'week' && <WeekStrip date={date} />}
      </div>

      {/* ── Área scrollável ── */}
      <div className="agenda-body">
        {view === 'day' && <DayView date={date} />}
        {view === 'week' && <WeekAccordions date={date} />}
        {view === 'month' && <MonthView date={date} onPick={(x) => { setDate(x); setView('day'); }} />}
      </div>
    </div>
  );
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function weekLabel(date: string) {
  const start = startOfWeek(date);
  const end = addDays(start, 6);
  const a = fromISODate(start);
  const b = fromISODate(end);
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} de ${MONTHS_LONG[b.getMonth()]}`
    : `${a.getDate()} ${MONTHS_LONG[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MONTHS_LONG[b.getMonth()].slice(0, 3)}`;
}

function Legend() {
  return (
    <div className="legend" aria-hidden="true">
      <span><i style={{ background: 'var(--accent-soft-2)', borderLeft: '3px solid var(--accent)' }} />Compromisso</span>
      <span><i style={{ border: '1px dashed var(--border-strong)', borderLeft: '3px solid var(--text-3)' }} />Tarefa</span>
      <span><i style={{ background: 'var(--green-soft)', borderLeft: '3px solid var(--green)' }} />Hábito</span>
    </div>
  );
}

function DayView({ date }: { date: string }) {
  const items = useDay(date);
  const untimed = items.filter((i) => !i.time);
  const timedCount = items.length - untimed.length;
  const busy = items.filter((i) => !i.done && i.task.kind !== 'event').reduce((s, i) => s + i.duration, 0);

  return (
    <>
      {/* Subheader sticky — fica fixo dentro da agenda-body */}
      <div className="agenda-day-head">
        <Legend />
        <button className="btn btn-sm btn-soft" onClick={() => openSheet({ type: 'plan', date })}>
          <Icon name="wand" size={16} />
          Organizar dia
        </button>
      </div>

      {untimed.length > 0 && (
        <section style={{ marginBottom: 16 }}>
          <SectionHead title={`Sem horário · ${untimed.length}`} action={busy > 0 && <span className="xs faint">{formatDuration(busy)} no total</span>} />
          <div className="list">
            {untimed.map((i) => (
              <TaskCard key={i.task.id} task={i.task} date={i.date} done={i.done} />
            ))}
          </div>
        </section>
      )}

      {items.length === 0 && (
        <EmptyState icon="🌤️" title="Seu dia está livre." text="Que tal aproveitar esse espaço? Toque em um horário para adicionar algo." />
      )}

      <div className="card" style={{ padding: '16px 8px 16px 0' }}>
        <DayTimeline date={date} items={items} scrollToNow={timedCount > 0} />
      </div>
    </>
  );
}

// ── Visão semana: strip de dias (renderizado no header fixo) ──────────────────
function WeekStrip({ date }: { date: string }) {
  const tasks = useStore((s) => s.tasks);
  const fallback = useStore((s) => s.settings.defaultDuration);
  const today = todayISO();
  const start = startOfWeek(date);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((d) => ({ date: d, items: itemsForDate(tasks, d, fallback) })),
    [tasks, start, fallback],
  );
  // Lê o dia aberto do store de UI para refletir o estado dos accordions
  const openDay = useUI((u) => u.agendaOpenDay ?? null);
  const setOpenDay = (d: string | null) => setUI({ agendaOpenDay: d });

  return (
    <div className="week-strip" style={{ marginTop: 14 }}>
      {days.map(({ date: d, items }) => (
        <button
          key={d}
          className={`week-day${d === today ? ' today' : ''}${openDay === d ? ' active' : ''}`}
          aria-pressed={openDay === d}
          onClick={() => setOpenDay(openDay === d ? null : d)}
          aria-label={`${formatDay(d, today, { long: true })}, ${items.length} itens`}
        >
          {WEEKDAYS_SHORT[fromISODate(d).getDay()]}
          <b className="num">{fromISODate(d).getDate()}</b>
          <Dots items={items} />
        </button>
      ))}
    </div>
  );
}

// ── Visão semana: accordions (renderizados na área scrollável) ────────────────
function WeekAccordions({ date }: { date: string }) {
  const tasks = useStore((s) => s.tasks);
  const fallback = useStore((s) => s.settings.defaultDuration);
  const today = todayISO();
  const start = startOfWeek(date);
  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(start, i)).map((d) => ({ date: d, items: itemsForDate(tasks, d, fallback) })),
    [tasks, start, fallback],
  );

  // Estado exclusivo: apenas um dia aberto de cada vez
  const openDay = useUI((u) => u.agendaOpenDay ?? null);
  const setOpenDay = (d: string | null) => setUI({ agendaOpenDay: d });

  // Ao mudar de semana, abre hoje (se estiver na semana) ou fecha tudo
  useEffect(() => {
    const todayInWeek = days.some((d) => d.date === today);
    setUI({ agendaOpenDay: todayInWeek ? today : (days[0]?.date ?? null) });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start]);

  // Ordena tasks cronologicamente: com horário primeiro, depois sem horário
  const sortItems = (items: ReturnType<typeof itemsForDate>) =>
    [...items].sort((a, b) => {
      if (a.time && b.time) return a.time.localeCompare(b.time);
      if (a.time) return -1;
      if (b.time) return 1;
      return 0;
    });

  return (
    <div className="stack" style={{ gap: 8 }}>
      {days.map(({ date: d, items }) => {
        const isOpen = openDay === d;
        const sorted = sortItems(items);
        const showTime = items.some((x) => x.time);
        const pending = items.filter((i) => !i.done).length;
        return (
          <section key={d} className={`week-accordion${isOpen ? ' open' : ''}`}>
            <button
              className="week-accordion-head"
              aria-expanded={isOpen}
              onClick={() => setOpenDay(isOpen ? null : d)}
            >
              <span style={{ color: d === today ? 'var(--accent)' : undefined, fontWeight: 650, fontSize: 'var(--fs-sm)' }}>
                {formatDay(d, today, { long: true })}
              </span>
              <span className="row" style={{ gap: 8, marginLeft: 'auto', alignItems: 'center' }}>
                {items.length > 0 && (
                  <span className="xs faint">{pending > 0 ? `${pending} pendente${pending !== 1 ? 's' : ''}` : 'Tudo feito ✓'}</span>
                )}
                <button
                  className="icon-btn sm"
                  onClick={(e) => { e.stopPropagation(); openSheet({ type: 'quickAdd', defaults: { date: d } }); }}
                  aria-label={`Adicionar em ${formatDay(d, today)}`}
                >
                  <Icon name="plus" size={15} />
                </button>
                <Icon name="chevron-down" size={16} className={`week-acc-chevron faint${isOpen ? ' rotated' : ''}`} />
              </span>
            </button>

            {isOpen && (
              <div className="week-accordion-body">
                {sorted.length ? (
                  <div className="list">
                    {sorted.map((i) => (
                      <TaskCard key={i.task.id + d} task={i.task} date={d} done={i.done} showTime={showTime} exitOnDone={false} />
                    ))}
                  </div>
                ) : (
                  <p className="small faint" style={{ padding: '4px 2px 8px' }}>Dia livre 🌤️</p>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}


function Dots({ items }: { items: DayItem[] }) {
  const shown = items.filter((i) => !i.done).slice(0, 4);
  return (
    <span className="dots" aria-hidden="true">
      {shown.map((i) => (
        <i key={i.task.id} className={i.task.kind === 'event' ? 'event' : i.task.kind === 'habit' ? 'habit' : i.task.priority === 'essential' ? 'essential' : ''} />
      ))}
    </span>
  );
}

function MonthView({ date, onPick }: { date: string; onPick: (d: string) => void }) {
  const tasks = useStore((s) => s.tasks);
  const today = todayISO();
  const d = fromISODate(date);
  const weeks = monthMatrix(d.getFullYear(), d.getMonth());
  const month = d.getMonth();

  return (
    <div className="card card-pad">
      <div className="month-grid" style={{ marginBottom: 6 }} aria-hidden="true">
        {['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'].map((w) => (
          <div key={w} className="xs faint" style={{ textAlign: 'center', fontWeight: 600 }}>{w}</div>
        ))}
      </div>
      <div className="month-grid">
        {weeks.flat().map((day) => {
          const items = itemsForDate(tasks, day);
          const dd = fromISODate(day);
          return (
            <button
              key={day}
              className={`month-cell${dd.getMonth() !== month ? ' other' : ''}${day === today ? ' today' : ''}`}
              onClick={() => onPick(day)}
              aria-label={`${formatDay(day, today, { long: true })}: ${items.length} itens`}
            >
              <span className="num">{dd.getDate()}</span>
              <Dots items={items} />
            </button>
          );
        })}
      </div>
    </div>
  );
}
