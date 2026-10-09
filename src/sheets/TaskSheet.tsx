import { useState } from 'react';
import type { Kind, Priority, Recurrence, Task } from '../domain/types';
import { addDays, formatDay, formatDuration, minToTime, nowMin, timeToMin, todayISO, weekdayOf } from '../domain/dates';
import { PRIORITY_META } from '../domain/priority';
import { occursOn, recurrenceError, recurrenceLabel } from '../domain/recurrence';
import { assistant } from '../services/assistant';
import type { Suggestion } from '../domain/organize';
import { actions, uid, useStore, type SeriesScope } from '../store/store';
import { closeSheet, openSheet, toast } from '../store/ui';
import { BottomSheet } from '../components/BottomSheet';
import { NumberField, Option, Segmented } from '../components/ui';
import { Icon } from '../components/Icon';
import { RecurrenceEditor } from '../components/RecurrenceEditor';
import { SubtaskList } from '../components/SubtaskList';
import { completeWithFeedback, removeWithFeedback } from '../components/feedback';
import { startTask } from '../components/focusFlow';

const DURATIONS = [15, 30, 45, 60, 90, 120];

/**
 * Detalhes de uma tarefa. Toda edição é um rascunho: nada muda até tocar em “Salvar”.
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

  const upd = (patch: Partial<Task>) => setDraft({ ...task, ...patch });
  const addSubtasks = (titles: string[]) =>
    upd({ subtasks: [...task.subtasks, ...titles.filter(Boolean).map((title) => ({ id: uid(), title, done: false }))] });

  const error = !task.title.trim() ? 'Dê um nome para a tarefa.' : recurrenceError(task.recurrence);
  const confirmDiscard = () => {
    if (isNew) return !task.title.trim() || confirm('Descartar esta tarefa? Ela ainda não foi salva.');
    return !dirty || confirm('Descartar as alterações que você não salvou?');
  };

  /** Inbox: só sai de lá quando ganha um lugar (dia, repetição, projeto ou “Quando der”). */
  const placed = !!(task.date || task.recurrence || task.projectId || someday);
  const whereLabel = (t: Task) =>
    t.recurrence
      ? 'recorrência criada'
      : t.date
        ? `${t.kind === 'event' ? 'marcado' : 'planejada'} para ${formatDay(t.date).toLowerCase()}${t.time ? ` às ${t.time}` : ''}`
        : placed
          ? t.projectId && !someday ? 'no projeto' : 'em “Tarefas › Quando der”'
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

  const quickDates: { label: string; value?: string }[] = [
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

  /* ---------- Rodapé ---------- */
  let footer: React.ReactNode;
  if (editing) {
    footer = (
      <>
        <button className="btn btn-secondary" onClick={() => { if (confirmDiscard()) closeSheet(); }}>
          Cancelar
        </button>
        <button className="btn btn-primary grow" onClick={() => save()} disabled={!!error || (isNew ? false : !dirty && !inbox)}>
          <Icon name="check" size={18} />
          {isNew ? 'Salvar tarefa' : 'Salvar alterações'}
        </button>
      </>
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
          <button className="btn btn-primary" onClick={() => openSheet({ type: 'replan', id: task.id, date: occurrence }, { stack: true })}>
            <Icon name="calendar-arrow" size={18} />
            Remarcar
          </button>
        )}
      </>
    ) : (
      <>
        <button className={`btn btn-secondary${started ? '' : ' grow'}`} onClick={() => openSheet({ type: 'replan', id: task.id, date: occurrence }, { stack: true })}>
          <Icon name="calendar-arrow" size={18} />
          Remarcar
        </button>
        {started && (
          <>
            <button className="btn btn-secondary" onClick={() => openSheet({ type: 'eventMissed', id: task.id, date: occurrence }, { stack: true })}>
              <Icon name="x" size={18} />
              Não aconteceu
            </button>
            <button
              className="btn btn-primary grow"
              onClick={() => {
                closeSheet();
                actions.markEvent(task.id, occurrence, 'held');
                toast('Marcado como realizado', { label: 'Desfazer', run: () => actions.undo() });
              }}
            >
              <Icon name="check" size={18} />
              Aconteceu
            </button>
          </>
        )}
      </>
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
      <>
        <button className="btn btn-secondary" onClick={() => openSheet({ type: 'replan', id: task.id, date: occurrence }, { stack: true })}>
          <Icon name="calendar-arrow" size={18} />
          Adiar
        </button>
        <button className="btn btn-secondary" onClick={() => { closeSheet(); completeWithFeedback(task.id, occurrence); }}>
          <Icon name="check" size={18} />
          Concluir
        </button>
        <button className="btn btn-primary grow" onClick={() => { closeSheet(); startTask(task.id, occurrence); }}>
          <Icon name="play" size={16} fill />
          Começar
        </button>
      </>
    );
  }

  const timeRange = (
    <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
      <label className="row small muted" style={{ gap: 6 }}>
        Das
        <input
          type="time"
          className="input num"
          style={{ width: 120 }}
          value={task.time ?? ''}
          onChange={(e) => upd({ time: e.target.value || undefined, ...(task.recurrence ? {} : { date: task.date ?? today }) })}
          aria-label="Horário de início"
        />
      </label>
      {task.time && (
        <label className="row small muted" style={{ gap: 6 }}>
          até
          <input
            type="time"
            className="input num"
            style={{ width: 120 }}
            value={minToTime(timeToMin(task.time) + (task.duration ?? 30))}
            onChange={(e) => {
              if (!e.target.value || !task.time) return;
              const diff = timeToMin(e.target.value) - timeToMin(task.time);
              if (diff > 0) upd({ duration: diff });
            }}
            aria-label="Horário de término"
          />
        </label>
      )}
    </div>
  );

  return (
    <BottomSheet
      key="task"
      label={task.title || 'Nova tarefa'}
      onClose={closeSheet}
      canClose={confirmDiscard}
      full
      title={
        <span className="row xs faint" style={{ fontWeight: 600 }}>
          {isNew ? (isEvent ? 'Novo compromisso' : 'Nova tarefa') : inbox ? 'Inbox' : isEvent ? 'Compromisso' : task.kind === 'habit' ? 'Hábito' : 'Tarefa'}
        </span>
      }
      headerExtra={
        !isNew && (
          <button className="icon-btn sm btn-danger" onClick={() => remove()} aria-label="Excluir tarefa" title="Excluir">
            <Icon name="trash" size={18} />
          </button>
        )
      }
      footer={footer}
    >
      <textarea
        className="title-input"
        rows={1}
        value={task.title}
        placeholder="Nome da tarefa"
        autoFocus={isNew && !task.title}
        data-autofocus={isNew && !task.title ? '' : undefined}
        onChange={(e) => upd({ title: e.target.value.replace(/\n/g, '') })}
        aria-label="Título"
      />

      {series && !editing && (
        <p className="xs faint row" style={{ gap: 6, marginTop: 4 }}>
          <Icon name="repeat" size={12} />
          {recurrenceLabel(series)} · você está vendo {occLabel.toLowerCase()}
        </p>
      )}
      {original.seriesId && (
        <p className="xs faint" style={{ marginTop: 4 }}>Ocorrência alterada à parte de uma série que se repete.</p>
      )}

      {inbox && task.title.trim().length > 2 && (
        <InboxBanner task={task} onAccept={(sug) => { setSomeday(!sug.date); upd({ date: sug.date, time: sug.time ?? task.time, priority: sug.priority, duration: sug.duration }); }} />
      )}

      <div className="stack" style={{ gap: 20, marginTop: 16 }}>
        <Segmented<Kind>
          label="Tipo"
          value={task.kind}
          onChange={(kind) => upd({ kind })}
          options={[
            { value: 'task', label: 'Tarefa' },
            { value: 'event', label: 'Compromisso' },
            { value: 'habit', label: 'Hábito' },
          ]}
        />

        {!isEvent && (
          <div className="field">
            <span className="label">Prioridade</span>
            <div className="chips">
              {(['essential', 'important', 'optional'] as Priority[]).map((p) => (
                <button key={p} className={`chip${task.priority === p ? ' on' : ''}`} aria-pressed={task.priority === p} onClick={() => upd({ priority: task.priority === p ? undefined : p })}>
                  <span className={`prio ${p}`}><span className="prio-dot" /></span>
                  {PRIORITY_META[p].label}
                </button>
              ))}
            </div>
          </div>
        )}

        {!task.recurrence && (
          <div className="field">
            <span className="label">Quando</span>
            <div className="chips">
              {quickDates.map((q) => (
                <button key={q.label} className={`chip${task.date === q.value ? ' on' : ''}`} onClick={() => pickDate(q.value)}>
                  {q.label}
                </button>
              ))}
              {inbox ? (
                <button
                  className={`chip${someday ? ' on' : ''}`}
                  aria-pressed={someday}
                  onClick={() => { setSomeday(!someday); upd({ date: undefined, time: undefined }); }}
                >
                  Quando der
                </button>
              ) : (
                <button className={`chip${!task.date ? ' on' : ''}`} onClick={() => pickDate(undefined)}>Sem data</button>
              )}
            </div>
            <input type="date" className="input num" style={{ marginTop: 4 }} value={task.date ?? ''} onChange={(e) => pickDate(e.target.value || undefined)} aria-label="Data" />
            {timeRange}
            {task.date ? (
              <span className="xs faint">
                {formatDay(task.date, today, { long: true })}
                {task.time ? ` · ${task.time}–${minToTime(timeToMin(task.time) + (task.duration ?? 30))}` : ' · sem horário'}
              </span>
            ) : inbox ? (
              <span className="xs faint">
                {someday
                  ? 'Vai para “Tarefas › Quando der”, sem data.'
                  : placed
                    ? 'Sai do Inbox ao salvar.'
                    : 'Sem data definida, continua no Inbox até você escolher quando.'}
              </span>
            ) : null}
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor="repeat">Repetir</label>
          <RecurrenceEditor value={task.recurrence} onChange={setRecurrence} defaultAnchor={series ? occurrence : task.date ?? today} />
          {task.recurrence && timeRange}
        </div>

        <div className="field">
          <span className="label">Duração</span>
          <div className="chips">
            {DURATIONS.map((m) => (
              <button key={m} className={`chip num${task.duration === m ? ' on' : ''}`} onClick={() => upd({ duration: m })}>
                {formatDuration(m)}
              </button>
            ))}
            <span className="row small muted" style={{ gap: 6 }}>
              <NumberField label="Duração em minutos" value={task.duration} onChange={(v) => upd({ duration: v || undefined })} width={70} />
              min
            </span>
          </div>
        </div>

        <div className="row" style={{ gap: 12, alignItems: 'flex-start' }}>
          <div className="field grow">
            <label className="label" htmlFor="project">Projeto</label>
            <select id="project" className="input" value={task.projectId ?? ''} onChange={(e) => upd({ projectId: e.target.value || undefined })}>
              <option value="">Nenhum</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>
              ))}
            </select>
          </div>
          {!isEvent && (
            <div className="field grow">
              <label className="label" htmlFor="due">Prazo</label>
              <input id="due" type="date" className="input num" value={task.due ?? ''} onChange={(e) => upd({ due: e.target.value || undefined })} />
            </div>
          )}
        </div>

        {!isEvent && (
          <div className="field">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="label">Passos</span>
              {task.subtasks.length === 0 && task.title.trim() && (
                <button className="btn btn-sm btn-soft" onClick={() => addSubtasks(assistant.breakdown(task))}>
                  <Icon name="sparkles" size={14} />
                  Sugerir passos
                </button>
              )}
            </div>
            <div>
              <SubtaskList subtasks={task.subtasks} onChange={(subtasks) => upd({ subtasks })} />
              <form
                className="subtask"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (newSub.trim()) addSubtasks([newSub.trim()]);
                  setNewSub('');
                }}
              >
                <Icon name="plus" size={18} className="faint" />
                <input value={newSub} onChange={(e) => setNewSub(e.target.value)} placeholder="Adicionar passo" aria-label="Novo passo" />
              </form>
              {task.subtasks.length > 1 && <p className="xs faint">Arraste pela alça <Icon name="grip" size={12} stroke={2.6} /> para mudar a ordem.</p>}
            </div>
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor="notes">Notas</label>
          <textarea id="notes" className="input" rows={3} value={task.notes ?? ''} placeholder="Detalhes, links, ideias…" onChange={(e) => upd({ notes: e.target.value })} />
        </div>

        {error && editing && task.title.trim() && (
          <p className="small" role="alert" style={{ color: 'var(--red)' }}>{error}</p>
        )}

        {(task.focusMinutes ?? 0) > 0 && (
          <p className="xs faint">{formatDuration(task.focusMinutes)} em foco nesta tarefa.</p>
        )}
      </div>
    </BottomSheet>
  );
}

function InboxBanner({ task, onAccept }: { task: Task; onAccept: (sug: Suggestion) => void }) {
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const sug = assistant.suggest(task, tasks, settings);
  return (
    <div className="nudge" style={{ marginTop: 12, boxShadow: 'none', background: 'var(--accent-soft)' }}>
      <span className="nudge-icon"><Icon name="sparkles" size={18} /></span>
      <div className="grow">
        <p className="nudge-text">
          Sugestão: <b>{sug.date ? formatDay(sug.date).toLowerCase() : 'quando der'}</b> · {formatDuration(sug.duration)} · {PRIORITY_META[sug.priority].label}
          <span className="faint" style={{ display: 'block' }}>{sug.reason}</span>
        </p>
        <div className="nudge-actions">
          <button className="btn btn-sm btn-soft" onClick={() => onAccept(sug)}>Usar sugestão</button>
        </div>
      </div>
    </div>
  );
}
