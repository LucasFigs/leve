import { useMemo, useState } from 'react';
import { search } from '../domain/search';
import { actions, getState, useStore } from '../store/store';
import { closeSheet, goTo, setUI, toast } from '../store/ui';
import type { CaptureDefaults } from '../store/store';
import { BottomSheet } from '../components/BottomSheet';
import { QuickAdd } from '../components/QuickAdd';
import { TaskCard } from '../components/TaskCard';
import { Icon } from '../components/Icon';

export function QuickAddSheet({ defaults }: { defaults?: CaptureDefaults }) {
  return (
    <BottomSheet title="Capturar" onClose={closeSheet}>
      <QuickAdd autoFocus defaults={defaults} onDone={closeSheet} />
      <div className="xs faint" style={{ marginTop: 12, lineHeight: 1.6 }}>
        Escreva do seu jeito: <i>“reunião com Ana quinta às 15”</i>, <i>“pagar aluguel todo dia 5”</i>,{' '}
        <i>“estudar inglês por 30 min amanhã”</i>.
      </div>
    </BottomSheet>
  );
}

const EMOJIS = ['📁', '💼', '✈️', '🏠', '💪', '📚', '💰', '🎯', '🎨', '🧠', '❤️', '🌱'];
const COLORS = ['violet', 'blue', 'green', 'yellow', 'red', 'gray'];

export function ProjectSheet({ id }: { id?: string }) {
  const existing = useStore((s) => (id ? s.projects.find((p) => p.id === id) : undefined));
  const [name, setName] = useState(existing?.name ?? '');
  const [emoji, setEmoji] = useState(existing?.emoji ?? '📁');
  const [color, setColor] = useState(existing?.color ?? 'violet');

  const save = () => {
    if (!name.trim()) return;
    if (existing) actions.updateProject(existing.id, { name: name.trim(), emoji, color });
    else {
      const p = actions.addProject(name, emoji, color);
      goTo('projects');
      setUI({ openProjectId: p.id });
    }
    closeSheet();
  };

  return (
    <BottomSheet
      title={existing ? 'Editar projeto' : 'Novo projeto'}
      onClose={closeSheet}
      footer={
        <>
          {existing && (
            <button
              className="btn btn-danger"
              onClick={() => {
                actions.removeProject(existing.id);
                setUI({ openProjectId: undefined });
                closeSheet();
                toast('Projeto excluído (as tarefas foram mantidas)', { label: 'Desfazer', run: () => actions.undo() });
              }}
            >
              Excluir
            </button>
          )}
          <button className="btn btn-primary grow" disabled={!name.trim()} onClick={save}>
            {existing ? 'Salvar' : 'Criar projeto'}
          </button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="stack" style={{ gap: 18 }}>
        <div className="row" style={{ gap: 12 }}>
          <span className={`project-emoji tone-${color}`} aria-hidden="true">{emoji}</span>
          <input className="input grow" autoFocus data-autofocus placeholder="Nome do projeto" value={name} onChange={(e) => setName(e.target.value)} aria-label="Nome do projeto" />
        </div>
        <div className="field">
          <span className="label">Ícone</span>
          <div className="chips">
            {EMOJIS.map((e) => (
              <button type="button" key={e} className={`chip${emoji === e ? ' on' : ''}`} style={{ fontSize: 18, minWidth: 44, justifyContent: 'center' }} onClick={() => setEmoji(e)} aria-label={`Ícone ${e}`} aria-pressed={emoji === e}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">Cor</span>
          <div className="chips">
            {COLORS.map((c) => (
              <button
                type="button"
                key={c}
                className={`tone-${c}`}
                style={{ width: 36, height: 36, borderRadius: 12, outline: color === c ? '2px solid var(--accent)' : 'none', outlineOffset: 2 }}
                onClick={() => setColor(c)}
                aria-label={`Cor ${c}`}
                aria-pressed={color === c}
              />
            ))}
          </div>
        </div>
      </form>
    </BottomSheet>
  );
}

const SEARCH_HINTS = ['tarefas atrasadas', 'o que eu tinha para fazer ontem?', 'amanhã', 'concluídas', 'essenciais', 'sem data'];

export function SearchSheet() {
  const [q, setQ] = useState('');
  const tasks = useStore((s) => s.tasks);
  const projects = useStore((s) => s.projects);
  const result = useMemo(() => search(q, getState()), [q, tasks, projects]); // eslint-disable-line react-hooks/exhaustive-deps
  const projectHints = projects.slice(0, 2).map((p) => `projeto ${p.name.toLowerCase()}`);
  const total = result.groups.reduce((s, g) => s + g.tasks.length, 0) + result.projects.length;

  return (
    <BottomSheet
      label="Buscar"
      onClose={closeSheet}
      full
      headerExtra={
        <div className="search-bar grow">
          <Icon name="search" size={18} className="faint" />
          <input autoFocus data-autofocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar ou perguntar…" aria-label="Buscar" enterKeyHint="search" />
          {q && (
            <button className="icon-btn sm" onClick={() => setQ('')} aria-label="Limpar">
              <Icon name="x" size={16} />
            </button>
          )}
        </div>
      }
    >
      {!q ? (
        <>
          <p className="label" style={{ marginBottom: 10 }}>Experimente</p>
          <div className="chips">
            {[...SEARCH_HINTS, ...projectHints].map((h) => (
              <button key={h} className="chip" onClick={() => setQ(h)}>{h}</button>
            ))}
          </div>
        </>
      ) : (
        <>
          {result.understood && (
            <p className="small muted" style={{ marginBottom: 12 }}>
              <Icon name="sparkles" size={14} /> {result.understood}
            </p>
          )}
          {total === 0 && <p className="small muted" style={{ padding: '24px 0', textAlign: 'center' }}>Nada encontrado para “{q}”.</p>}
          {result.projects.length > 0 && !result.understood && (
            <section style={{ marginBottom: 18 }}>
              <p className="section-title" style={{ marginBottom: 8 }}>Projetos</p>
              <div className="list">
                {result.projects.map((p) => (
                  <button key={p.id} className="task" style={{ width: '100%' }} onClick={() => { goTo('projects'); setUI({ openProjectId: p.id }); }}>
                    <span style={{ fontSize: 20 }}>{p.emoji}</span>
                    <span className="task-main task-title">{p.name}</span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {result.groups.map((g) => (
            <section key={g.label} style={{ marginBottom: 18 }}>
              <p className="section-title" style={{ marginBottom: 8 }}>{g.label} · {g.tasks.length}</p>
              {g.tasks.length ? (
                <div className="list">
                  {g.tasks.slice(0, 40).map((t) => (
                    <TaskCard key={t.id} task={t} showDate exitOnDone={false} />
                  ))}
                </div>
              ) : (
                <p className="small faint">Nada aqui.</p>
              )}
            </section>
          ))}
        </>
      )}
      <span className="sr-only" aria-live="polite">{q ? `${total} resultados` : ''}</span>
    </BottomSheet>
  );
}
