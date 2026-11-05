import { useId, useState, type ReactNode } from 'react';
import type { Kind, Priority, Recurrence, Task } from '../domain/types';
import { addDays, formatDay, formatDuration, minToTime, nowMin, timeToMin, todayISO } from '../domain/dates';
import { PRIORITY_META } from '../domain/priority';

import { occursOn, recurrenceError, recurrenceLabel } from '../domain/recurrence';
import { assistant } from '../services/assistant';
import { actions, uid, useStore, type SeriesScope } from '../store/store';
import { closeSheet, openSheet, toast } from '../store/ui';
import { BottomSheet } from '../components/BottomSheet';
import { Option, Segmented } from '../components/ui';
import { Icon } from '../components/Icon';
import { RecurrenceEditor } from '../components/RecurrenceEditor';
import { SubtaskList } from '../components/SubtaskList';
import { AutoGrowTextarea } from '../components/AutoGrowTextarea';
import { HabitAppearance } from '../components/HabitAppearance';
import { TaskOverview } from '../components/TaskOverview';
import { HabitCalendarSheet } from './HabitCalendarSheet';
import { CATEGORIES } from '../domain/category';
import { Disclosure } from '../components/Disclosure';
import { archiveWithFeedback, completeWithFeedback, removeWithFeedback } from '../components/feedback';
import { startTask } from '../components/focusFlow';
import { useGoogleCalendar } from '../services/googleCalendar';

const DURATIONS = [15, 30, 45, 60, 90, 120, 150, 180, 240];
const KIND_LABEL: Record<Kind, string> = { task: 'Tarefa', event: 'Compromisso', habit: 'Hábito' };

/**
 * Tarefa organizada abre em consulta/execução; edição exige ação explícita.
 * Capturas e tarefas novas abrem o formulário completo com rascunho.
 * Com `initial`, é uma tarefa nova (capturar e já detalhar) que só é criada ao salvar.
 */
export function TaskSheet({ id, date, initial, mode }: { id?: string; date?: string; initial?: Task; mode?: 'edit' }) {
  const formId = useId();
  const stored = useStore((s) => (id ? s.tasks.find((t) => t.id === id) : undefined));
  const projects = useStore((s) => s.projects);
  const defaultDuration = useStore((s) => s.settings.defaultDuration);
  const isNew = !!initial;
  const live = initial ?? stored;
  const [newSub, setNewSub] = useState('');
  const [original, setOriginal] = useState(live);
  const [draft, setDraft] = useState(live);
  const [editMode, setEditMode] = useState(mode === 'edit');
  const [customDuration, setCustomDuration] = useState(false);
  const gcalConnected = useGoogleCalendar((s) => s.connected && s.autoSync);
  /** Inbox: escolheu explicitamente “Quando der” (sem data) */
  const [someday, setSomeday] = useState(false);
  /** Pergunta “só este / este e os seguintes / todos” de uma série */
  const [ask, setAsk] = useState<'save' | 'delete'>();
  const fieldsDirty = draft !== original || someday;
  const dirty = fieldsDirty || !!newSub.trim();
  // Sem alterações pendentes, acompanha a versão salva (ex.: concluída, sincronizada)
  if (!isNew && !fieldsDirty && live && live !== original) {
    setOriginal(live);
    setDraft(live);
  }
  const task = fieldsDirty ? draft : live;
  if (!task || !original) return null;

  const inbox = isNew || original.status === 'inbox';
  const editing = inbox || editMode;
  const today = todayISO();
  const occurrence = date ?? task.date ?? today;
  const isEvent = task.kind === 'event';
  const series = original.recurrence && occursOn(original.recurrence, occurrence) ? original.recurrence : undefined;
  const missed = task.recurrence ? !!task.missedDates?.includes(occurrence) : task.status === 'done' && !!task.missed;
  const isDone = task.recurrence ? !!task.doneDates?.includes(occurrence) || missed : task.status === 'done';
  const started = occurrence < today || (occurrence === today && (!task.time || timeToMin(task.time) <= nowMin()));
  const noun = isEvent ? 'compromisso' : 'tarefa';
  const project = projects.find((p) => p.id === task.projectId);

  const upd = (patch: Partial<Task>) => { setEditMode(true); setDraft({ ...task, ...patch }); };
  const addSubtasks = (titles: string[]) =>
    upd({ subtasks: [...task.subtasks, ...titles.filter(Boolean).map((title) => ({ id: uid(), title, done: false }))] });

  const ruleError = recurrenceError(task.recurrence);
  const durationError = (customDuration && task.duration === undefined) || (task.duration !== undefined && (!Number.isInteger(task.duration) || task.duration < 1 || task.duration > 10080))
    ? 'Informe uma duração entre 1 e 10080 minutos.' : undefined;
  const error = !task.title.trim() ? `Dê um nome para ${isEvent ? 'o compromisso' : 'a tarefa'}.` : task.title.length > 1000 ? 'Use até 1000 caracteres no título.' : durationError ?? (task.kind === 'habit' && !task.recurrence && !task.seriesId ? 'Escolha uma repetição para acompanhar este hábito.' : ruleError);
  const confirmDiscard = () => {
    if (isNew) return !(dirty || task.title.trim() || task.notes?.trim() || task.subtasks.length) || confirm('Descartar esta tarefa? Ela ainda não foi salva.');
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
    if (error) return;
    const final: Task = { ...task, title: task.title.trim(), subtasks: newSub.trim() ? [...task.subtasks, { id: uid(), title: newSub.trim(), done: false }] : task.subtasks, status: inbox ? (placed ? 'active' : 'inbox') : task.status };
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
    if (kind === task.kind) return;
    if (kind === 'habit' && !task.recurrence) {
      upd({ kind, recurrence: { freq: 'daily', anchor: task.date ?? today }, date: undefined });
    } else upd({ kind });
  };

  const quickDates: { label: string; value: string }[] = [
    { label: 'Hoje', value: today },
    { label: 'Amanhã', value: addDays(today, 1) },
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
  const endTime = task.time ? minToTime(timeToMin(task.time) + (task.duration ?? defaultDuration)) : undefined;
  const overdue = !isDone && !isEvent && !task.recurrence && !!task.date && task.date < today;
  const subDone = task.subtasks.filter((s) => s.done).length;
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
          <button className="btn btn-secondary" onClick={() => {
            if (!confirmDiscard()) return;
            if (inbox || mode === 'edit') closeSheet();
            else { setEditMode(false); setOriginal(live); setDraft(live); setSomeday(false); setNewSub(''); setCustomDuration(false); }
          }}>
            Cancelar
          </button>
          <button className="btn btn-primary grow" onClick={() => save()} disabled={!!error}>
            <Icon name="check" size={18} />
            {isNew ? `Criar ${task.kind === 'habit' ? 'hábito' : noun}` : 'Salvar alterações'}
          </button>
        </div>
      </div>
    );
  } else if (task.status === 'archived') {
    footer = <button className="btn btn-secondary grow" onClick={() => { actions.update(task.id, { status: 'active' }); toast('Tarefa restaurada'); }}>Restaurar tarefa</button>;
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

  if (!editing && task.kind === 'habit') return <HabitCalendarSheet id={task.id} date={date} />;

  if (!editing) return (
    <BottomSheet key="overview" className="task-detail-sheet" label={task.title} title={KIND_LABEL[task.kind]} onClose={closeSheet}
      headerExtra={<button type="button" className="btn btn-sm btn-soft" onClick={() => { setOriginal(live); setDraft(live); setEditMode(true); }}>
        <Icon name="edit" size={16} />Editar
      </button>}
      footer={footer}>
      <TaskOverview task={task} project={project} today={today} occurrence={occurrence}
        endTime={endTime} defaultDuration={defaultDuration} isDone={isDone} missed={missed}
        onToggleStep={stepId => actions.toggleSubtask(task.id, stepId)}
        onArchive={() => { archiveWithFeedback(task.id); closeSheet(); }}
        onRemove={() => remove()} />
    </BottomSheet>
  );
  const showCustomDuration = customDuration || (task.duration !== undefined && !DURATIONS.includes(task.duration));
  const recurrenceField = <div className="field">
    <label className="task-field-label" htmlFor={`${formId}-repeat`}>Frequência</label>
    <RecurrenceEditor id={`${formId}-repeat`} value={task.recurrence} onChange={setRecurrence} defaultAnchor={series ? occurrence : task.date ?? today} />
  </div>;
  const organizationSummary = [project?.name, task.due ? `prazo ${formatDay(task.due).toLowerCase()}` : undefined, task.category ? CATEGORIES.find(cat => cat.id === task.category)?.label : undefined].filter(Boolean).join(' · ');

  return (
    <BottomSheet
      key="task"
      label={isNew ? `Criar ${KIND_LABEL[task.kind].toLowerCase()}` : `Editar ${task.title}`}
      onClose={closeSheet}
      canClose={confirmDiscard}
      title={isNew ? `Nov${task.kind === 'task' ? 'a' : 'o'} ${KIND_LABEL[task.kind].toLowerCase()}` : inbox ? 'Organizar captura' : `Editar ${KIND_LABEL[task.kind].toLowerCase()}`}
      footer={footer}
    >
      <div className="task-editor" onKeyDown={e => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && !e.nativeEvent.isComposing) { e.preventDefault(); if (!error) save(); }
      }}>
        <section className="task-editor-intro" aria-label="Descrição da tarefa">
          <label className="task-field-label" htmlFor={`${formId}-title`}>{isEvent ? 'Qual é o compromisso?' : task.kind === 'habit' ? 'Qual hábito quer cultivar?' : 'O que precisa ser feito?'}</label>
          <AutoGrowTextarea
            id={`${formId}-title`}
            className="title-input"
            rows={1}
            value={task.title}
            placeholder={isEvent ? 'Ex.: consulta às 10h' : task.kind === 'habit' ? 'Ex.: ler por 15 minutos' : 'Ex.: enviar relatório'}
            maxLength={1000}
            autoFocus={isNew && !task.title}
            data-autofocus=""
            onChange={e => upd({ title: e.target.value.replace(/\n/g, '') })}
            aria-label="Título"
            aria-required="true"
          />
          <Segmented<Kind> label="Tipo" value={task.kind} onChange={setKind} options={[
            { value: 'task', label: 'Tarefa' }, { value: 'event', label: 'Compromisso' }, { value: 'habit', label: 'Hábito' },
          ]} />
          <p className="xs muted">{isEvent ? 'Um compromisso tem dia e pode ter horário definido.' : task.kind === 'habit' ? 'Uma ação que se repete e você acompanha ao longo dos dias.' : 'Uma ação para concluir. Pode planejar agora ou organizar depois.'}</p>
          {series && !isNew && <p className="xs muted">Alterando {occLabel.toLowerCase()}. Ao salvar, você escolhe quais repetições mudar.</p>}
          {original.seriesId && <p className="xs muted">Esta data foi ajustada à parte da série.</p>}
        </section>

        <section className="task-editor-section" aria-labelledby={`${formId}-plan`}>
          <h2 className="task-editor-heading" id={`${formId}-plan`}>Planejamento</h2>
          {!task.recurrence && <div className="chips task-date-shortcuts" role="group" aria-label="Atalhos de data">
            {quickDates.map(q => <button type="button" key={q.label} className={`chip${task.date === q.value ? ' on' : ''}`} aria-pressed={task.date === q.value} onClick={() => pickDate(q.value)}>{q.label}</button>)}
            <button type="button" className={`chip${inbox ? someday ? ' on' : '' : !task.date ? ' on' : ''}`} aria-pressed={inbox ? someday : !task.date} onClick={() => { if (inbox) { setSomeday(!someday); upd({ date: undefined, time: undefined }); } else pickDate(undefined); }}>Quando der</button>
          </div>}
          <div className="task-editor-grid">
            {!task.recurrence && <label className="field">
              <span className="task-field-label">Dia planejado <span className="task-field-optional">opcional</span></span>
              <input type="date" className="input num" value={task.date ?? ''} onChange={e => pickDate(e.target.value || undefined)} aria-label="Data" />
            </label>}
            <div className="field">
              <label className="task-field-label" htmlFor={`${formId}-time`}>Horário <span className="task-field-optional">opcional</span></label>
              <div className="task-editor-input-action">
                <input id={`${formId}-time`} type="time" className="input num" value={task.time ?? ''} onChange={e => {
                  const time = e.target.value || undefined;
                  if (time) setSomeday(false);
                  upd({ time, ...(!task.recurrence && time ? { date: task.date ?? today } : {}) });
                }} aria-label="Horário de início" />
                {task.time && <button type="button" className="icon-btn" aria-label="Tirar o horário" title="Tirar o horário" onClick={() => upd({ time: undefined })}><Icon name="x" size={16} /></button>}
              </div>
            </div>
            <div className="field">
              <label className="task-field-label" htmlFor={`${formId}-duration`}>{isEvent ? 'Duração' : 'Tempo estimado'}</label>
              <select id={`${formId}-duration`} className="input" aria-label="Duração" value={showCustomDuration ? 'custom' : task.duration ?? defaultDuration} onChange={e => {
                if (e.target.value === 'custom') { setCustomDuration(true); upd({ duration: task.duration ?? defaultDuration }); }
                else { setCustomDuration(false); upd({ duration: e.target.value ? Number(e.target.value) : undefined }); }
              }}>
                {[...new Set([...DURATIONS, defaultDuration])].sort((a, b) => a - b).map(m => <option key={m} value={m}>{formatDuration(m)}</option>)}
                <option value="">Usar duração padrão</option>
                <option value="custom">Personalizada…</option>
              </select>
              {showCustomDuration && <label className="field">
                <span className="xs muted">Duração em minutos</span>
                <input className="input num" type="number" inputMode="numeric" min={1} max={10080} step={1} value={task.duration ?? ''} aria-label="Duração em minutos" aria-invalid={!!durationError} aria-describedby={durationError ? `${formId}-duration-error` : undefined} onChange={e => upd({ duration: e.target.value === '' ? undefined : Number(e.target.value) })} />
                {durationError && <span id={`${formId}-duration-error`} className="xs warn-text">{durationError}</span>}
              </label>}
            </div>
            {!isEvent && <label className="field">
              <span className="task-field-label">Prioridade <span className="task-field-optional">opcional</span></span>
              <select className="input" aria-label="Prioridade" value={task.priority ?? ''} onChange={e => upd({ priority: (e.target.value || undefined) as Priority | undefined })}>
                <option value="">Nenhuma</option>
                {(['essential', 'important', 'optional'] as Priority[]).map(p => <option key={p} value={p}>{PRIORITY_META[p].label}</option>)}
              </select>
            </label>}
          </div>
          {(task.date || task.recurrence) && <p className={`xs ${overdue ? 'warn-text' : 'muted'}`} aria-live="polite">
            {task.recurrence ? task.time ? `${task.time}–${endTime} nos dias em que repete` : 'Sem horário fixo nas repetições' : `${formatDay(task.date!, today, { long: true })}${task.time ? ` · ${task.time}–${endTime}` : ' · sem horário fixo'}${overdue ? ' · data passada' : ''}`}
            {gcalConnected && ' · envio ao Google Agenda ativado'}
          </p>}
        </section>

        {task.kind === 'habit' ? <section className="task-editor-section" aria-labelledby={`${formId}-habit`}>
          <h2 className="task-editor-heading" id={`${formId}-habit`}>Repetição do hábito</h2>{recurrenceField}
        </section> : <Disclosure className="task-editor-disclosure" icon="repeat" title={<span>Repetição<span className="task-editor-summary">{task.recurrence ? recurrenceLabel(task.recurrence, { ends: false }) : 'Não repete'}</span></span>} defaultOpen={!!original.recurrence}>{recurrenceField}</Disclosure>}

        {task.kind === 'habit' && <Disclosure className="task-editor-disclosure" icon="leaf" title={<span>Aparência do hábito<span className="task-editor-summary">Ícone e cor · opcional</span></span>}>
          <HabitAppearance task={task} onChange={upd} />
        </Disclosure>}

        {(!isEvent || task.subtasks.length > 0 || !!newSub.trim()) && <Disclosure className="task-editor-disclosure" icon="list" title={<span>Passos<span className="task-editor-summary">{task.subtasks.length ? `${subDone} de ${task.subtasks.length} concluídos` : 'Divida se isso ajudar a começar'}</span></span>} defaultOpen={original.subtasks.length > 0}>
          <div className="task-editor-details">
            {task.subtasks.length === 0 && task.title.trim() && <button type="button" className="btn btn-sm btn-soft" onClick={() => addSubtasks(assistant.breakdown(task))}><Icon name="sparkles" size={14} />Sugerir passos</button>}
            <SubtaskList subtasks={task.subtasks} onChange={subtasks => upd({ subtasks })} />
            <form className="subtask task-editor-add-step" onSubmit={e => { e.preventDefault(); if (newSub.trim()) addSubtasks([newSub.trim()]); setNewSub(''); }}>
              <Icon name="plus" size={18} className="faint" />
              <AutoGrowTextarea rows={1} value={newSub} maxLength={1000} onChange={e => setNewSub(e.target.value.replace(/\n/g, ' '))} onKeyDown={e => {
                if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (newSub.trim()) { addSubtasks([newSub.trim()]); setNewSub(''); } }
              }} placeholder={task.subtasks.length ? 'Adicionar passo' : 'Qual é o primeiro passo?'} aria-label="Novo passo" />
              {newSub.trim() && <button type="submit" className="btn btn-sm btn-soft">Adicionar</button>}
            </form>
            {task.subtasks.length > 1 && <p className="xs muted">Use a alça para arrastar ou as setas do teclado para mudar a ordem.</p>}
            {task.recurrence && <p className="xs muted">Os passos são compartilhados entre as repetições.</p>}
          </div>
        </Disclosure>}

        <Disclosure className="task-editor-disclosure" icon="edit" title={<span>Notas<span className="task-editor-summary">{task.notes?.trim() ? 'Detalhes adicionados' : 'Detalhes, links e lembretes'}</span></span>} defaultOpen={!!original.notes?.trim()}>
          <label className="field" htmlFor={`${formId}-notes`}><span className="sr-only">Notas</span>
            <textarea id={`${formId}-notes`} className="input" aria-label="Notas" rows={3} value={task.notes ?? ''} maxLength={50000} placeholder="Só o que ajuda a realizar esta tarefa…" onChange={e => upd({ notes: e.target.value })} />
          </label>
        </Disclosure>

        <Disclosure className="task-editor-disclosure" icon="folder" title={<span>Organização<span className="task-editor-summary">{organizationSummary || 'Projeto, categoria e prazo'}</span></span>}>
          <div className="task-editor-details">
            <label className="field" htmlFor={`${formId}-project`}><span className="task-field-label">Projeto</span>
              <select id={`${formId}-project`} className="input" aria-label="Projeto" value={task.projectId ?? ''} onChange={e => upd({ projectId: e.target.value || undefined })}>
                <option value="">Sem projeto</option>
                {projects.filter(p => !p.archived || p.id === task.projectId).map(p => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
              </select>
            </label>
            <label className="field"><span className="task-field-label">Categoria</span>
              <select className="input" aria-label="Categoria" value={task.category ?? ''} onChange={e => upd({ category: (e.target.value || undefined) as Task['category'] })}>
                <option value="">Sem categoria</option>
                {CATEGORIES.map(cat => <option key={cat.id} value={cat.id}>{cat.icon} {cat.label}</option>)}
              </select>
            </label>
            {task.kind === 'task' && <div className="field">
              <label className="task-field-label" htmlFor={`${formId}-due`}>Prazo final <span className="task-field-optional">opcional</span></label>
              <div className="task-editor-input-action"><input id={`${formId}-due`} type="date" className="input num" aria-label="Prazo final" value={task.due ?? ''} onChange={e => upd({ due: e.target.value || undefined })} />
                {task.due && <button type="button" className="icon-btn" aria-label="Tirar prazo" onClick={() => upd({ due: undefined })}><Icon name="x" size={16} /></button>}
              </div>
              <p className="xs muted">Data-limite da entrega; pode ser diferente do dia planejado.</p>
              {task.date && task.due && task.date > task.due && <p className="xs warn-text">O dia planejado está depois do prazo final.</p>}
            </div>}
          </div>
        </Disclosure>

        {inbox && !task.recurrence && task.title.trim().length > 2 && <Disclosure className="task-editor-disclosure" icon="sparkles" title="Ajuda para planejar">
          <Suggestion task={task} onAccept={(patch, noDate) => { setSomeday(noDate); upd(patch); }} />
        </Disclosure>}
        {!isNew && <Disclosure className="task-editor-disclosure" title="Outras ações">
          <div className="task-editor-secondary-actions">
            {inbox && <button type="button" className="btn btn-sm btn-ghost" onClick={() => { if (confirmDiscard()) { archiveWithFeedback(task.id); closeSheet(); } }}><Icon name="archive" size={16} />Arquivar captura</button>}
            <button type="button" className="btn btn-sm btn-danger" onClick={() => remove()}><Icon name="trash" size={16} />Excluir {noun}</button>
          </div>
        </Disclosure>}
      </div>
    </BottomSheet>
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
