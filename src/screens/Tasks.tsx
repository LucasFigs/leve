/** Todas as tarefas num lugar só, para gerir tudo (filtros + grupos por quando). */
import { useMemo, useState } from 'react';
import type { Kind, Priority, Task } from '../domain/types';
import { addDays, timeToMin, todayISO } from '../domain/dates';
import { nextOccurrence } from '../domain/recurrence';
import { normalize } from '../domain/parser';
import { newTask, useStore } from '../store/store';
import { goTo, openSheet } from '../store/ui';
import { TaskCard } from '../components/TaskCard';
import { Icon } from '../components/Icon';
import { EmptyState, Segmented, SectionHead } from '../components/ui';
import { TopActions } from './TopActions';

type StatusFilter = 'open' | 'done' | 'all';

interface Group {
  key: string;
  title: string;
  tasks: Task[];
  hint?: string;
}

const PRIO_ORDER: Record<string, number> = { essential: 0, important: 1, optional: 2 };

function byWhen(a: Task, b: Task) {
  if ((a.date ?? '') !== (b.date ?? '')) return (a.date ?? '9999') < (b.date ?? '9999') ? -1 : 1;
  if (a.time && b.time) return timeToMin(a.time) - timeToMin(b.time);
  if (a.time !== b.time) return a.time ? -1 : 1;
  return (PRIO_ORDER[a.priority ?? 'optional'] ?? 2) - (PRIO_ORDER[b.priority ?? 'optional'] ?? 2) || b.createdAt - a.createdAt;
}

/** Abas Tarefas/Projetos no celular (no computador elas ficam na barra lateral). */
export function TasksProjectsSwitch({ current }: { current: 'tasks' | 'projects' }) {
  return (
    <div className="mobile-only" style={{ marginBottom: 14 }}>
      <Segmented<'tasks' | 'projects'>
        label="Ver"
        value={current}
        onChange={(v) => v !== current && goTo(v)}
        options={[
          { value: 'tasks', label: 'Todas as tarefas' },
          { value: 'projects', label: 'Projetos' },
        ]}
      />
    </div>
  );
}

export function TasksScreen() {
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<StatusFilter>('open');
  const [kind, setKind] = useState<Kind | ''>('');
  const [priority, setPriority] = useState<Priority | 'none' | ''>('');
  const [projectId, setProjectId] = useState('');
  const [showAllDone, setShowAllDone] = useState(false);
  const today = todayISO();

  const groups = useMemo(() => {
    const needle = normalize(q.trim());
    const match = (t: Task) =>
      (!needle || normalize(`${t.title} ${t.notes ?? ''} ${t.subtasks.map((s) => s.title).join(' ')}`).includes(needle)) &&
      (!kind || t.kind === kind) &&
      (!priority || (priority === 'none' ? !t.priority : t.priority === priority)) &&
      (!projectId || (projectId === 'none' ? !t.projectId : t.projectId === projectId));
    const list = tasks.filter(match);
    const week = addDays(today, 7);
    const ended = (t: Task) => !!t.recurrence && !nextOccurrence(t.recurrence, today, t.skipDates);
    const open = list.filter((t) => (t.status === 'active' || t.status === 'inbox') && !ended(t));

    const g: Group[] = [];
    if (status !== 'done') {
      const once = open.filter((t) => t.status === 'active' && !t.recurrence);
      g.push(
        { key: 'inbox', title: 'Inbox', tasks: open.filter((t) => t.status === 'inbox'), hint: 'Capturas que ainda não têm lugar' },
        { key: 'overdue', title: 'Atrasadas', tasks: once.filter((t) => t.kind !== 'event' && ((t.date && t.date < today) || (!t.date && t.due && t.due < today))) },
        { key: 'today', title: 'Hoje', tasks: once.filter((t) => t.date === today) },
        { key: 'week', title: 'Próximos 7 dias', tasks: once.filter((t) => t.date && t.date > today && t.date <= week) },
        { key: 'later', title: 'Mais adiante', tasks: once.filter((t) => t.date && t.date > week) },
        { key: 'someday', title: 'Quando der (sem data)', tasks: once.filter((t) => !t.date && !(t.due && t.due < today)) },
        { key: 'past-events', title: 'Compromissos que já passaram', tasks: once.filter((t) => t.kind === 'event' && t.date && t.date < today), hint: 'Marque se aconteceram ou remarque' },
        { key: 'recurring', title: 'Repetem', tasks: open.filter((t) => t.status === 'active' && t.recurrence) },
      );
    }
    if (status !== 'open') {
      const done = list
        .filter((t) => t.status === 'done' || (t.status === 'active' && ended(t)))
        .sort((a, b) => (b.completedAt ?? b.updatedAt) - (a.completedAt ?? a.updatedAt));
      g.push({ key: 'done', title: 'Concluídas e encerradas', tasks: done });
      if (status === 'all') g.push({ key: 'archived', title: 'Arquivadas', tasks: list.filter((t) => t.status === 'archived') });
    }
    for (const x of g) if (x.key !== 'done') x.tasks.sort(byWhen);
    return g.filter((x) => x.tasks.length);
  }, [tasks, q, status, kind, priority, projectId, today]);

  const total = groups.reduce((s, x) => s + x.tasks.length, 0);
  const filtered = !!(q || kind || priority || projectId);

  return (
    <div className="screen">
      <div className="topbar">
        <h1 className="page-title">Tarefas</h1>
        <TopActions>
          <button className="btn btn-sm btn-soft" onClick={() => openSheet({ type: 'newTask', task: newTask({ title: '' }) })}>
            <Icon name="plus" size={16} />
            Nova
          </button>
        </TopActions>
      </div>

      <TasksProjectsSwitch current="tasks" />

      <div className="search-bar" style={{ marginBottom: 12 }}>
        <Icon name="search" size={18} className="faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filtrar por nome, nota ou passo…" aria-label="Filtrar tarefas" />
        {q && (
          <button className="icon-btn sm" onClick={() => setQ('')} aria-label="Limpar">
            <Icon name="x" size={16} />
          </button>
        )}
      </div>

      <Segmented<StatusFilter>
        label="Situação"
        value={status}
        onChange={setStatus}
        options={[
          { value: 'open', label: 'Abertas' },
          { value: 'done', label: 'Concluídas' },
          { value: 'all', label: 'Todas' },
        ]}
      />

      <div className="filters" style={{ marginTop: 10 }}>
        <select className="input" value={kind} onChange={(e) => setKind(e.target.value as Kind | '')} aria-label="Tipo">
          <option value="">Todos os tipos</option>
          <option value="task">Tarefas</option>
          <option value="event">Compromissos</option>
          <option value="habit">Hábitos</option>
        </select>
        <select className="input" value={priority} onChange={(e) => setPriority(e.target.value as Priority | 'none' | '')} aria-label="Prioridade">
          <option value="">Qualquer prioridade</option>
          <option value="essential">Essencial</option>
          <option value="important">Importante</option>
          <option value="optional">Opcional</option>
          <option value="none">Sem prioridade</option>
        </select>
        <select className="input" value={projectId} onChange={(e) => setProjectId(e.target.value)} aria-label="Projeto">
          <option value="">Todos os projetos</option>
          <option value="none">Sem projeto</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>
          ))}
        </select>
      </div>

      <p className="xs faint" style={{ margin: '10px 2px 0' }} aria-live="polite">
        {total} {total === 1 ? 'item' : 'itens'}
        {filtered && (
          <>
            {' · '}
            <button className="link-btn" onClick={() => { setQ(''); setKind(''); setPriority(''); setProjectId(''); }}>limpar filtros</button>
          </>
        )}
      </p>

      {total === 0 ? (
        <EmptyState icon="🗂️" title={filtered ? 'Nada com esses filtros.' : 'Nenhuma tarefa aqui.'} text={filtered ? 'Tente outro filtro.' : 'Use o + para capturar algo.'} />
      ) : (
        groups.map((g) => {
          const limit = g.key === 'done' && !showAllDone ? 30 : Infinity;
          return (
            <section key={g.key} className="section">
              <SectionHead
                title={`${g.title} · ${g.tasks.length}`}
                action={g.hint && <span className="xs faint">{g.hint}</span>}
              />
              <div className="list">
                {g.tasks.slice(0, limit).map((t) => {
                  const occ = t.recurrence ? nextOccurrence(t.recurrence, today, t.skipDates) : undefined;
                  return (
                    <TaskCard
                      key={t.id}
                      task={t}
                      date={occ}
                      done={t.recurrence ? !!occ && !!t.doneDates?.includes(occ) : undefined}
                      showDate
                      exitOnDone={false}
                    />
                  );
                })}
              </div>
              {g.tasks.length > limit && (
                <button className="btn btn-sm btn-ghost" style={{ marginTop: 8 }} onClick={() => setShowAllDone(true)}>
                  Mostrar mais {g.tasks.length - limit}
                </button>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
