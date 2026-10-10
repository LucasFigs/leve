import { useMemo, useState } from 'react';
import type { Priority, Task } from '../domain/types';
import { addDays, formatDay, formatDuration, todayISO, weekdayOf } from '../domain/dates';
import { inboxTasks, unscheduledTasks } from '../domain/selectors';
import { PRIORITY_META } from '../domain/priority';
import { assistant } from '../services/assistant';
import { actions, useStore } from '../store/store';
import { openSheet, toast } from '../store/ui';
import { QuickAdd } from '../components/QuickAdd';
import { TaskCard } from '../components/TaskCard';
import { Icon, type IconName } from '../components/Icon';
import { Checkbox, EmptyState, SectionHead } from '../components/ui';
import { archiveWithFeedback, completeWithFeedback, removeWithFeedback } from '../components/feedback';
import { TopActions } from './TopActions';

export function InboxScreen() {
  const tasks = useStore((s) => s.tasks);
  const inbox = useMemo(() => inboxTasks(tasks), [tasks]);
  const someday = useMemo(() => unscheduledTasks(tasks).filter((t) => !t.projectId || t.priority === 'optional'), [tasks]);
  const [showSomeday, setShowSomeday] = useState(false);

  return (
    <div className="screen">
      <div className="topbar">
        <h1 className="page-title">Inbox</h1>
        <TopActions />
      </div>
      <p className="page-sub" style={{ marginTop: -4, marginBottom: 16 }}>
        Tudo o que você jogou aqui. Eu ajudo a organizar.
      </p>

      <QuickAdd placeholder="Jogue aqui o que estiver na cabeça…" />

      <section className="section">
        {inbox.length > 0 ? (
          <>
            <SectionHead
              title={`${inbox.length} ${inbox.length === 1 ? 'captura' : 'capturas'}`}
              action={
                <button className="btn btn-sm btn-primary" onClick={() => openSheet({ type: 'review' })}>
                  <Icon name="sparkles" size={16} />
                  Organizar tudo
                </button>
              }
            />
            <div className="list">
              {inbox.map((t) => (
                <InboxItem key={t.id} task={t} />
              ))}
            </div>
          </>
        ) : (
          <EmptyState icon="✨" title="Tudo limpo" text="Quando alguma coisa surgir na sua cabeça, jogue aqui." />
        )}
      </section>

      {someday.length > 0 && (
        <section className="section">
          <button className="collapse-btn" aria-expanded={showSomeday} onClick={() => setShowSomeday((v) => !v)} style={{ marginBottom: 8 }}>
            <Icon name="chevron-right" size={16} />
            Quando der · {someday.length}
          </button>
          {showSomeday && (
            <div className="list">
              {someday.map((t) => (
                <TaskCard key={t.id} task={t} showStart />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function nextSaturday() {
  const today = todayISO();
  const wd = weekdayOf(today);
  return wd === 6 ? today : addDays(today, 6 - wd);
}

interface Draft {
  /** undefined = não escolhido; null = “Quando der” (sem data) */
  date?: string | null;
  priority?: Priority;
  duration?: number;
}

const DURATIONS = [15, 30, 60, 90];

function InboxItem({ task }: { task: Task }) {
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>({});
  const [leaving, setLeaving] = useState(false);
  const suggestion = useMemo(() => assistant.suggest(task, tasks, settings), [task, tasks, settings]);

  const today = todayISO();
  const dirty = draft.date !== undefined || draft.priority !== undefined || draft.duration !== undefined;
  const pick = (patch: Draft) => setDraft((d) => ({ ...d, ...patch }));

  const close = () => {
    if (dirty && !confirm('Descartar as alterações que você não salvou?')) return;
    setDraft({});
    setOpen(false);
  };

  // Como a tarefa fica se salvar agora
  const date = draft.date !== undefined ? draft.date ?? undefined : task.date;
  const priority = draft.priority ?? task.priority ?? suggestion.priority;
  const duration = draft.duration ?? task.duration ?? suggestion.duration;

  const save = () => {
    setLeaving(true);
    setTimeout(() => {
      actions.organize(task.id, { date, priority, duration });
      toast(`Alterações salvas · ${date ? `planejada para ${formatDay(date).toLowerCase()}` : 'movida para “Quando der”'}`, {
        label: 'Desfazer',
        run: () => actions.undo(),
      });
    }, 260);
  };

  const dates: { label: string; value: string | null }[] = [
    { label: 'Hoje', value: today },
    { label: 'Amanhã', value: addDays(today, 1) },
    { label: 'Fim de semana', value: nextSaturday() },
    { label: 'Próx. semana', value: addDays(today, ((8 - weekdayOf(today)) % 7) || 7) },
    { label: 'Quando der', value: null },
  ];
  const presetDates = new Set(dates.map((d) => d.value));
  const customDate = typeof draft.date === 'string' && !presetDates.has(draft.date) ? draft.date : '';

  const more: { icon: IconName; label: string; run: () => void; danger?: boolean }[] = [
    { icon: 'edit', label: 'Mais detalhes', run: () => openSheet({ type: 'task', id: task.id }) },
    { icon: 'split', label: 'Dividir', run: () => openSheet({ type: 'breakdown', id: task.id }) },
    { icon: 'archive', label: 'Arquivar', run: () => archiveWithFeedback(task.id) },
    { icon: 'trash', label: 'Excluir', run: () => removeWithFeedback(task.id), danger: true },
  ];

  return (
    <div className={open ? 'inbox-item open' : 'inbox-item'}>
      <div className={`task${leaving ? ' leaving' : ''}`}>
        <Checkbox
          checked={leaving}
          tone={task.priority}
          label={`Concluir: ${task.title}`}
          onToggle={() => {
            setLeaving(true);
            setTimeout(() => completeWithFeedback(task.id), 300);
          }}
        />
        <button className="task-main" onClick={() => (open ? close() : setOpen(true))} aria-expanded={open}>
          <div className="task-title">{task.title}</div>
          <div className="task-meta">
            {task.priority && <span className={`prio ${task.priority}`}>{PRIORITY_META[task.priority].label}</span>}
            <span title="Sugestão do assistente">
              <Icon name="sparkles" size={12} />
              Sugestão: {suggestion.date ? formatDay(suggestion.date).toLowerCase() : 'quando der'} · {formatDuration(suggestion.duration)}
            </span>
            {task.subtasks.length > 0 && (
              <span>
                <Icon name="list" size={12} />
                {task.subtasks.length} passos
              </span>
            )}
          </div>
        </button>
        <button className="icon-btn sm" onClick={() => openSheet({ type: 'task', id: task.id })} aria-label={`Editar ${task.title}`}>
          <Icon name="edit" size={16} />
        </button>
        <button className="icon-btn sm btn-danger" onClick={() => removeWithFeedback(task.id)} aria-label={`Excluir ${task.title}`} title="Excluir">
          <Icon name="trash" size={16} />
        </button>
      </div>

      {open && !leaving && (
        <div className="inbox-edit" role="group" aria-label={`Organizar ${task.title}`}>
          <div className="inbox-edit-field">
            <span className="label">Quando</span>
            <div className="chips">
              {suggestion.date && !presetDates.has(suggestion.date) && (
                <button className={`chip${draft.date === suggestion.date ? ' on' : ''}`} aria-pressed={draft.date === suggestion.date} onClick={() => pick({ date: suggestion.date })}>
                  <Icon name="sparkles" size={14} />
                  {formatDay(suggestion.date)}
                </button>
              )}
              {dates.map((d) => (
                <button key={d.label} className={`chip${draft.date === d.value ? ' on' : ''}`} aria-pressed={draft.date === d.value} onClick={() => pick({ date: d.value })}>
                  {d.value && d.value === suggestion.date && <Icon name="sparkles" size={14} />}
                  {d.label}
                </button>
              ))}
              <input
                type="date"
                className={`chip chip-date num${customDate ? ' on' : ''}`}
                value={customDate}
                min={today}
                onChange={(e) => pick({ date: e.target.value || undefined })}
                aria-label="Escolher outra data"
              />
            </div>
          </div>

          <div className="inbox-edit-field">
            <span className="label">Prioridade</span>
            <div className="chips">
              {(['essential', 'important', 'optional'] as Priority[]).map((p) => {
                const on = (draft.priority ?? task.priority) === p;
                return (
                  <button key={p} className={`chip${on ? ' on' : ''}`} aria-pressed={on} onClick={() => pick({ priority: p })}>
                    <span className={`prio ${p}`}>
                      <span className="prio-dot" />
                    </span>
                    {PRIORITY_META[p].label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="inbox-edit-field">
            <span className="label">Duração</span>
            <div className="chips">
              {DURATIONS.map((m) => {
                const on = (draft.duration ?? task.duration) === m;
                return (
                  <button key={m} className={`chip num${on ? ' on' : ''}`} aria-pressed={on} onClick={() => pick({ duration: m })}>
                    {formatDuration(m)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="chips">
            {more.map((a) => (
              <button key={a.label} className="chip" style={a.danger ? { color: 'var(--red)' } : undefined} onClick={a.run}>
                <Icon name={a.icon} size={14} />
                {a.label}
              </button>
            ))}
          </div>

          <div className="inbox-edit-foot">
            <p className="xs muted" aria-live="polite">
              {dirty ? (
                <>
                  Ao salvar: <b>{date ? formatDay(date) : 'Quando der'}</b> · {PRIORITY_META[priority].label} · {formatDuration(duration)}
                </>
              ) : (
                'Escolha as opções e toque em salvar.'
              )}
            </p>
            <div className="row">
              <button className="btn btn-secondary btn-sm" onClick={close}>
                Cancelar
              </button>
              <button className="btn btn-primary btn-sm grow" onClick={save} disabled={!dirty}>
                <Icon name="check" size={16} />
                Salvar alterações
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

