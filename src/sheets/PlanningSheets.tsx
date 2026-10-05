import { useMemo, useState } from 'react';
import type { Priority } from '../domain/types';
import { addDays, formatDay, formatDuration, formatLongDate, minToTime, nowMin, timeToMin, todayISO, weekdayOf } from '../domain/dates';
import { PRIORITY_META } from '../domain/priority';
import { DAY_PARTS, nextFreeSlot, slotsByPart } from '../domain/planner';
import { durationOf, inboxTasks } from '../domain/selectors';
import type { Suggestion } from '../domain/organize';
import { assistant } from '../services/assistant';
import { actions, getState, uid, useStore } from '../store/store';
import { closeSheet, openSheet, toast } from '../store/ui';
import { BottomSheet } from '../components/BottomSheet';
import { Checkbox, EmptyState, Option } from '../components/ui';
import { Icon } from '../components/Icon';

/* ------------------------------------------------------------------ */
/* Organizar meu dia                                                   */
/* ------------------------------------------------------------------ */

export function PlanSheet({ date }: { date: string }) {
  const [plan] = useState(() => {
    const s = getState();
    return assistant.planDay(s.tasks, date, s.settings);
  });
  const dayEnd = useStore((s) => s.settings.dayEnd);
  // O que não coube: você escolhe o que vai para o dia seguinte (recorrentes não se movem)
  const movable = plan.deferred.filter((t) => !t.recurrence);
  const [defer, setDefer] = useState<Set<string>>(new Set());
  const toggleDefer = (id: string) =>
    setDefer((d) => {
      const n = new Set(d);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const today = todayISO();
  const tomorrow = addDays(date, 1);
  const dayOver = date === today && nowMin() >= timeToMin(dayEnd);

  type Row = { time: string; end: string; title: string; kind: 'fixed' | 'new' | 'break'; sub?: string };
  const rows: Row[] = [
    ...plan.fixed.filter((f) => f.time && timeToMin(f.time) + f.duration > plan.start).map((f) => ({
      time: f.time!, end: minToTime(timeToMin(f.time!) + f.duration), title: f.task.title, kind: 'fixed' as const,
      sub: f.task.kind === 'event' ? 'Compromisso' : 'Já agendada',
    })),
    ...plan.placements.map((p) => ({
      time: p.time, end: minToTime(timeToMin(p.time) + p.duration), title: p.task.title, kind: 'new' as const, sub: formatDuration(p.duration),
    })),
    ...plan.breaks.map((b) => ({ time: b.time, end: minToTime(timeToMin(b.time) + b.duration), title: b.label, kind: 'break' as const })),
  ].sort((a, b) => timeToMin(a.time) - timeToMin(b.time));

  const slack = Math.max(0, plan.freeMinutes - plan.plannedMinutes);
  const nothing = plan.placements.length === 0 && movable.length === 0;
  const canApply = plan.placements.length > 0 || defer.size > 0;

  const apply = () => {
    actions.applyDayPlan(plan, [...defer]);
    closeSheet();
    const parts = [
      plan.placements.length && `${plan.placements.length} ${plan.placements.length === 1 ? 'tarefa encaixada' : 'tarefas encaixadas'}`,
      defer.size && `${defer.size} para ${formatDay(tomorrow).toLowerCase()}`,
    ].filter(Boolean);
    toast(`Dia organizado · ${parts.join(' · ')}`, { label: 'Desfazer', run: () => actions.undo() });
  };

  if (dayOver) {
    return (
      <BottomSheet title="Organizar meu dia" onClose={closeSheet}
        footer={
          <>
            <button className="btn btn-secondary" onClick={closeSheet}>Fechar</button>
            <button className="btn btn-primary grow" onClick={() => openSheet({ type: 'plan', date: tomorrow })}>
              <Icon name="wand" size={18} />
              Organizar amanhã
            </button>
          </>
        }
      >
        <EmptyState icon="🌙" title="Seu dia já terminou." text={`Seu horário vai até ${dayEnd} (ajuste no Perfil). Que tal deixar amanhã organizado?`} />
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      title={date === today ? 'Organizar meu dia' : `Organizar ${formatDay(date).toLowerCase()}`}
      onClose={closeSheet}
      footer={
        !nothing && (
          <>
            <button className="btn btn-secondary" onClick={closeSheet}>Cancelar</button>
            <button className="btn btn-primary grow" onClick={apply} disabled={!canApply}>Aplicar plano</button>
          </>
        )
      }
    >
      {nothing ? (
        <EmptyState icon="🧘" title="Nada para organizar." text="Não há tarefas sem horário para encaixar neste dia." />
      ) : (
        <>
          <p className="small muted" style={{ marginBottom: 16 }}>
            {plan.placements.length > 0 ? (
              <>
                Encaixei <b style={{ color: 'var(--text)' }}>{plan.placements.length} {plan.placements.length === 1 ? 'tarefa' : 'tarefas'}</b> ({formatDuration(plan.plannedMinutes)})
                e deixei <b style={{ color: 'var(--text)' }}>{formatDuration(slack) || '0 min'}</b> livres para imprevistos, pausas e transições.
              </>
            ) : (
              <>Não sobrou espaço livre {date === today ? 'hoje' : 'neste dia'} para encaixar novas tarefas.</>
            )}
          </p>
          {rows.length > 0 && (
            <div className="stack" style={{ gap: 6 }}>
              {rows.map((r, i) => (
                <div key={i} className="row" style={{ alignItems: 'stretch', gap: 12, opacity: r.kind === 'fixed' ? 0.65 : 1 }}>
                  <span className="num small" style={{ width: 44, paddingTop: 10, color: 'var(--text-2)', fontWeight: 600 }}>{r.time}</span>
                  <div
                    className={`block ${r.kind === 'new' ? 'proposed' : r.kind === 'break' ? 'break' : 'event'}`}
                    style={{ position: 'static', flex: 1, animationDelay: `${i * 40}ms` }}
                  >
                    <span className="block-title">{r.title}</span>
                    <span className="block-meta num">
                      {r.time}–{r.end}
                      {r.sub && ` · ${r.sub}`}
                      {r.kind === 'new' && <span style={{ color: 'var(--accent)', fontWeight: 600 }}>· nova</span>}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
          {movable.length > 0 && (
            <div className="card card-pad" style={{ marginTop: 20, boxShadow: 'none', background: 'var(--surface-2)' }}>
              <div style={{ fontWeight: 600 }}>Não coube {date === today ? 'hoje' : 'neste dia'}</div>
              <div className="small muted">Marque o que quer mover para {formatDay(tomorrow).toLowerCase()}. O resto fica como está.</div>
              <div style={{ marginTop: 8 }}>
                {movable.map((t) => (
                  <div key={t.id} className="subtask">
                    <Checkbox checked={defer.has(t.id)} onToggle={() => toggleDefer(t.id)} label={`Mover ${t.title}`} />
                    <span className="grow" style={{ padding: '8px 0' }}>{t.title}</span>
                    <span className="xs faint num">{formatDuration(durationOf(t))}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </BottomSheet>
  );
}

/* ------------------------------------------------------------------ */
/* Organizar capturas do Inbox                                         */
/* ------------------------------------------------------------------ */

function dateOptions() {
  const today = todayISO();
  const wd = weekdayOf(today);
  return [
    { label: 'Hoje', value: today },
    { label: 'Amanhã', value: addDays(today, 1) },
    { label: 'Sábado', value: wd === 6 ? today : addDays(today, 6 - wd) },
    { label: 'Próx. semana', value: addDays(today, ((8 - wd) % 7) || 7) },
    { label: 'Quando der', value: undefined as string | undefined },
  ];
}

export function ReviewSheet() {
  const [initial] = useState(() => {
    const s = getState();
    return inboxTasks(s.tasks).map((t) => assistant.suggest(t, s.tasks, s.settings));
  });
  const [sugs, setSugs] = useState<Suggestion[]>(initial);
  // Começa desmarcado: você escolhe quais sugestões aceitar
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<string | null>(null);
  const [step, setStep] = useState<'review' | 'done'>('review');

  const patch = (id: string, p: Partial<Suggestion>) => setSugs((list) => list.map((s) => (s.taskId === id ? { ...s, ...p } : s)));
  const cyclePriority = (p: Priority): Priority => (p === 'essential' ? 'important' : p === 'important' ? 'optional' : 'essential');

  const apply = () => {
    const chosen = sugs.filter((s) => included.has(s.taskId));
    actions.applySuggestions(chosen);
    setStep('done');
  };

  if (step === 'done') {
    return (
      <BottomSheet title="Pronto" onClose={closeSheet}
        footer={
          <>
            <button className="btn btn-secondary" onClick={closeSheet}>Agora não</button>
            <button className="btn btn-primary grow" onClick={() => openSheet({ type: 'week' })}>
              <Icon name="wand" size={18} />
              Organizar semana
            </button>
          </>
        }
      >
        <div className="empty" style={{ paddingTop: 16 }}>
          <div className="empty-icon">✓</div>
          <div className="empty-title">Suas capturas estão organizadas.</div>
          <p>Quer que eu organize o restante da sua semana também?</p>
        </div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet
      title="Organizar capturas"
      onClose={closeSheet}
      full
      footer={
        sugs.length > 0 && (
          <button className="btn btn-primary btn-block btn-lg" disabled={included.size === 0} onClick={apply}>
            {included.size === 0 ? 'Marque ao menos uma' : `Aplicar ${included.size} ${included.size === 1 ? 'sugestão' : 'sugestões'}`}
          </button>
        )
      }
    >
      {sugs.length === 0 ? (
        <EmptyState icon="✨" title="Tudo limpo" text="Não há capturas para organizar agora." />
      ) : (
        <>
          <div className="row" style={{ justifyContent: 'space-between', marginBottom: 12, gap: 12 }}>
            <p className="small muted">Marque as sugestões que quer aceitar. Toque no texto para ajustar dia e prioridade.</p>
            <button
              className="btn btn-sm btn-ghost"
              style={{ flexShrink: 0 }}
              onClick={() => setIncluded(included.size === sugs.length ? new Set() : new Set(sugs.map((s) => s.taskId)))}
            >
              {included.size === sugs.length ? 'Desmarcar todas' : 'Marcar todas'}
            </button>
          </div>
          <div className="list">
            {sugs.map((s) => {
              const on = included.has(s.taskId);
              return (
                <div key={s.taskId}>
                  <div className="task">
                    <Checkbox
                      checked={on}
                      label={`Incluir ${s.title}`}
                      onToggle={() => {
                        const next = new Set(included);
                        if (on) next.delete(s.taskId);
                        else next.add(s.taskId);
                        setIncluded(next);
                      }}
                    />
                    <button className="task-main" onClick={() => setEditing(editing === s.taskId ? null : s.taskId)} aria-expanded={editing === s.taskId}>
                      <div className="task-title">{s.title}</div>
                      <div className="task-meta">
                        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>
                          <Icon name="arrow-right" size={12} />
                          {s.date ? formatDay(s.date) : 'Quando der'}
                        </span>
                        <span>{formatDuration(s.duration)}</span>
                        <span className={`prio ${s.priority}`}><span className="prio-dot" />{PRIORITY_META[s.priority].label}</span>
                      </div>
                      <div className="xs faint" style={{ marginTop: 2 }}>{s.reason}</div>
                    </button>
                  </div>
                  {editing === s.taskId && (
                    <div className="inbox-actions" style={{ flexWrap: 'wrap' }}>
                      {dateOptions().map((o) => (
                        <button key={o.label} className={`chip${s.date === o.value ? ' on' : ''}`} onClick={() => patch(s.taskId, { date: o.value })}>
                          {o.label}
                        </button>
                      ))}
                      <button className="chip" onClick={() => patch(s.taskId, { priority: cyclePriority(s.priority) })}>
                        <Icon name="flag" size={14} />
                        Prioridade
                      </button>
                      {s.breakdown && (
                        <button className="chip" onClick={() => openSheet({ type: 'breakdown', id: s.taskId }, { stack: true })}>
                          <Icon name="split" size={14} />
                          Dividir
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </BottomSheet>
  );
}

/* ------------------------------------------------------------------ */
/* Organizar semana                                                    */
/* ------------------------------------------------------------------ */

export function WeekSheet() {
  const [assignments] = useState(() => {
    const s = getState();
    return assistant.planWeek(s.tasks, s.settings);
  });
  const byDay = useMemo(() => {
    const map = new Map<string, typeof assignments>();
    for (const a of assignments) map.set(a.date, [...(map.get(a.date) ?? []), a]);
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [assignments]);

  return (
    <BottomSheet
      title="Organizar semana"
      onClose={closeSheet}
      footer={
        assignments.length > 0 && (
          <>
            <button className="btn btn-secondary" onClick={closeSheet}>Cancelar</button>
            <button
              className="btn btn-primary grow"
              onClick={() => {
                actions.applyWeek(assignments);
                closeSheet();
                toast('Semana organizada', { label: 'Desfazer', run: () => actions.undo() });
              }}
            >
              Confirmar
            </button>
          </>
        )
      }
    >
      {assignments.length === 0 ? (
        <EmptyState icon="🗓️" title="Sua semana já está organizada." text="Todas as tarefas têm um dia. Tarefas “se der” ficam livres de propósito." />
      ) : (
        <>
          <p className="small muted" style={{ marginBottom: 16 }}>
            Distribuí {assignments.length} {assignments.length === 1 ? 'tarefa' : 'tarefas'} respeitando prazos, compromissos e o tempo livre de cada dia.
          </p>
          <div className="stack" style={{ gap: 16 }}>
            {byDay.map(([day, list]) => (
              <div key={day}>
                <div className="row" style={{ justifyContent: 'space-between', marginBottom: 6 }}>
                  <span className="section-title">{formatDay(day, todayISO(), { long: true })}</span>
                  <span className="xs faint num">{formatDuration(list.reduce((s, a) => s + durationOf(a.task), 0))}</span>
                </div>
                <div className="list">
                  {list.map((a) => (
                    <div key={a.task.id} className="task" style={{ minHeight: 44, padding: '10px 14px' }}>
                      <span className={`prio ${a.task.priority ?? 'optional'}`} style={{ paddingTop: 7 }}><span className="prio-dot" /></span>
                      <span className="grow">{a.task.title}</span>
                      <span className="xs faint num" style={{ paddingTop: 3 }}>{formatDuration(durationOf(a.task))}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </BottomSheet>
  );
}

/* ------------------------------------------------------------------ */
/* Replanejar                                                          */
/* ------------------------------------------------------------------ */

const capFirst = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function ReplanSheet({ id, date }: { id: string; date: string }) {
  const task = useStore((s) => s.tasks.find((t) => t.id === id));
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  /** dia escolhido → pergunta o período */
  const [day, setDay] = useState<string>();
  const [step, setStep] = useState<'when' | 'pickDay' | 'part' | 'exact'>('when');
  const [cDate, setCDate] = useState(addDays(todayISO(), 1));
  const [cTime, setCTime] = useState('');
  if (!task) return null;

  const today = todayISO();
  const tomorrow = addDays(today, 1);
  const duration = durationOf(task, settings.defaultDuration);
  const todayHasRoom = slotsByPart(tasks, today, duration, settings, id).some((p) => p.slot);

  const move = (d: string, time?: string) => {
    actions.postpone(id, 'custom', { date: d, time }, date);
    closeSheet();
    toast(`Movida para ${formatDay(d).toLowerCase()}${time ? ` às ${time}` : ' · sem horário'}`, { label: 'Desfazer', run: () => actions.undo() });
  };
  const run = (mode: 'later' | 'unschedule' | 'tomorrow') => {
    const label = actions.postpone(id, mode, undefined, date);
    closeSheet();
    toast(label, { label: 'Desfazer', run: () => actions.undo() });
  };
  const chooseDay = (d: string) => {
    setDay(d);
    setStep('part');
  };

  // Tarefas recorrentes: só pular esta vez ou fazer mais tarde
  if (task.recurrence) {
    const later = nextFreeSlot(tasks, today, duration, settings, { after: nowMin(), excludeId: id });
    return (
      <BottomSheet title="Quer que eu reorganize?" onClose={closeSheet}>
        <p className="small muted" style={{ marginBottom: 8 }}>Sem problema — “{task.title}” fica para outro momento.</p>
        <div className="stack" style={{ gap: 2 }}>
          <Option icon="clock" title="Fazer mais tarde hoje" sub={later ? `Próximo horário livre: ${later}` : 'Sem espaço hoje'} disabled={!later} onClick={() => run('later')} />
          <Option icon="calendar-arrow" title="Pular esta vez" sub="Volta na próxima repetição" onClick={() => run('tomorrow')} />
        </div>
      </BottomSheet>
    );
  }

  if (step === 'part' && day) {
    const parts = slotsByPart(tasks, day, duration, settings, id);
    const full = !parts.some((p) => p.slot);
    const now = nowMin();
    return (
      <BottomSheet title="Em que período?" onClose={closeSheet}>
        <p className="small muted" style={{ marginBottom: 8 }}>
          {capFirst(formatLongDate(day))} · {formatDuration(duration)}. Eu encaixo no primeiro horário livre do período.
        </p>
        {full && (
          <div className="nudge" role="alert" style={{ boxShadow: 'none', background: 'var(--surface-2)', marginBottom: 8 }}>
            <span className="nudge-icon yellow"><Icon name="calendar" size={18} /></span>
            <p className="nudge-text grow">
              Não há espaço livre {day === today ? 'hoje' : `em ${formatDay(day).toLowerCase()}`} para {formatDuration(duration)}. Escolha outro dia.
            </p>
          </div>
        )}
        <div className="stack" style={{ gap: 2 }}>
          {parts.map((p) => {
            const passed = day === today && DAY_PARTS.find((x) => x.part === p.part)!.to <= now;
            const sub = p.slot
              ? `Livre às ${p.slot}`
              : p.outside
                ? passed ? 'Já passou' : 'Fora do seu horário (ajuste no Perfil)'
                : 'Sem espaço livre';
            return (
              <Option
                key={p.part}
                icon={p.part === 'morning' ? 'coffee' : p.part === 'afternoon' ? 'sun' : 'moon'}
                title={p.label}
                sub={sub}
                disabled={!p.slot}
                onClick={() => move(day, p.slot)}
              />
            );
          })}
          <div className="divider" style={{ margin: '8px 0' }} />
          {full && <Option icon="calendar" title="Escolher outro dia" onClick={() => setStep('pickDay')} />}
          <Option icon="hourglass" title={`${day === today ? 'Hoje' : capFirst(formatDay(day))}, sem horário`} sub="Fica na lista do dia para encaixar quando der" onClick={() => move(day)} />
          <Option icon="clock" title="Escolher horário exato" onClick={() => { setCDate(day); setStep('exact'); }} />
        </div>
        <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setStep('when')}>
          <Icon name="chevron-left" size={16} />
          Voltar
        </button>
      </BottomSheet>
    );
  }

  if (step === 'pickDay' || step === 'exact') {
    const exact = step === 'exact';
    return (
      <BottomSheet title={exact ? 'Escolher horário' : 'Escolher outro dia'} onClose={closeSheet}>
        <div className="stack" style={{ gap: 12, marginTop: 8 }}>
          <div className="row">
            <input type="date" className="input num grow" value={cDate} min={today} onChange={(e) => setCDate(e.target.value)} aria-label="Data" />
            {exact && <input type="time" className="input num" style={{ width: 130 }} value={cTime} onChange={(e) => setCTime(e.target.value)} aria-label="Horário" />}
          </div>
          <div className="row">
            <button className="btn btn-secondary" onClick={() => setStep(day ? 'part' : 'when')}>Voltar</button>
            <button
              className="btn btn-primary grow"
              disabled={!cDate || (exact && !cTime)}
              onClick={() => (exact ? move(cDate, cTime) : chooseDay(cDate))}
            >
              {exact ? 'Confirmar' : 'Continuar'}
            </button>
          </div>
        </div>
      </BottomSheet>
    );
  }

  return (
    <BottomSheet title="Para quando?" onClose={closeSheet}>
      <p className="small muted" style={{ marginBottom: 8 }}>
        Sem problema — “{task.title}” fica para outro momento. Escolha o dia e depois o período.
      </p>
      <div className="stack" style={{ gap: 2 }}>
        <Option icon="clock" title="Mais tarde hoje" sub={todayHasRoom ? 'Escolha manhã, tarde ou noite' : 'Sem espaço livre hoje'} disabled={!todayHasRoom} onClick={() => chooseDay(today)} />
        <Option icon="calendar-arrow" title="Amanhã" sub={capFirst(formatLongDate(tomorrow))} onClick={() => chooseDay(tomorrow)} />
        <Option icon="calendar" title="Outro dia" onClick={() => setStep('pickDay')} />
        <Option icon="hourglass" title="Manter sem horário" sub="Continua na lista de hoje" onClick={() => run('unschedule')} />
      </div>
    </BottomSheet>
  );
}

/* ------------------------------------------------------------------ */
/* Dividir em passos / começar por 10 minutos                          */
/* ------------------------------------------------------------------ */

interface StepDraft {
  /** id do passo que já existia na tarefa */
  id?: string;
  title: string;
  on: boolean;
  done?: boolean;
}

export function BreakdownSheet({ id, thenFocus }: { id: string; thenFocus?: boolean }) {
  const task = useStore((s) => s.tasks.find((t) => t.id === id));
  // Passos que você já tem vêm marcados; sugestões novas vêm desmarcadas para você escolher.
  const [initial] = useState<StepDraft[]>(() => {
    if (!task) return [];
    const existing = task.subtasks.map((s) => ({ id: s.id, title: s.title, on: true, done: s.done }));
    const have = new Set(existing.map((s) => s.title.trim().toLowerCase()));
    const suggested = assistant
      .breakdown(task)
      .filter((title) => !have.has(title.trim().toLowerCase()))
      .map((title) => ({ title, on: false }));
    return [...existing, ...suggested];
  });
  const [steps, setSteps] = useState(initial);
  const [extra, setExtra] = useState('');
  if (!task) return null;

  const chosen = steps.filter((s) => s.on && s.title.trim());
  const changed = steps !== initial;
  const hadSteps = task.subtasks.length > 0;

  const save = () => {
    if (changed) {
      actions.setSubtasks(
        id,
        chosen.map((s) => ({ id: s.id ?? uid(), title: s.title.trim(), done: !!s.done })),
      );
    }
    if (task.status === 'inbox') actions.update(id, { status: 'active' });
  };

  return (
    <BottomSheet
      title={thenFocus ? 'Essa tarefa parece grande' : 'Dividir em passos'}
      onClose={closeSheet}
      footer={
        thenFocus ? (
          <>
            <button className="btn btn-secondary" onClick={() => { save(); closeSheet(); actions.startFocus(id); }}>
              Só começar
            </button>
            <button className="btn btn-primary grow" onClick={() => { save(); closeSheet(); actions.startFocus(id, todayISO(), 10); }}>
              <Icon name="play" size={16} fill />
              Começar por 10 min
            </button>
          </>
        ) : (
          <button
            className="btn btn-primary btn-block"
            disabled={!changed}
            onClick={() => {
              save();
              closeSheet();
              toast(`Passos salvos · ${chosen.length}`, { label: 'Desfazer', run: () => actions.undo() });
            }}
          >
            Salvar passos ({chosen.length})
          </button>
        )
      }
    >
      <p className="small muted" style={{ marginBottom: 12 }}>
        {thenFocus ? (
          <>Quer começar por só 10 minutos? Marque os passos que fazem sentido para “{task.title}” — o primeiro já é suficiente.</>
        ) : (
          <>Marque os passos sugeridos que quiser incluir em “{task.title}”.</>
        )}
        {hadSteps && <> Os que você já tinha aparecem marcados — desmarque para remover.</>}
      </p>
      <div>
        {steps.map((s, i) => (
          <div key={i} className="subtask">
            <Checkbox checked={s.on} label={`Incluir: ${s.title}`} onToggle={() => setSteps((l) => l.map((x, j) => (j === i ? { ...x, on: !x.on } : x)))} />
            <input value={s.title} onChange={(e) => setSteps((l) => l.map((x, j) => (j === i ? { ...x, title: e.target.value } : x)))} aria-label="Passo" />
            {s.id ? (
              <span className="chip" style={{ minHeight: 24, fontSize: 12 }}>{s.done ? 'feito' : 'seu'}</span>
            ) : (
              <span className="chip parsed" style={{ minHeight: 24, fontSize: 12 }}>sugestão</span>
            )}
          </div>
        ))}
        <form
          className="subtask"
          onSubmit={(e) => {
            e.preventDefault();
            if (extra.trim()) setSteps((l) => [...l, { title: extra.trim(), on: true }]);
            setExtra('');
          }}
        >
          <Icon name="plus" size={18} className="faint" />
          <input value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="Adicionar outro passo" aria-label="Novo passo" />
        </form>
      </div>
    </BottomSheet>
  );
}
