import { useState, type ReactNode } from 'react';
import type { Kind, Priority, Recurrence, Task } from '../domain/types';
import { addDays, formatDay, formatDuration, minToTime, nowMin, timeToMin, todayISO, weekdayOf } from '../domain/dates';
import { PRIORITY_META } from '../domain/priority';
import { parse } from '../domain/parser';
import { occursOn, recurrenceError, recurrenceLabel } from '../domain/recurrence';
import { assistant } from '../services/assistant';
import { actions, uid, useStore, type SeriesScope } from '../store/store';
import { closeSheet, openSheet, toast } from '../store/ui';
import { BottomSheet } from '../components/BottomSheet';
import { NumberField, Option, ProgressBar, Segmented } from '../components/ui';
import { Icon, type IconName } from '../components/Icon';
import { RecurrenceEditor } from '../components/RecurrenceEditor';
import { SubtaskList } from '../components/SubtaskList';
import { completeWithFeedback, removeWithFeedback } from '../components/feedback';
import { startTask } from '../components/focusFlow';

const DURATIONS = [15, 30, 45, 60, 90, 120];
const KIND_LABEL: Record<Kind, string> = { task: 'Tarefa', event: 'Compromisso', habit: 'Hábito' };

type SectionId = 'when' | 'repeat' | 'priority' | 'project' | 'due' | 'notes' | 'kind';

/**
 * Detalhes de uma tarefa, pensados para o celular:
 * - abre como um resumo (uma linha por informação); tocar numa linha abre só aquele ajuste;
 * - o que ajuda a começar (próximo passo, passos, “Começar”) fica no alto e ao alcance do polegar;
 * - edição é rascunho (Cancelar/Salvar), mas marcar um passo como feito vale na hora.
 * Com `initial`, é uma tarefa nova (capturar e já detalhar) que só é criada ao salvar.
 */
export function TaskSheet({ id, date, initial }: { id?: string; date?: string; initial?: Task }) {
  const stored = useStore((s) => (id ? s.tasks.find((t) => t.id === id) : undefined));
  const projects = useStore((s) => s.projects);
  const isNew = !!initial;
  const live = initial ?? stored;
  const [newSub, setNewSub] = useState('');
  const [original, setOriginal] = useState(live);
  const [draft, setDraft] = useState(live);
  /** Inbox: escolheu explicitamente “Quando der” (sem data) */
  const [someday, setSomeday] = useState(false);
  /** Pergunta “só este / este e os seguintes / todos” de uma série */
  const [ask, setAsk] = useState<'save' | 'delete'>();
  /** Um ajuste aberto por vez; capturas novas já abrem em “Quando”, a decisão que falta */
  const [open, setOpen] = useState<SectionId | undefined>(live && (isNew || live.status === 'inbox') ? 'when' : undefined);
  const dirty = draft !== original || someday;
  // Sem alterações pendentes, acompanha a versão salva (ex.: concluída, sincronizada)
  if (!isNew && !dirty && live && live !== original) {
    setOriginal(live);
    setDraft(live);
  }
  const task = dirty ? draft : live;
  if (!task || !original) return null;

  const inbox = isNew || original.status === 'inbox';
  const editing = inbox || dirty;
  const today = todayISO();
  const occurrence = date ?? task.date ?? today;
  const isEvent = task.kind === 'event';
  const series = original.recurrence && occursOn(original.recurrence, occurrence) ? original.recurrence : undefined;
  const missed = task.recurrence ? !!task.missedDates?.includes(occurrence) : task.status === 'done' && !!task.missed;
  const isDone = task.recurrence ? !!task.doneDates?.includes(occurrence) || missed : task.status === 'done';
  const started = occurrence < today || (occurrence === today && (!task.time || timeToMin(task.time) <= nowMin()));
  const noun = isEvent ? 'compromisso' : 'tarefa';
  const project = projects.find((p) => p.id === task.projectId);

  const upd = (patch: Partial<Task>) => setDraft({ ...task, ...patch });
  const toggle = (s: SectionId) => setOpen(open === s ? undefined : s);
  const addSubtasks = (titles: string[]) =>
    upd({ subtasks: [...task.subtasks, ...titles.filter(Boolean).map((title) => ({ id: uid(), title, done: false }))] });

  const ruleError = recurrenceError(task.recurrence);
  const error = !task.title.trim() ? `Dê um nome para ${isEvent ? 'o compromisso' : 'a tarefa'}.` : ruleError;
  const confirmDiscard = () => {
    if (isNew) return !task.title.trim() || confirm('Descartar esta tarefa? Ela ainda não foi salva.');
    return !dirty || confirm('Descartar as alterações que você não salvou?');
  };

  /** Inbox: só sai de lá quando ganha um lugar (dia, repetição, projeto ou “Quando der”). */
  const placed = !!(task.date || task.recurrence || task.projectId || someday);
  const whereLabel = (t: Task) =>
    t.recurrence
      ? recurrenceLabel(t.recurrence, { ends: false }).toLowerCase()
      : t.date
        ? `${formatDay(t.date).toLowerCase()}${t.time ? ` às ${t.time}` : ''}`
        : placed
          ? t.projectId && !someday ? `no projeto ${project?.name ?? ''}` : 'em “Tarefas › Quando der”'
          : 'continua no Inbox';

  const save = (scope?: SeriesScope) => {
    if (!draft || error) return;
    const final: Task = { ...draft, title: draft.title.trim(), status: inbox ? (placed ? 'active' : 'inbox') : draft.status };
    if (isNew) {
      actions.add(final);
      closeSheet();
      toast(`${final.kind === 'event' ? 'Compromisso criado' : final.kind === 'habit' ? 'Hábito criado' : 'Tarefa criada'} · ${whereLabel(final)}`, { label: 'Desfazer', run: () => actions.undo() });
      return;
    }
    if (series && !scope) {
      setAsk('save');
      return;
    }
    closeSheet();
    if (series && scope) actions.saveSeries(final.id, final, scope, occurrence);
    else actions.saveTask(final.id, final);
    toast(inbox ? `Alterações salvas · ${whereLabel(final)}` : 'Alterações salvas', { label: 'Desfazer', run: () => actions.undo() });
  };

  const remove = (scope?: SeriesScope) => {
    if (isNew) {
      closeSheet();
      return;
    }
    if (series && !scope) {
      setAsk('delete');
      return;
    }
    if (!scope && !confirm(`Excluir “${task.title}”?`)) return;
    closeSheet();
    if (series && scope) {
      actions.removeSeries(task.id, scope, occurrence);
      toast(scope === 'one' ? 'Ocorrência excluída' : scope === 'following' ? 'Excluída desta data em diante' : 'Série excluída', { label: 'Desfazer', run: () => actions.undo() });
    } else removeWithFeedback(task.id);
  };

  const setRecurrence = (r?: Recurrence) =>
    upd({ recurrence: r, date: r ? undefined : task.recurrence ? (series ? occurrence : task.recurrence.anchor) : task.date });

  /** Hábito é, por natureza, algo que se repete: já começa como “todo dia”. */
  const setKind = (kind: Kind) => {
    if (kind === 'habit' && !task.recurrence) {
      upd({ kind, recurrence: { freq: 'daily', anchor: task.date ?? today }, date: undefined });
      setOpen('repeat');
    } else upd({ kind });
  };

  const quickDates: { label: string; value: string }[] = [
    { label: 'Hoje', value: today },
    { label: 'Amanhã', value: addDays(today, 1) },
    { label: 'Sábado', value: addDays(today, (6 - weekdayOf(today) + 7) % 7 || 7) },
    { label: 'Próx. semana', value: addDays(today, ((8 - weekdayOf(today)) % 7) || 7) },
  ];
  const pickDate = (value?: string) => {
    setSomeday(false);
    upd({ date: value, ...(value ? {} : { time: undefined }) });
  };

  const ruleChanged = JSON.stringify(original.recurrence) !== JSON.stringify(task.recurrence);
  const occLabel = formatDay(occurrence, today, { long: true });
  const replan = () => openSheet({ type: 'replan', id: task.id, date: occurrence }, { stack: true });

  /* ---------- Escolha do alcance numa série ---------- */
  if (ask) {
    const del = ask === 'delete';
    const run = (scope: SeriesScope) => (del ? remove(scope) : save(scope));
    const first = !!series && occurrence <= series.anchor;
    return (
      <BottomSheet
        key="scope"
        title={del ? `Excluir ${noun} recorrente` : `Salvar ${noun} recorrente`}
        onClose={() => setAsk(undefined)}
        footer={
          <button className="btn btn-secondary grow" onClick={() => setAsk(undefined)}>
            <Icon name="chevron-left" size={18} />
            Voltar
          </button>
        }
      >
        <p className="small muted" style={{ marginBottom: 8 }}>
          {del ? 'O que você quer excluir?' : 'Onde aplicar as alterações?'}
        </p>
        <div className="stack" style={{ gap: 2 }}>
          {(del || !ruleChanged) && (
            <Option icon="calendar" title={isEvent ? 'Só este evento' : 'Só esta ocorrência'} sub={`${occLabel} — as outras datas continuam iguais`} onClick={() => run('one')} />
          )}
          {!first && (
            <Option
              icon="calendar-arrow"
              title={isEvent ? 'Este e os seguintes' : 'Esta e as seguintes'}
              sub={`A partir de ${occLabel.toLowerCase()} — as que já passaram não mudam`}
              onClick={() => run('following')}
            />
          )}
          <Option icon="repeat" title={isEvent ? 'Todos os eventos' : 'Todas as ocorrências'} sub="A série inteira, inclusive as que já passaram" onClick={() => run('all')} />
        </div>
        {!del && ruleChanged && (
          <p className="xs faint" style={{ marginTop: 8 }}>Como a repetição mudou, não dá para aplicar só nesta data.</p>
        )}
      </BottomSheet>
    );
  }

  /* ---------- Resumos de cada linha ---------- */
  const endTime = task.time ? minToTime(timeToMin(task.time) + (task.duration ?? 30)) : undefined;
  const timeText = task.time ? `${task.time}–${endTime}` : undefined;
  const whenValue = task.recurrence
    ? [timeText ?? 'Sem horário', !task.time && task.duration ? formatDuration(task.duration) : ''].filter(Boolean).join(' · ')
    : task.date
      ? [formatDay(task.date, today), timeText ?? (task.duration ? formatDuration(task.duration) : '')].filter(Boolean).join(' · ')
      : someday
        ? 'Quando der'
        : !inbox && task.duration
          ? `Sem data · ${formatDuration(task.duration)}`
          : '';
  const overdue = !isDone && !isEvent && !task.recurrence && !!task.date && task.date < today;
  const subDone = task.subtasks.filter((s) => s.done).length;
  const nextStep = task.subtasks.find((s) => !s.done);

  /* ---------- Empurrão para começar (uma dica por vez) ---------- */
  const acting = !editing && !isDone && !isEvent;
  let hint: ReactNode = null;
  if (acting && task.postponed >= 2) {
    hint = (
      <Hint icon="bolt" text={<>Adiada <b>{task.postponed} vezes</b>. Começar é a parte mais difícil — experimente só 10 minutos.</>}>
        <button className="btn btn-sm btn-soft" onClick={() => { closeSheet(); actions.startFocus(task.id, occurrence, 10); }}>
          Fazer só 10 min
        </button>
      </Hint>
    );
  } else if (acting && nextStep) {
    hint = <Hint icon="arrow-right" text={<>Próximo passo: <b>{nextStep.title}</b></>} />;
  } else if (acting && task.kind === 'task' && task.subtasks.length === 0 && ((task.duration ?? 0) >= 60 || parse(task.title).big)) {
    hint = (
      <Hint icon="split" text="Parece grande. Dividir em passos pequenos deixa mais fácil começar.">
        <button className="btn btn-sm btn-soft" onClick={() => addSubtasks(assistant.breakdown(task))}>
          <Icon name="sparkles" size={14} />
          Sugerir passos
        </button>
      </Hint>
    );
  }

  /* ---------- Rodapé: uma ação principal, o resto discreto ---------- */
  let footer: ReactNode;
  if (editing) {
    footer = (
      <div className="foot-stack">
        {error ? (
          task.title.trim() || dirty ? <p className="xs" role="alert" style={{ color: 'var(--red)' }}>{error}</p> : null
        ) : inbox ? (
          <p className="xs muted" aria-live="polite">
            Ao salvar: <b style={{ color: 'var(--text)' }}>{whereLabel(task)}</b>
          </p>
        ) : null}
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-secondary" onClick={() => { if (confirmDiscard()) closeSheet(); }}>
            Cancelar
          </button>
          <button className="btn btn-primary grow" onClick={() => save()} disabled={!!error}>
            <Icon name="check" size={18} />
            {isNew ? 'Salvar' : 'Salvar alterações'}
          </button>
        </div>
      </div>
    );
  } else if (isEvent) {
    footer = isDone ? (
      <>
        <span className="small muted grow row" style={{ gap: 6 }}>
          <Icon name={missed ? 'x-circle' : 'check-circle'} size={18} />
          {missed ? 'Não aconteceu' : 'Aconteceu'}
        </span>
        <button className="btn btn-secondary" onClick={() => actions.markEvent(task.id, occurrence)}>
          <Icon name="undo" size={18} />
          Desmarcar
        </button>
        {missed && (
          <button className="btn btn-primary" onClick={replan}>
            <Icon name="calendar-arrow" size={18} />
            Remarcar
          </button>
        )}
      </>
    ) : started ? (
      <div className="foot-stack">
        <button
          className="btn btn-primary btn-block"
          onClick={() => {
            closeSheet();
            actions.markEvent(task.id, occurrence, 'held');
            toast('Marcado como realizado', { label: 'Desfazer', run: () => actions.undo() });
          }}
        >
          <Icon name="check" size={18} />
          Aconteceu
        </button>
        <div className="foot-actions">
          <button className="btn btn-sm btn-ghost" onClick={() => openSheet({ type: 'eventMissed', id: task.id, date: occurrence }, { stack: true })}>
            <Icon name="x" size={16} />
            Não aconteceu
          </button>
          <button className="btn btn-sm btn-ghost" onClick={replan}>
            <Icon name="calendar-arrow" size={16} />
            Remarcar
          </button>
        </div>
      </div>
    ) : (
      <button className="btn btn-secondary grow" onClick={replan}>
        <Icon name="calendar-arrow" size={18} />
        Remarcar
      </button>
    );
  } else if (isDone) {
    footer = (
      <button className="btn btn-secondary grow" onClick={() => actions.reopen(task.id, occurrence)}>
        <Icon name="undo" size={18} />
        Reabrir
      </button>
    );
  } else {
    footer = (
      <div className="foot-stack">
        <button className="btn btn-primary btn-block" onClick={() => { closeSheet(); startTask(task.id, occurrence); }}>
          <Icon name="play" size={16} fill />
          Começar agora
        </button>
        <div className="foot-actions">
          <button className="btn btn-sm btn-ghost" onClick={() => { closeSheet(); actions.startFocus(task.id, occurrence, 10); }}>
            <Icon name="clock" size={16} />
            Só 10 min
          </button>
          <button className="btn btn-sm btn-ghost" onClick={() => { closeSheet(); completeWithFeedback(task.id, occurrence); }}>
            <Icon name="check" size={16} />
            Concluir
          </button>
          <button className="btn btn-sm btn-ghost" onClick={replan}>
            <Icon name="calendar-arrow" size={16} />
            Adiar
          </button>
        </div>
      </div>
    );
  }

  return (
    <BottomSheet
      key="task"
      label={task.title || 'Nova tarefa'}
      onClose={closeSheet}
      canClose={confirmDiscard}
      full
      title={
        <span className="row xs faint" style={{ fontWeight: 600 }}>
          {isNew ? 'Novo' : inbox ? 'Inbox' : KIND_LABEL[task.kind]}
          {isDone && !isNew && <span className="chip" style={{ minHeight: 22, fontSize: 11 }}>{missed ? 'Não aconteceu' : isEvent ? 'Aconteceu' : 'Concluída'}</span>}
        </span>
      }
      headerExtra={
        !isNew && (
          <button className="icon-btn sm btn-danger" onClick={() => remove()} aria-label={`Excluir ${noun}`} title="Excluir">
            <Icon name="trash" size={18} />
          </button>
        )
      }
      footer={footer}
    >
      <textarea
        // cresce com o texto: título longo não fica cortado
        ref={(el) => {
          if (!el) return;
          el.style.height = 'auto';
          el.style.height = `${el.scrollHeight}px`;
        }}
        className="title-input"
        rows={1}
        value={task.title}
        placeholder={isEvent ? 'Nome do compromisso' : 'O que precisa ser feito?'}
        autoFocus={isNew && !task.title}
        data-autofocus={isNew && !task.title ? '' : undefined}
        onChange={(e) => upd({ title: e.target.value.replace(/\n/g, '') })}
        aria-label="Título"
      />

      {series && !editing && (
        <p className="xs faint row" style={{ gap: 6, marginTop: 2 }}>
          <Icon name="repeat" size={12} />
          Você está vendo {occLabel.toLowerCase()}
        </p>
      )}
      {original.seriesId && <p className="xs faint" style={{ marginTop: 2 }}>Data alterada à parte de uma série que se repete.</p>}

      {hint}

      {/* Captura nova: o tipo muda os campos, então vem primeiro */}
      {inbox && (
        <div style={{ marginTop: 12 }}>
          <Segmented<Kind>
            label="Tipo"
            value={task.kind}
            onChange={setKind}
            options={[
              { value: 'task', label: 'Tarefa' },
              { value: 'event', label: 'Compromisso' },
              { value: 'habit', label: 'Hábito' },
            ]}
          />
        </div>
      )}

      <div className="props" style={{ marginTop: 12 }}>
        <Section
          icon="calendar"
          label={task.recurrence ? 'Horário' : 'Quando'}
          value={whenValue}
          placeholder={task.recurrence ? 'Sem horário' : inbox ? 'Escolher' : 'Sem data'}
          tone={overdue ? 'warn' : undefined}
          note={overdue ? 'atrasada' : undefined}
          open={open === 'when'}
          onToggle={() => toggle('when')}
        >
          {inbox && !task.recurrence && task.title.trim().length > 2 && (
            <Suggestion task={task} onAccept={(patch, noDate) => { setSomeday(noDate); upd(patch); }} />
          )}
          {!task.recurrence && (
            <>
              <div className="chips">
                {quickDates.map((q) => (
                  <button key={q.label} className={`chip${task.date === q.value ? ' on' : ''}`} aria-pressed={task.date === q.value} onClick={() => pickDate(q.value)}>
                    {q.label}
                  </button>
                ))}
                {inbox ? (
                  <button className={`chip${someday ? ' on' : ''}`} aria-pressed={someday} onClick={() => { setSomeday(!someday); upd({ date: undefined, time: undefined }); }}>
                    Quando der
                  </button>
                ) : (
                  <button className={`chip${!task.date ? ' on' : ''}`} aria-pressed={!task.date} onClick={() => pickDate(undefined)}>Sem data</button>
                )}
              </div>
              <label className="prop-line">
                <span>Data</span>
                <input type="date" className="input num" value={task.date ?? ''} onChange={(e) => pickDate(e.target.value || undefined)} aria-label="Data" />
              </label>
            </>
          )}
          <div className="prop-line">
            <span>Horário</span>
            <div className="row grow" style={{ gap: 6, minWidth: 0 }}>
              <input
                type="time"
                className="input num"
               
                value={task.time ?? ''}
                onChange={(e) => upd({ time: e.target.value || undefined, ...(task.recurrence ? {} : { date: task.date ?? today }) })}
                aria-label="Horário de início"
              />
              {task.time && (
                <>
                  <span className="small muted">até</span>
                  <input
                    type="time"
                    className="input num"
                   
                    value={endTime}
                    onChange={(e) => {
                      if (!e.target.value || !task.time) return;
                      const diff = timeToMin(e.target.value) - timeToMin(task.time);
                      if (diff > 0) upd({ duration: diff });
                    }}
                    aria-label="Horário de término"
                  />
                  <button className="icon-btn sm" onClick={() => upd({ time: undefined })} aria-label="Tirar o horário" title="Tirar o horário">
                    <Icon name="x" size={16} />
                  </button>
                </>
              )}
            </div>
          </div>
          <div className="prop-line top">
            <span>{isEvent ? 'Duração' : 'Leva'}</span>
            <div className="chips">
              {DURATIONS.map((m) => (
                <button key={m} className={`chip num${task.duration === m ? ' on' : ''}`} aria-pressed={task.duration === m} onClick={() => upd({ duration: m })}>
                  {formatDuration(m)}
                </button>
              ))}
              <span className="row small muted" style={{ gap: 6 }}>
                <NumberField label="Duração em minutos" value={task.duration} onChange={(v) => upd({ duration: v || undefined })} width={64} />
                min
              </span>
            </div>
          </div>
        </Section>

        <Section
          icon="repeat"
          label="Repetir"
          value={task.recurrence ? (ruleError ? 'Incompleto' : recurrenceLabel(task.recurrence)) : ''}
          placeholder="Não repete"
          tone={ruleError ? 'warn' : undefined}
          open={open === 'repeat'}
          onToggle={() => toggle('repeat')}
        >
          <RecurrenceEditor value={task.recurrence} onChange={setRecurrence} defaultAnchor={series ? occurrence : task.date ?? today} />
        </Section>

        {!isEvent && (
          <Section
            icon="flag"
            label="Prioridade"
            value={task.priority ? <span className={`prio ${task.priority}`}><span className="prio-dot" />{PRIORITY_META[task.priority].label}</span> : ''}
            placeholder="Definir"
            open={open === 'priority'}
            onToggle={() => toggle('priority')}
          >
            <div className="chips">
              {(['essential', 'important', 'optional'] as Priority[]).map((p) => (
                <button
                  key={p}
                  className={`chip${task.priority === p ? ' on' : ''}`}
                  aria-pressed={task.priority === p}
                  onClick={() => { upd({ priority: task.priority === p ? undefined : p }); setOpen(undefined); }}
                >
                  <span className={`prio ${p}`}><span className="prio-dot" /></span>
                  {PRIORITY_META[p].label}
                </button>
              ))}
            </div>
          </Section>
        )}
      </div>

      {!isEvent && (
        <div className="steps-block">
          <div className="row" style={{ justifyContent: 'space-between', minHeight: 32 }}>
            <span className="label">
              Passos{task.subtasks.length > 0 && <span className="num"> · {subDone}/{task.subtasks.length}</span>}
            </span>
            {task.subtasks.length === 0 && task.title.trim() && (
              <button className="btn btn-sm btn-soft" onClick={() => addSubtasks(assistant.breakdown(task))}>
                <Icon name="sparkles" size={14} />
                Sugerir passos
              </button>
            )}
          </div>
          {task.subtasks.length > 0 && <ProgressBar value={subDone / task.subtasks.length} label="Passos concluídos" />}
          <SubtaskList
            subtasks={task.subtasks}
            onChange={(subtasks) => upd({ subtasks })}
            // Fazer não é editar: fora de um rascunho, marcar um passo vale na hora
            onToggle={!editing ? (sid) => actions.toggleSubtask(task.id, sid) : undefined}
          />
          <form
            className="subtask"
            onSubmit={(e) => {
              e.preventDefault();
              if (newSub.trim()) addSubtasks([newSub.trim()]);
              setNewSub('');
            }}
          >
            <Icon name="plus" size={18} className="faint" />
            <input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder={task.subtasks.length ? 'Adicionar passo' : 'Qual é o primeiro passo?'} aria-label="Novo passo" enterKeyHint="done" />
            {newSub.trim() && (
              <button type="submit" className="btn btn-sm btn-soft">Adicionar</button>
            )}
          </form>
        </div>
      )}

      <div className="props">
        <Section
          icon="folder"
          label="Projeto"
          value={project ? `${project.emoji} ${project.name}` : ''}
          placeholder="Nenhum"
          open={open === 'project'}
          onToggle={() => toggle('project')}
        >
          <div className="chips">
            <button className={`chip${!task.projectId ? ' on' : ''}`} aria-pressed={!task.projectId} onClick={() => { upd({ projectId: undefined }); setOpen(undefined); }}>
              Nenhum
            </button>
            {projects.filter((p) => !p.archived || p.id === task.projectId).map((p) => (
              <button key={p.id} className={`chip${task.projectId === p.id ? ' on' : ''}`} aria-pressed={task.projectId === p.id} onClick={() => { upd({ projectId: p.id }); setOpen(undefined); }}>
                {p.emoji} {p.name}
              </button>
            ))}
          </div>
          {projects.length === 0 && <p className="xs faint">Você ainda não tem projetos. Crie um na aba Projetos.</p>}
        </Section>

        {task.kind === 'task' && (
          <Section
            icon="hourglass"
            label="Prazo"
            value={task.due ? formatDay(task.due, today) : ''}
            placeholder="Sem prazo"
            tone={task.due && task.due < today && !isDone ? 'warn' : undefined}
            open={open === 'due'}
            onToggle={() => toggle('due')}
          >
            <p className="xs faint">Data-limite para entregar. É diferente do dia em que você planeja fazer.</p>
            <div className="row" style={{ gap: 8 }}>
              <input type="date" className="input num grow" value={task.due ?? ''} onChange={(e) => upd({ due: e.target.value || undefined })} aria-label="Prazo" />
              {task.due && (
                <button className="btn btn-sm btn-ghost" onClick={() => upd({ due: undefined })}>Tirar prazo</button>
              )}
            </div>
          </Section>
        )}

        <Section
          icon="note"
          label="Notas"
          value={task.notes?.trim().split('\n')[0] ?? ''}
          placeholder="Adicionar"
          open={open === 'notes'}
          onToggle={() => toggle('notes')}
        >
          <textarea className="input" rows={4} autoFocus value={task.notes ?? ''} placeholder="Detalhes, links, ideias…" onChange={(e) => upd({ notes: e.target.value })} aria-label="Notas" />
        </Section>

        {!inbox && (
          <Section icon="list" label="Tipo" value={KIND_LABEL[task.kind]} open={open === 'kind'} onToggle={() => toggle('kind')}>
            <Segmented<Kind>
              label="Tipo"
              value={task.kind}
              onChange={setKind}
              options={[
                { value: 'task', label: 'Tarefa' },
                { value: 'event', label: 'Compromisso' },
                { value: 'habit', label: 'Hábito' },
              ]}
            />
          </Section>
        )}
      </div>

      {(task.focusMinutes ?? 0) > 0 && (
        <p className="xs faint" style={{ marginTop: 12 }}>
          <Icon name="target" size={12} /> {formatDuration(task.focusMinutes)} de foco nesta tarefa até agora.
        </p>
      )}
    </BottomSheet>
  );
}

/** Uma linha do resumo: rótulo à esquerda, valor atual à direita; tocar abre o ajuste logo abaixo. */
function Section({ icon, label, value, placeholder, note, tone, open, onToggle, children }: {
  icon: IconName;
  label: string;
  value: ReactNode;
  placeholder?: string;
  /** complemento curto ao lado do valor (ex.: “atrasada”) */
  note?: string;
  tone?: 'warn';
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className={`prop${open ? ' open' : ''}`}>
      <button type="button" className="prop-head" aria-expanded={open} onClick={onToggle}>
        <Icon name={icon} size={18} className="prop-icon" />
        <span className="prop-label">{label}</span>
        <span className={`prop-value${value ? '' : ' placeholder'}${tone ? ' warn' : ''}`}>
          {value || placeholder}
          {note && ` · ${note}`}
        </span>
        <Icon name="chevron-down" size={16} className="prop-chevron" />
      </button>
      {open && <div className="prop-body">{children}</div>}
    </div>
  );
}

function Hint({ icon, text, children }: { icon: IconName; text: ReactNode; children?: ReactNode }) {
  return (
    <div className="task-hint">
      <Icon name={icon} size={16} />
      <span className="grow">{text}</span>
      {children}
    </div>
  );
}

/** Sugestão do assistente para uma captura: uma linha, um toque para aceitar. */
function Suggestion({ task, onAccept }: { task: Task; onAccept: (patch: Partial<Task>, noDate: boolean) => void }) {
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const sug = assistant.suggest(task, tasks, settings);
  const used = task.date === sug.date && task.duration === sug.duration && task.priority === sug.priority;
  if (used) return null;
  return (
    <div className="task-hint accent">
      <Icon name="sparkles" size={16} />
      <span className="grow">
        Sugestão: <b>{sug.date ? formatDay(sug.date).toLowerCase() : 'quando der'}</b> · {formatDuration(sug.duration)} · {PRIORITY_META[sug.priority].label}
        <span className="faint" style={{ display: 'block' }}>{sug.reason}</span>
      </span>
      <button className="btn btn-sm btn-soft" onClick={() => onAccept({ date: sug.date, time: sug.time ?? task.time, priority: sug.priority, duration: sug.duration }, !sug.date)}>
        Usar
      </button>
    </div>
  );
}
