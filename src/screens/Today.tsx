import { useMemo, useState } from 'react';
import { addDays, formatDuration, formatLongDate, greeting, minToTime, timeToMin } from '../domain/dates';
import { recommendNow, PRIORITY_META } from '../domain/priority';
import { dayCapacity, type CapacityStatus } from '../domain/planner';
import { useTodayContext } from '../hooks/hooks';
import { actions, useStore } from '../store/store';
import { openSheet, toast } from '../store/ui';
import { QuickAdd } from '../components/QuickAdd';
import { TaskCard } from '../components/TaskCard';
import { DayTimeline } from '../components/DayTimeline';
import { Icon } from '../components/Icon';
import { EmptyState, SectionHead } from '../components/ui';
import { WeekCard } from '../components/WeekCard';
import { HabitIdentity } from '../components/HabitAppearance';
import { habitStyle } from '../components/habitStyle';
import { Disclosure } from '../components/Disclosure';
import { computeNudges, type NudgeAction } from '../components/nudges';
import { startTask } from '../components/focusFlow';
import { TopActions } from './TopActions';

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function TodayScreen() {
  const ctx = useTodayContext();
  const { today, now, items, overdue } = ctx;
  const name = useStore((s) => s.settings.name);
  const dismissed = useStore((s) => s.dismissed);
  const [showDone, setShowDone] = useState(false);

  const pending = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done && i.task.kind !== 'event');
  const timed = pending.filter((i) => i.time && (i.task.kind !== 'event' || timeToMin(i.time) + i.duration > now));
  const untimed = pending.filter((i) => !i.time);
  const totalToday = items.filter((i) => i.task.kind !== 'event').length;
  const remaining = timed.length + untimed.length;

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
        break;
      case 'eventHeld':
        if (a.taskId && a.date) {
          actions.markEvent(a.taskId, a.date, 'held');
          toast('Marcado como realizado', { label: 'Desfazer', run: () => actions.undo() });
        }
        break;
      case 'eventMissed':
        if (a.taskId && a.date) openSheet({ type: 'eventMissed', id: a.taskId, date: a.date });
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
          </p>

          <div className="section" style={{ marginTop: 16 }}>
            <QuickAdd placeholder="Jogue aqui o que estiver na cabeça…" />
          </div>

          <section className="section" aria-labelledby="now-h">
            <SectionHead title={<span id="now-h">Agora</span>} />
            <NowCard />
          </section>

          <section className="section" aria-label="Seu dia em resumo" style={{ marginTop: 14 }}>
            <DayPulse doneToday={done.length} totalToday={totalToday} />
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
                <EmptyState icon="✓" title="Itens de hoje concluídos." text="Você pode revisar outras pendências ou encerrar por aqui." />
              ) : (
                <EmptyState icon="☀️" title="Nada planejado para hoje." text="Capture uma tarefa acima ou revise suas pendências para escolher o próximo passo." />
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
  ok: { label: 'Parece caber no seu período', tone: 'green' },
  tight: { label: 'Período apertado', tone: 'yellow' },
  over: { label: 'Não cabe tudo nesse período', tone: 'red' },
  ended: { label: 'Período planejado terminou', tone: 'gray' },
};

/** Painel do dia: progresso, se o que falta cabe no tempo livre e o próximo compromisso. */
function DayPulse({ doneToday, totalToday }: { doneToday: number; totalToday: number }) {
  const { today, now, tasks, settings } = useTodayContext();
  const cap = useMemo(() => dayCapacity(tasks, today, settings, now), [tasks, today, settings, now]);
  const meta = CAPACITY[cap.status];
  const progress = totalToday ? Math.min(1, Math.max(0, doneToday / totalToday)) : 0;
  const circumference = 2 * Math.PI * 16;
  const estimate = cap.status === 'ended'
    ? cap.left ? `${formatDuration(cap.left)} ficaram pendentes` : 'Tudo certo por hoje'
    : cap.left ? `${formatDuration(cap.left)} de tarefas · ${formatDuration(cap.free) || '0 min'} disponíveis*` : 'Nenhuma tarefa pendente';

  return (
    <Disclosure className="card day-summary" title={<span className="day-summary-heading">
      <span className="pulse-ring" role="img" aria-label={`${doneToday} de ${totalToday} tarefas concluídas hoje`}>
        <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
          <circle cx="20" cy="20" r="16" className="pulse-track" />
          <circle cx="20" cy="20" r="16" className="pulse-fill" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - progress)} />
        </svg>
        <span className="num" aria-hidden="true">{doneToday}/{totalToday}</span>
      </span>
      <span className="day-summary-title">
      <span className={`pulse-status tone-text-${meta.tone}`}><i aria-hidden="true" />{meta.label}</span>
      <span className="xs muted day-summary-estimate">{estimate}</span>
      <span className="sr-only">Ver detalhes da estimativa e ajustar plano</span>
      </span>
    </span>}>
      <div className="day-summary-details">
        <p className="small muted">{doneToday} de {totalToday} tarefas concluídas.</p>
        <p className="xs muted">*Estimativa somente dos itens do Leve, no período {settings.dayStart}–{settings.dayEnd}. Compromissos existentes no Google Agenda não são importados.</p>
        <button className="btn btn-sm btn-soft" onClick={() => openSheet({ type: 'plan', date: cap.status === 'ended' && cap.left > 0 ? addDays(today, 1) : today })}>
          {cap.status === 'ended' && cap.left > 0 ? 'Planejar amanhã' : 'Ajustar disponibilidade e plano'}
        </button>
      </div>
    </Disclosure>
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
            onClick={() => setOpen(v => !v)}
            aria-expanded={open}
          >
            {open ? 'Ocultar pendências' : 'Revisar pendências'}
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

  if (rec.type === 'event' || rec.type === 'scheduled') {
    const t = rec.item.task;
    const end = minToTime(timeToMin(rec.item.time!) + rec.item.duration);
    return (
      <div className="now-card">
        <div className="eyebrow">{rec.ongoing ? 'Acontecendo agora' : `Próxima agendada · em ${rec.minutes} min`}</div>
        <div className="now-title">{t.title}</div>
        <div className="now-meta num">
          <span>
            {rec.item.time}–{end}
          </span>
          {t.kind === 'habit' ? <span style={habitStyle(t)}><HabitIdentity task={t} /></span> : <span>{t.kind === 'event' ? 'Compromisso' : 'Tarefa planejada'}</span>}
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
        <div className="eyebrow">No seu ritmo</div>
        <div className="now-title">Sem sugestão para começar agora.</div>
        <p className="now-reason">
          {rec.reason ?? (inboxCount > 0 ? `Você tem ${inboxCount} ${inboxCount === 1 ? 'captura' : 'capturas'} para revisar.` : 'Você pode descansar, capturar algo ou escolher uma tarefa na sua lista.')}
        </p>
        {inboxCount > 0 && (
          <div className="now-actions">
            <button className="btn btn-soft btn-block" onClick={() => openSheet({ type: 'review' })}>
              <Icon name="sparkles" size={18} />
              Revisar capturas
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
        <div className="eyebrow">
          {c.ongoing ? 'Acontecendo agora' : c.item.time ? `Próxima hoje · às ${c.item.time}` : 'Próxima ação'}
        </div>
        <div className="now-title">{t.title}</div>
        <div className="now-meta">
          {t.kind === 'habit' && <span style={habitStyle(t)}><HabitIdentity task={t} /></span>}
          {c.item.time && (
            <span className="num">
              <Icon name="clock" size={12} /> {c.item.time}
            </span>
          )}
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
          {c.reason}
        </p>
        {nextStep && <p className="small muted">Próximo passo: {nextStep.title}</p>}
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
      <button className="btn btn-sm btn-ghost" onClick={() => openSheet({ type: 'breakdown', id: t.id })}>Dividir em passos (opcional)</button>
    </div>
  );
}
