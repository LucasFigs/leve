import { useEffect, useMemo, useRef, useState } from 'react';
import { inboxTasks, isInboxCapture, unscheduledTasks } from '../domain/selectors';
import { useInboxSession, useStore } from '../store/store';
import { openSheet, useUI } from '../store/ui';
import { QuickAdd } from '../components/QuickAdd';
import { TaskCard } from '../components/TaskCard';
import { Icon } from '../components/Icon';
import { EmptyState, SectionHead } from '../components/ui';
import { TopActions } from './TopActions';
import { BottomSheet } from '../components/BottomSheet';
import { removeCapturesWithFeedback } from '../components/feedback';
import { formatDuration } from '../domain/dates';
import type { Task } from '../domain/types';

export function InboxScreen() {
  const session = useInboxSession();
  const tab = useUI(u => u.tab);
  return <InboxContent key={`${session}:${tab}`} />;
}

function InboxContent() {
  const tasks = useStore((s) => s.tasks);
  const inbox = useMemo(() => inboxTasks(tasks), [tasks]);
  const someday = useMemo(() => unscheduledTasks(tasks).filter((t) => !t.projectId || t.priority === 'optional'), [tasks]);
  const [showSomeday, setShowSomeday] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [pending, setPending] = useState<{ ids: string[]; single: boolean }>();
  const screen = useRef<HTMLDivElement>(null);
  const selectButton = useRef<HTMLButtonElement>(null);
  const eligible = useMemo(() => new Set(inbox.filter(isInboxCapture).map(t => t.id)), [inbox]);
  const selectedIds = selected.filter(id => eligible.has(id));
  const selectedSet = new Set(selectedIds);
  const pendingIds = pending?.ids.filter(id => eligible.has(id)) ?? [];
  const pendingTitle = pending?.single ? inbox.find(t => t.id === pendingIds[0])?.title : undefined;
  useEffect(() => {
    setSelected(previous => previous.some(id => !eligible.has(id)) ? previous.filter(id => eligible.has(id)) : previous);
    if (!eligible.size) setSelecting(false);
  }, [eligible]);
  const focusAction = () => requestAnimationFrame(() => (selectButton.current ?? screen.current?.querySelector<HTMLTextAreaElement>('.quick textarea'))?.focus());
  const stopSelecting = () => { setSelected([]); setSelecting(false); focusAction(); };
  const toggle = (id: string) => setSelected(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  const confirmRemoval = () => {
    const count = removeCapturesWithFeedback(pendingIds, focusAction);
    setPending(undefined);
    if (count) stopSelecting();
  };

  return (
    <div className="screen inbox-screen" ref={screen}>
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
              action={<div className="inbox-section-actions">
                {eligible.size > 0 && <button ref={selectButton} type="button" className="btn btn-sm btn-ghost" onClick={() => { if (selecting) stopSelecting(); else setSelecting(true); }}>
                  {selecting ? 'Cancelar seleção' : 'Selecionar'}
                </button>}
                <button className="btn btn-sm btn-primary" onClick={() => openSheet({ type: 'review' })}>
                  <Icon name="sparkles" size={16} />
                  Revisar capturas
                </button>
              </div>}
            />
            {selecting && <div className="inbox-selection-tools" role="group" aria-label="Ações das capturas selecionadas">
              <p className="small" role="status">{selectedIds.length} {selectedIds.length === 1 ? 'captura selecionada' : 'capturas selecionadas'}</p>
              <div className="inbox-selection-actions">
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSelected([...eligible])} disabled={selectedIds.length === eligible.size}>Selecionar todas</button>
                <button type="button" className="btn btn-sm btn-ghost" onClick={() => setSelected([])} disabled={!selectedIds.length}>Limpar seleção</button>
                <button type="button" className="btn btn-sm btn-danger" disabled={!selectedIds.length} onClick={() => setPending({ ids: selectedIds, single: false })}><Icon name="trash" size={16} />Excluir selecionadas</button>
              </div>
              <p className="xs faint">Somente capturas desta lista. Novas capturas não são selecionadas automaticamente.</p>
            </div>}
            <div className="list inbox-capture-list">
              {inbox.map((t) => (
                selecting ? <CaptureSelectionCard key={t.id} task={t} checked={selectedSet.has(t.id)} disabled={!eligible.has(t.id)} onToggle={() => toggle(t.id)} /> :
                <TaskCard key={t.id} task={t} showDate onDeleteCapture={eligible.has(t.id) ? () => setPending({ ids: [t.id], single: true }) : undefined} />
              ))}
            </div>
          </>
        ) : (
          <EmptyState icon={<Icon name="inbox" size={28} />} title="Tudo limpo" text="Quando alguma coisa surgir na sua cabeça, jogue aqui." />
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
      {pending && <BottomSheet className="inbox-delete-sheet" title={pending.single ? 'Excluir captura?' : `Excluir ${pendingIds.length} ${pendingIds.length === 1 ? 'captura selecionada' : 'capturas selecionadas'}?`} onClose={() => setPending(undefined)}
        footer={<><button type="button" className="btn btn-secondary" data-autofocus="" onClick={() => setPending(undefined)}>Cancelar</button>
          <button type="button" className="btn btn-danger inbox-confirm-delete" disabled={!pendingIds.length} onClick={confirmRemoval}><Icon name="trash" size={17} />Excluir</button></>}>
        <p>{pendingIds.length ? pendingTitle ? `Excluir “${pendingTitle}”?` : `${pendingIds.length} ${pendingIds.length === 1 ? 'captura será removida' : 'capturas serão removidas'} do Inbox.` : 'Estas capturas não estão mais disponíveis para exclusão.'}</p>
        <p className="small muted" style={{ marginTop: 12 }}>Você pode desfazer enquanto o aviso estiver visível, nesta sessão. Itens que já foram organizados serão preservados.</p>
      </BottomSheet>}
    </div>
  );
}

function CaptureSelectionCard({task,checked,disabled,onToggle}:{task:Task;checked:boolean;disabled:boolean;onToggle:()=>void}) {
  return <button type="button" role="checkbox" aria-checked={checked} disabled={disabled} aria-label={`Selecionar captura: ${task.title}`}
    className={`task inbox-selection-card${checked ? ' selected' : ''}`} onClick={onToggle}>
    <span className={`check${checked ? ' on' : ''}`} aria-hidden="true"><Icon name="check" size={14} stroke={3}/></span>
    <span className="task-main"><span className="task-title">{task.title}</span><span className="task-meta">{disabled ? 'Este item não faz parte da seleção de capturas' : task.duration ? formatDuration(task.duration) : 'Captura do Inbox'}</span></span>
  </button>;
}

