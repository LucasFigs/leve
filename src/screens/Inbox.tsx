import { useMemo, useState } from 'react';
import { inboxTasks, unscheduledTasks } from '../domain/selectors';
import { useStore } from '../store/store';
import { openSheet } from '../store/ui';
import { QuickAdd } from '../components/QuickAdd';
import { TaskCard } from '../components/TaskCard';
import { Icon } from '../components/Icon';
import { EmptyState, SectionHead } from '../components/ui';
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
        Toque em uma captura para configurar todos os detalhes e escolher onde ela fica.
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
                  Revisar capturas
                </button>
              }
            />
            <div className="list">
              {inbox.map((t) => (
                <TaskCard key={t.id} task={t} showDate />
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

