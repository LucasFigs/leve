/** Lista de passos editável e reordenável (arraste pela alça ou use ↑/↓ nela). */
import { useRef, useState } from 'react';
import type { Subtask } from '../domain/types';
import { Checkbox } from './ui';
import { Icon } from './Icon';

interface Props {
  subtasks: Subtask[];
  onChange: (subtasks: Subtask[]) => void;
}

const moveItem = <T,>(list: T[], from: number, to: number) => {
  const next = [...list];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
};

export function SubtaskList({ subtasks, onChange }: Props) {
  const listRef = useRef<HTMLDivElement>(null);
  const [dragId, setDragId] = useState<string>();
  // Refs para os ouvintes da janela sempre verem a lista atual
  const latest = useRef({ subtasks, onChange });
  latest.current = { subtasks, onChange };

  const startDrag = (e: React.PointerEvent, id: string) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setDragId(id);
    const move = (ev: PointerEvent) => {
      const { subtasks: subs, onChange: change } = latest.current;
      const rows = Array.from(listRef.current?.querySelectorAll<HTMLElement>('[data-sub-id]') ?? []);
      const from = subs.findIndex((s) => s.id === id);
      if (from < 0) return;
      // Insere antes da primeira linha cujo meio está abaixo do dedo
      let at = rows.findIndex((r) => {
        const box = r.getBoundingClientRect();
        return ev.clientY < box.top + box.height / 2;
      });
      if (at < 0) at = rows.length;
      const to = at > from ? at - 1 : at;
      if (to !== from) change(moveItem(subs, from, to));
    };
    const end = () => {
      setDragId(undefined);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', end);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', end);
    window.addEventListener('pointercancel', end);
  };

  const nudge = (i: number, dir: -1 | 1) => {
    const to = i + dir;
    if (to < 0 || to >= subtasks.length) return;
    onChange(moveItem(subtasks, i, to));
  };

  return (
    <div ref={listRef}>
      {subtasks.map((s, i) => (
        <div key={s.id} data-sub-id={s.id} className={`subtask${s.done ? ' done' : ''}${dragId === s.id ? ' dragging' : ''}`}>
          {subtasks.length > 1 && (
            <button
              type="button"
              className="drag-handle"
              onPointerDown={(e) => startDrag(e, s.id)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                  e.preventDefault();
                  nudge(i, e.key === 'ArrowUp' ? -1 : 1);
                  // mantém o foco na alça depois de mover
                  requestAnimationFrame(() => listRef.current?.querySelector<HTMLElement>(`[data-sub-id="${s.id}"] .drag-handle`)?.focus());
                }
              }}
              aria-label={`Mover passo “${s.title}” (posição ${i + 1} de ${subtasks.length}). Arraste ou use as setas.`}
              title="Arraste para mudar a ordem"
            >
              <Icon name="grip" size={18} stroke={2.6} />
            </button>
          )}
          <Checkbox
            checked={s.done}
            onToggle={() => onChange(subtasks.map((x) => (x.id === s.id ? { ...x, done: !x.done } : x)))}
            label={`Concluir passo: ${s.title}`}
          />
          <input value={s.title} onChange={(e) => onChange(subtasks.map((x) => (x.id === s.id ? { ...x, title: e.target.value } : x)))} aria-label="Passo" />
          <button type="button" className="icon-btn sm" onClick={() => onChange(subtasks.filter((x) => x.id !== s.id))} aria-label={`Remover ${s.title}`}>
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}
