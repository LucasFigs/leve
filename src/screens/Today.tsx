import { useMemo, useState } from 'react';
import { addDays, formatDuration, formatLongDate, greeting, minToTime, timeToMin } from '../domain/dates';
import { nextEventAfter, recommendNow, PRIORITY_META } from '../domain/priority';
import { dayCapacity, type CapacityStatus } from '../domain/planner';
import { streak } from '../domain/selectors';
import { useTodayContext } from '../hooks/hooks';
import { actions, useStore } from '../store/store';
import { openSheet, toast } from '../store/ui';
import { QuickAdd } from '../components/QuickAdd';
import { TaskCard } from '../components/TaskCard';
import { DayTimeline } from '../components/DayTimeline';
import { Icon } from '../components/Icon';
import { EmptyState, SectionHead } from '../components/ui';
import { WeekCard } from '../components/WeekCard';
import { computeNudges, type NudgeAction } from '../components/nudges';
import { startTask } from '../components/focusFlow';
import { TopActions } from './TopActions';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function TodayScreen() {
  const ctx = useTodayContext();
  const { today, now, items, overdue, tasks } = ctx;
  const name = useStore((s) => s.settings.name);
  const dismissed = useStore((s) => s.dismissed);
  const [showDone, setShowDone] = useState(false);

  const pending = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done && i.task.kind !== 'event');
  const timed = pending.filter((i) => i.time && (i.task.kind !== 'event' || timeToMin(i.time) + i.duration > now));
  const untimed = pending.filter((i) => !i.time);
  const totalToday = items.filter((i) => i.task.kind !== 'event').length;
  const remaining = timed.length + untimed.length;
  const days = useMemo(() => streak(tasks, today), [tasks, today]);

  // O painel do dia já cuida de “organizar/planejar amanhã”: aqui só o resto
  const nudge = useMemo(
    () => computeNudges({ ...ctx, dismissed }, 5).find((n) => n.key !== 'overload' && n.key !== 'dayover'),
    [ctx, dismissed],
  );

  const runNudge = (a: NudgeAction) => {
    switch (a.kind) {
      case 'reflow': {
        const n = actions.reflowToday();
        toast(n ? 'Reorganizei o resto do seu dia' : 'Nada para mover', n ? { label: 'Desfazer', run: () => actions.undo() } : undefined);
        break;
      }
      case 'start':
        if (a.taskId) startTask(a.taskId);
        break;
      case 'breakdown':
        if (a.taskId) openSheet({ type: 'breakdown', id: a.taskId });
        break;
      case 'review':
        openSheet({ type: 'review' });
        break;
      case 'plan':
        openSheet({ type: 'plan', date: today });
        break;
      case 'planTomorrow':
        openSheet({ type: 'plan', date: addDays(today, 1) });
        break;
      case 'open':
        if (a.taskId) openSheet({ type: 'task', id: a.taskId });
    }
  };

  return (
    <div className="screen">
      <div className="topbar">
        <TopActions />
      </div>

      <div className="today-grid">
        <div>
          <h1 className="hello">
            {greeting()}
            {name ? `, ${name}` : ''}
          </h1>
          <p className="page-sub row" style={{ gap: 8, flexWrap: 'wrap' }}>
            {capitalize(formatLongDate(today))}
            {days >= 2 && (
              <span className="streak-chip" title="Dias seguidos concluindo tarefas">
                🔥 {days} dias seguidos
              </span>
            )}
          </p>

          <div className="section" style={{ marginTop: 16 }}>
            <QuickAdd placeholder="Jogue aqui o que estiver na cabeça…" />
          </div>

          <section className="section" aria-label="Seu dia em resumo" style={{ marginTop: 14 }}>
            <DayPulse doneToday={done.length} totalToday={totalToday} />
          </section>

          <section className="section" aria-labelledby="now-h">
            <SectionHead title={<span id="now-h">Agora</span>} />
            <NowCard />
          </section>

          {overdue.length > 0 ? (
            <section className="section">
              <OverdueCard />
            </section>
          ) : (
            nudge && (
              <section className="section">
                <div className="nudge" role="note">
                  <span className={`nudge-icon ${nudge.tone === 'accent' ? '' : nudge.tone}`}>
                    <Icon name={nudge.icon} size={18} />
                  </span>
                  <div className="grow">
                    <p className="nudge-text">{nudge.text}</p>
                    <div className="nudge-actions">
                      {nudge.actions.map((a) => (
                        <button key={a.label} className={`btn btn-sm ${a.primary ? 'btn-soft' : 'btn-ghost'}`} onClick={() => runNudge(a)}>
                          {a.label}
                        </button>
                      ))}
                      <button className="btn btn-sm btn-ghost" onClick={() => actions.dismiss(nudge.key)}>
                        Agora não
                      </button>
                    </div>
                  </div>
                </div>
              </section>
            )
          )}

          <section className="section" aria-labelledby="day-h">
            <SectionHead
              title={
                <span id="day-h">
                  Seu dia{remaining > 0 && <span className="faint" style={{ fontWeight: 500 }}> · {remaining} {remaining === 1 ? 'restante' : 'restantes'}</span>}
                </span>
              }
            />
            {remaining === 0 ? (
              totalToday > 0 ? (
                <EmptyState icon="✓" title="Tudo feito por hoje." text="Bom trabalho. O que sobrar pode esperar." />
              ) : (
                <EmptyState icon="☀️" title="Seu dia está livre." text="Jogue no campo acima o que estiver na sua cabeça — eu ajudo a encaixar." />
              )
            ) : (
              <>
                {timed.length > 0 && (
                  <div className="list">
                    {timed.map((i) => (
                      <TaskCard key={i.task.id + i.date} task={i.task} date={i.date} done={i.done} showTime showStart />
                    ))}
                  </div>
                )}
                {untimed.length > 0 && (
                  <>
                    <div className="section-head" style={{ marginTop: timed.length ? 18 : 0 }}>
                      <h3 className="section-title faint">Sem horário</h3>
                    </div>
                    <div className="list">
                      {untimed.map((i) => (
                        <TaskCard key={i.task.id + i.date} task={i.task} date={i.date} done={i.done} showStart />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </section>

          {done.length > 0 && (
            <section className="section">
              <button className="collapse-btn" aria-expanded={showDone} onClick={() => setShowDone((v) => !v)}>
                <Icon name="chevron-right" size={16} />
                Concluídas hoje · {done.length}
              </button>
              {showDone && (
                <div className="list" style={{ marginTop: 10 }}>
                  {done.map((i) => (
                    <TaskCard key={i.task.id + i.date} task={i.task} date={i.date} done exitOnDone={false} />
                  ))}
                </div>
              )}
            </section>
          )}

          <section className="section">
            <WeekCard />
          </section>
        </div>

        <aside className="today-aside desktop-only" aria-label="Agenda de hoje">
          <SectionHead title="Agenda de hoje" />
          <div className="card card-pad" style={{ maxHeight: 'calc(100dvh - 120px)', overflow: 'auto' }}>
            <DayTimeline date={today} items={items} hourHeight={48} />
          </div>
        </aside>
      </div>
    </div>
  );
}

const CAPACITY: Record<CapacityStatus, { label: string; tone: string }> = {
  ok: { label: 'Cabe no seu dia', tone: 'green' },
  tight: { label: 'Dia apertado', tone: 'yellow' },
  over: { label: 'Não cabe tudo', tone: 'red' },
  ended: { label: 'Seu dia terminou', tone: 'gray' },
};

/** Painel do dia: progresso, se o que falta cabe no tempo livre e o próximo compromisso. */
function DayPulse({ doneToday, totalToday }: { doneToday: number; totalToday: number }) {
  const { today, now, items, tasks, settings } = useTodayContext();
  const cap = useMemo(() => dayCapacity(tasks, today, settings, now), [tasks, today, settings, now]);
  const next = nextEventAfter(items, now);
  const pct = totalToday ? doneToday / totalToday : 0;
  const meta = CAPACITY[cap.status];
  const r = 20;
  const circ = 2 * Math.PI * r;

  let detail: string;
  if (cap.status === 'ended') detail = cap.left ? `Ficaram ${formatDuration(cap.left)} de tarefas para depois.` : 'Tudo certo por hoje.';
  else if (!cap.left) detail = `Nada pendente · ${formatDuration(cap.free) || '0 min'} livres até ${settings.dayEnd}.`;
  else detail = `Faltam ${formatDuration(cap.left)} de tarefas · ${formatDuration(cap.free) || '0 min'} livres até ${settings.dayEnd}.`;

  const action =
    cap.status === 'ended'
      ? cap.left > 0 && { label: 'Planejar amanhã', run: () => openSheet({ type: 'plan', date: addDays(today, 1) }) }
      : cap.unscheduled > 0 && { label: cap.status === 'ok' ? 'Encaixar horários' : 'Reorganizar', run: () => openSheet({ type: 'plan', date: today }) };

  return (
    <div className="card card-pad pulse">
      <div className="pulse-ring" role="img" aria-label={`${doneToday} de ${totalToday} tarefas feitas hoje`}>
        <svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true">
          <circle cx="26" cy="26" r={r} className="pulse-track" />
          <circle cx="26" cy="26" r={r} className="pulse-fill" strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} />
        </svg>
        <span className="num">
          {doneToday}/{totalToday}
        </span>
      </div>
      <div className="grow" style={{ minWidth: 0 }}>
        <span className={`pulse-status tone-text-${meta.tone}`}>
          <i aria-hidden="true" />
          {meta.label}
        </span>
        <p className="small" style={{ marginTop: 2 }}>{detail}</p>
        {next && cap.status !== 'ended' && (
          <p className="xs muted truncate" style={{ marginTop: 4 }}>
            <Icon name="calendar" size={12} /> Próximo: {next.task.title} às {next.time}
          </p>
        )}
        {action && (
          <button className="btn btn-sm btn-soft" style={{ marginTop: 10 }} onClick={action.run}>
            <Icon name="wand" size={14} />
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}

/** Atrasadas: uma linha com ação rápida; a lista abre só se você quiser. */
function OverdueCard() {
  const { overdue } = useTodayContext();
  const [open, setOpen] = useState(false);
  return (
    <div className="nudge" role="note">
      <span className="nudge-icon yellow">
        <Icon name="calendar-arrow" size={18} />
      </span>
      <div className="grow">
        <p className="nudge-text">
          {overdue.length === 1 ? `“${overdue[0].title}” ficou para trás.` : `${overdue.length} tarefas ficaram para trás.`}
        </p>
        <div className="nudge-actions">
          <button
            className="btn btn-sm btn-soft"
            onClick={() => {
              const n = actions.bringOverdueToToday();
              toast(`${n} ${n === 1 ? 'tarefa trazida' : 'tarefas trazidas'} para hoje`, { label: 'Desfazer', run: () => actions.undo() });
            }}
          >
            Trazer para hoje
          </button>
          <button className="btn btn-sm btn-ghost" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? 'Ocultar' : 'Ver'}
          </button>
        </div>
        {open && (
          <div className="list" style={{ marginTop: 10 }}>
            {overdue.map((t) => (
              <TaskCard key={t.id} task={t} showDate showStart />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function NowCard() {
  const ctx = useTodayContext();
  const projects = useStore((s) => s.projects);
  const inboxCount = useStore((s) => s.tasks.filter((t) => t.status === 'inbox').length);
  const [skip, setSkip] = useState(0);
  const rec = useMemo(() => recommendNow(ctx), [ctx]);

  if (rec.type === 'event') {
    const t = rec.item.task;
    const end = minToTime(timeToMin(rec.item.time!) + rec.item.duration);
    return (
      <div className="now-card">
        <div className="eyebrow">{rec.ongoing ? 'Acontecendo agora' : `Em ${rec.minutes} min`}</div>
        <div className="now-title">{t.title}</div>
        <div className="now-meta num">
          <span>
            {rec.item.time}–{end}
          </span>
          <span>Compromisso</span>
        </div>
        <div className="now-actions">
          <button className="btn btn-secondary btn-block" onClick={() => openSheet({ type: 'task', id: t.id, date: rec.item.date })}>
            Ver detalhes
          </button>
        </div>
      </div>
    );
  }

  if (rec.type === 'empty') {
    return (
      <div className="now-card">
        <div className="eyebrow">Livre</div>
        <div className="now-title">Nada urgente agora.</div>
        <p className="now-reason">
          {inboxCount > 0 ? `Você tem ${inboxCount} ${inboxCount === 1 ? 'captura' : 'capturas'} para organizar.` : 'Aproveite o espaço — ou adicione algo acima.'}
        </p>
        {inboxCount > 0 && (
          <div className="now-actions">
            <button className="btn btn-soft btn-block" onClick={() => openSheet({ type: 'review' })}>
              <Icon name="sparkles" size={18} />
              Organizar capturas
            </button>
          </div>
        )}
      </div>
    );
  }

  const list = rec.candidates;
  const c = list[skip % list.length];
  const t = c.item.task;
  const project = projects.find((p) => p.id === t.projectId);
  const nextStep = t.subtasks.find((s) => !s.done);

  return (
    <div className="now-card">
      <div key={t.id} className="swap-enter">
        <div className="eyebrow">Próxima ação</div>
        <div className="now-title">{t.title}</div>
        <div className="now-meta">
          <span className="num">{formatDuration(c.item.duration)}</span>
          {t.priority && t.priority !== 'optional' && <span className={`prio ${t.priority}`}>{PRIORITY_META[t.priority].label}</span>}
          {project && (
            <span>
              {project.emoji} {project.name}
            </span>
          )}
        </div>
        <p className="now-reason">
          <Icon name="sparkles" size={14} />
          {nextStep ? `Próximo passo: ${nextStep.title}` : c.reason}
        </p>
      </div>
      <div className="now-actions">
        <button className="btn btn-primary btn-lg grow" onClick={() => startTask(t.id, c.item.date)}>
          Começar agora
          <Icon name="arrow-right" size={18} />
        </button>
        {list.length > 1 && (
          <button className="icon-btn" style={{ height: 52, width: 52 }} onClick={() => setSkip((s) => s + 1)} aria-label="Sugerir outra tarefa" title="Outra sugestão">
            <Icon name="repeat" size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
