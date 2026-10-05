import { useEffect, useMemo, useRef, useState } from 'react';
import { formatDay } from '../domain/dates';
import type { ChipType } from '../domain/parser';
import { assistant } from '../services/assistant';
import { actions, useStore, type CaptureDefaults } from '../store/store';
import { openSheet, toast } from '../store/ui';
import { Icon, type IconName } from './Icon';

const CHIP_ICON: Record<ChipType, IconName> = {
  kind: 'calendar',
  date: 'calendar',
  time: 'clock',
  duration: 'hourglass',
  recurrence: 'repeat',
  priority: 'flag',
  due: 'flag',
};

interface Props {
  defaults?: CaptureDefaults;
  autoFocus?: boolean;
  placeholder?: string;
  onDone?: () => void;
  hint?: boolean;
}

export function QuickAdd({ defaults, autoFocus, placeholder = 'O que você precisa fazer?', onDone, hint = true }: Props) {
  const [text, setText] = useState('');
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLTextAreaElement>(null);
  const defaultDuration = useStore((s) => s.settings.defaultDuration);
  const projects = useStore((s) => s.projects);

  const parsed = useMemo(
    () => (text.trim().length > 2 ? assistant.interpret(text, { defaultDuration }) : undefined),
    [text, defaultDuration],
  );
  const chips = (parsed?.chips ?? []).filter((c) => !ignored.has(c.type === 'due' ? 'due' : c.type));

  useEffect(() => {
    if (autoFocus) requestAnimationFrame(() => ref.current?.focus());
  }, [autoFocus]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  useEffect(() => {
    if (!text) setIgnored(new Set());
  }, [text]);

  const submit = () => {
    const task = actions.capture(text, defaults, ignored);
    if (!task) return;
    setText('');
    setIgnored(new Set());
    let msg = 'Guardado no Inbox';
    if (task.kind === 'event') msg = `Compromisso · ${task.date ? formatDay(task.date) : ''}${task.time ? ` às ${task.time}` : ''}`;
    else if (task.recurrence) msg = 'Recorrência criada';
    else if (task.date) msg = `Planejado para ${formatDay(task.date).toLowerCase()}${task.time ? ` às ${task.time}` : ''}`;
    else if (task.projectId) msg = `Adicionado em ${projects.find((p) => p.id === task.projectId)?.name ?? 'projeto'}`;
    toast(msg, { label: 'Editar', run: () => openSheet({ type: 'task', id: task.id }) });
    onDone?.();
    ref.current?.focus();
  };

  const contextChips: { label: string; icon: IconName }[] = [];
  if (defaults?.date && !parsed?.date) contextChips.push({ label: formatDay(defaults.date), icon: 'calendar' });
  if (defaults?.time && !parsed?.time) contextChips.push({ label: defaults.time, icon: 'clock' });
  if (defaults?.projectId) {
    const p = projects.find((x) => x.id === defaults.projectId);
    if (p) contextChips.push({ label: `${p.emoji} ${p.name}`, icon: 'folder' });
  }

  return (
    <form
      className="quick"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <div className="quick-row">
        <label htmlFor="quick-input" className="sr-only">{placeholder}</label>
        <textarea
          id="quick-input"
          ref={ref}
          className="input-plain"
          rows={1}
          value={text}
          placeholder={placeholder}
          onChange={(e) => setText(e.target.value.replace(/\n/g, ''))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          enterKeyHint="done"
          autoComplete="off"
          autoCapitalize="sentences"
          data-autofocus={autoFocus ? '' : undefined}
        />
        <button type="submit" className="send" disabled={!text.trim()} aria-label="Adicionar">
          <Icon name="arrow-up" size={18} stroke={2.2} />
        </button>
      </div>
      {(chips.length > 0 || contextChips.length > 0) && (
        <div className="chips quick-chips" aria-live="polite">
          {contextChips.map((c) => (
            <span key={c.label} className="chip">
              <Icon name={c.icon} size={14} />
              {c.label}
            </span>
          ))}
          {chips.map((c) => (
            <button
              key={c.type + c.label}
              type="button"
              className="chip parsed"
              onClick={() => setIgnored(new Set([...ignored, c.type]))}
              aria-label={`${c.label} — toque para descartar`}
              title="Toque para descartar"
            >
              <Icon name={CHIP_ICON[c.type]} size={14} />
              {c.label}
              <Icon name="x" size={12} className="x" />
            </button>
          ))}
        </div>
      )}
      {hint && text.trim().length > 2 && chips.length === 0 && contextChips.length === 0 && (
        <div className="quick-hint">Vai para o Inbox — organizo depois.</div>
      )}
      {hint && parsed?.big && !parsed.recurrence && (
        <div className="quick-hint">Parece grande. Depois eu ajudo a dividir em passos.</div>
      )}
    </form>
  );
}
