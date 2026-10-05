import { useState } from 'react';
import type { Kind, Priority, Recurrence, Subtask, Task } from '../domain/types';
import { addDays, formatDay, formatDuration, todayISO, weekdayOf, WEEKDAYS_SHORT } from '../domain/dates';
import { PRIORITY_META } from '../domain/priority';
import { assistant } from '../services/assistant';
import type { Suggestion } from '../domain/organize';
import { actions, uid, useStore } from '../store/store';
import { closeSheet, openSheet, toast } from '../store/ui';
import { BottomSheet } from '../components/BottomSheet';
import { Checkbox, Segmented } from '../components/ui';
import { Icon } from '../components/Icon';
import { completeWithFeedback, removeWithFeedback } from '../components/feedback';
import { startTask } from '../components/focusFlow';

type RepeatMode = 'none' | 'daily' | 'weekdays' | 'weekly' | 'monthly' | 'interval';

function repeatMode(r?: Recurrence): RepeatMode {
  if (!r) return 'none';
  if (r.freq === 'weekly' && [...(r.weekdays ?? [])].sort().join() === '1,2,3,4,5') return 'weekdays';
  return r.freq;
}

export function TaskSheet({ id, date }: { id: string; date?: string }) {
  const live = useStore((s) => s.tasks.find((t) => t.id === id));
  const projects = useStore((s) => s.projects);
  const [newSub, setNewSub] = useState('');
  // Toda edição é um rascunho: nada muda até tocar em “Salvar alterações”.
  const [original, setOriginal] = useState(live);
  const [draft, setDraft] = useState(live);
  const dirty = draft !== original;
  // Sem alterações pendentes, acompanha a versão salva (ex.: concluída, sincronizada)
  if (!dirty && live && live !== original) {
    setOriginal(live);
    setDraft(live);
  }
  const task = dirty ? draft : live;
  if (!task) return null;

  const inbox = original?.status === 'inbox';
  const editing = inbox || dirty;
  const today = todayISO();
  const occurrence = date ?? task.date ?? today;
  const isDone = task.recurrence ? !!task.doneDates?.includes(occurrence) : task.status === 'done';

  const upd = (patch: Partial<Task>) => {
    setDraft({ ...task, ...patch });
  };
  const setSubtasks = (fn: (subs: Subtask[]) => Subtask[]) => upd({ subtasks: fn(task.subtasks) });
  const addSubtasks = (titles: string[]) =>
    setSubtasks((subs) => [...subs, ...titles.filter(Boolean).map((title) => ({ id: uid(), title, done: false }))]);

  const confirmDiscard = () => !dirty || confirm('Descartar as alterações que você não salvou?');
  const saveDraft = () => {
    if (!draft) return;
    closeSheet();
    if (!inbox) {
      actions.saveTask(task.id, draft);
      toast('Alterações salvas', { label: 'Desfazer', run: () => actions.undo() });
      return;
    }
    actions.organize(task.id, draft);
    const where = draft.recurrence
      ? 'recorrência criada'
      : draft.date
        ? `planejada para ${formatDay(draft.date).toLowerCase()}${draft.time ? ` às ${draft.time}` : ''}`
        : 'movida para “Quando der”';
    toast(`Alterações salvas · ${where}`, { label: 'Desfazer', run: () => actions.undo() });
  };

  const setRepeat = (mode: RepeatMode) => {
    const anchor = task.date ?? today;
    const map: Record<RepeatMode, Recurrence | undefined> = {
      none: undefined,
      daily: { freq: 'daily', anchor },
      weekdays: { freq: 'weekly', weekdays: [1, 2, 3, 4, 5], anchor },
      weekly: { freq: 'weekly', weekdays: [weekdayOf(anchor)], anchor },
      monthly: { freq: 'monthly', monthDay: Number(anchor.slice(8)), anchor },
      interval: { freq: 'interval', interval: 15, anchor },
    };
    const r = map[mode];
    upd({ recurrence: r, date: r ? undefined : task.recurrence ? task.recurrence.anchor : task.date });
  };

  const quickDates: { label: string; value?: string }[] = [
    { label: 'Hoje', value: today },
    { label: 'Amanhã', value: addDays(today, 1) },
    { label: 'Sábado', value: addDays(today, (6 - weekdayOf(today) + 7) % 7 || 7) },
    { label: 'Próx. semana', value: addDays(today, ((8 - weekdayOf(today)) % 7) || 7) },
    { label: 'Sem data', value: undefined },
  ];

  const mode = repeatMode(task.recurrence);

  return (
    <BottomSheet
      label={task.title}
      onClose={closeSheet}
      canClose={confirmDiscard}
      full
      title={
        <span className="row xs faint" style={{ fontWeight: 600 }}>
          {task.status === 'inbox' ? 'Inbox' : task.kind === 'event' ? 'Compromisso' : task.kind === 'habit' ? 'Hábito' : 'Tarefa'}
        </span>
      }
      headerExtra={
        <button
          className="icon-btn sm btn-danger"
          onClick={() => {
            if (!confirm(`Excluir “${task.title}”?`)) return;
            closeSheet();
            removeWithFeedback(task.id);
          }}
          aria-label="Excluir tarefa"
          title="Excluir"
        >
          <Icon name="trash" size={18} />
        </button>
      }
      footer={
        editing ? (
          <>
            <button className="btn btn-secondary" onClick={() => { if (confirmDiscard()) closeSheet(); }}>
              Cancelar
            </button>
            <button className="btn btn-primary grow" onClick={saveDraft}>
              <Icon name="check" size={18} />
              Salvar alterações
            </button>
          </>
        ) : isDone ? (
          <button className="btn btn-secondary grow" onClick={() => actions.reopen(task.id, occurrence)}>
            <Icon name="undo" size={18} />
            Reabrir
          </button>
        ) : (
          <>
            <button className={`btn btn-secondary${task.kind === 'event' ? ' grow' : ''}`} onClick={() => openSheet({ type: 'replan', id: task.id, date: occurrence }, { stack: true })}>
              <Icon name="calendar-arrow" size={18} />
              {task.kind === 'event' ? 'Remarcar' : 'Adiar'}
            </button>
            {task.kind !== 'event' && (
              <>
                <button className="btn btn-secondary" onClick={() => { closeSheet(); completeWithFeedback(task.id, occurrence); }}>
                  <Icon name="check" size={18} />
                  Concluir
                </button>
                <button className="btn btn-primary grow" onClick={() => { closeSheet(); startTask(task.id, occurrence); }}>
                  <Icon name="play" size={16} fill />
                  Começar
                </button>
              </>
            )}
          </>
        )
      }
    >
      <textarea
        className="title-input"
        rows={1}
        value={task.title}
        onChange={(e) => upd({ title: e.target.value.replace(/\n/g, '') })}
        aria-label="Título"
      />

      {inbox && (
        <InboxBanner task={task} onAccept={(sug) => upd({ date: sug.date, time: sug.time ?? task.time, priority: sug.priority, duration: sug.duration })} />
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

        {task.kind !== 'event' && (
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
                <button key={q.label} className={`chip${task.date === q.value ? ' on' : ''}`} onClick={() => upd({ date: q.value, ...(q.value ? {} : { time: undefined }) })}>
                  {q.label}
                </button>
              ))}
            </div>
            <div className="row" style={{ marginTop: 4 }}>
              <input type="date" className="input num grow" value={task.date ?? ''} onChange={(e) => upd({ date: e.target.value || undefined })} aria-label="Data" />
              <input type="time" className="input num" style={{ width: 130 }} value={task.time ?? ''} onChange={(e) => upd({ time: e.target.value || undefined, date: task.date ?? today })} aria-label="Horário" />
            </div>
            {task.date && <span className="xs faint">{formatDay(task.date, today, { long: true })}{task.time ? ` às ${task.time}` : ' · sem horário'}</span>}
          </div>
        )}

        <div className="field">
          <span className="label">Duração</span>
          <div className="chips">
            {[10, 15, 30, 45, 60, 90, 120].map((m) => (
              <button key={m} className={`chip num${task.duration === m ? ' on' : ''}`} onClick={() => upd({ duration: m })}>
                {formatDuration(m)}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label className="label" htmlFor="repeat">Repetir</label>
          <select id="repeat" className="input" value={mode} onChange={(e) => setRepeat(e.target.value as RepeatMode)}>
            <option value="none">Não repete</option>
            <option value="daily">Todo dia</option>
            <option value="weekdays">Dias úteis</option>
            <option value="weekly">Dias da semana…</option>
            <option value="monthly">Todo mês</option>
            <option value="interval">A cada N dias</option>
          </select>
          {task.recurrence?.freq === 'weekly' && mode === 'weekly' && (
            <div className="chips" role="group" aria-label="Dias da semana">
              {[1, 2, 3, 4, 5, 6, 0].map((d) => {
                const on = task.recurrence!.weekdays?.includes(d);
                return (
                  <button
                    key={d}
                    className={`chip${on ? ' on' : ''}`}
                    aria-pressed={on}
                    onClick={() => {
                      const cur = task.recurrence!.weekdays ?? [];
                      const next = on ? cur.filter((x) => x !== d) : [...cur, d];
                      if (next.length) upd({ recurrence: { ...task.recurrence!, weekdays: next } });
                    }}
                  >
                    {WEEKDAYS_SHORT[d]}
                  </button>
                );
              })}
            </div>
          )}
          {task.recurrence?.freq === 'monthly' && (
            <label className="row small muted">
              Dia
              <input type="number" min={1} max={31} className="input num" style={{ width: 90 }} value={task.recurrence.monthDay ?? 1}
                onChange={(e) => upd({ recurrence: { ...task.recurrence!, monthDay: Math.min(31, Math.max(1, +e.target.value || 1)) } })} />
              de cada mês
            </label>
          )}
          {task.recurrence?.freq === 'interval' && (
            <label className="row small muted">
              A cada
              <input type="number" min={2} max={365} className="input num" style={{ width: 90 }} value={task.recurrence.interval ?? 15}
                onChange={(e) => upd({ recurrence: { ...task.recurrence!, interval: Math.max(1, +e.target.value || 1) } })} />
              dias
            </label>
          )}
          {task.recurrence && (
            <input type="time" className="input num" style={{ width: 150 }} value={task.time ?? ''} onChange={(e) => upd({ time: e.target.value || undefined })} aria-label="Horário" />
          )}
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
          {task.kind !== 'event' && (
            <div className="field grow">
              <label className="label" htmlFor="due">Prazo</label>
              <input id="due" type="date" className="input num" value={task.due ?? ''} onChange={(e) => upd({ due: e.target.value || undefined })} />
            </div>
          )}
        </div>

        {task.kind !== 'event' && (
          <div className="field">
            <div className="row" style={{ justifyContent: 'space-between' }}>
              <span className="label">Passos</span>
              {task.subtasks.length === 0 && (
                <button className="btn btn-sm btn-soft" onClick={() => addSubtasks(assistant.breakdown(task))}>
                  <Icon name="sparkles" size={14} />
                  Sugerir passos
                </button>
              )}
            </div>
            <div>
              {task.subtasks.map((s) => (
                <div key={s.id} className={`subtask${s.done ? ' done' : ''}`}>
                  <Checkbox checked={s.done} onToggle={() => setSubtasks((subs) => subs.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))} label={`Concluir passo: ${s.title}`} />
                  <input value={s.title} onChange={(e) => setSubtasks((subs) => subs.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)))} aria-label="Passo" />
                  <button className="icon-btn sm" onClick={() => setSubtasks((subs) => subs.filter((x) => x.id !== s.id))} aria-label={`Remover ${s.title}`}>
                    <Icon name="x" size={16} />
                  </button>
                </div>
              ))}
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
            </div>
          </div>
        )}

        <div className="field">
          <label className="label" htmlFor="notes">Notas</label>
          <textarea id="notes" className="input" rows={3} value={task.notes ?? ''} placeholder="Detalhes, links, ideias…" onChange={(e) => upd({ notes: e.target.value })} />
        </div>

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
