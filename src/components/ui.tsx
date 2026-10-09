/** Componentes pequenos e reutilizáveis. */
import { useEffect, useState, type ReactNode } from 'react';
import type { Priority } from '../domain/types';
import { PRIORITY_META } from '../domain/priority';
import { dismissToast, useUI } from '../store/ui';
import { Icon, type IconName } from './Icon';

export function PriorityBadge({ priority, compact }: { priority?: Priority; compact?: boolean }) {
  if (!priority) return null;
  return (
    <span className={`prio ${priority}`}>
      <span className="prio-dot" aria-hidden="true" />
      {compact ? <span className="sr-only">{PRIORITY_META[priority].label}</span> : PRIORITY_META[priority].label}
    </span>
  );
}

export function ProgressBar({ value, tone, label }: { value: number; tone?: 'accent'; label?: string }) {
  const pct = Math.round(Math.max(0, Math.min(1, value)) * 100);
  return (
    <div className={`progress${tone ? ' ' + tone : ''}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
      <div style={{ width: `${pct}%` }} />
    </div>
  );
}

export function EmptyState({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <div className="empty-title">{title}</div>
      {text && <p>{text}</p>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, label }: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={value === o.value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return <button type="button" role="switch" className="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)} />;
}

export function Checkbox({ checked, onToggle, tone, habit, label }: {
  checked: boolean;
  onToggle: () => void;
  tone?: Priority;
  habit?: boolean;
  label: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      className={`check${checked ? ' on' : ''}${tone && !checked ? ' ' + tone : ''}${habit ? ' habit' : ''}`}
      onClick={(e) => {
        e.stopPropagation();
        if (!checked && navigator.vibrate) navigator.vibrate(8);
        onToggle();
      }}
    >
      <Icon name="check" size={14} stroke={3} />
    </button>
  );
}

export function Toasts() {
  const toasts = useUI((u) => u.toasts);
  return (
    <div className="toasts" aria-live="polite" role="status">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <span>{t.message}</span>
          {t.action && (
            <button
              onClick={() => {
                t.action!.run();
                dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

export function Option({ icon, title, sub, onClick, tone, disabled }: {
  icon: IconName;
  title: string;
  sub?: ReactNode;
  onClick: () => void;
  tone?: string;
  disabled?: boolean;
}) {
  return (
    <button className="option" onClick={onClick} disabled={disabled}>
      <span className={`option-icon${tone ? ' tone-' + tone : ''}`}>
        <Icon name={icon} />
      </span>
      <span className="grow">
        <span className="option-title" style={{ display: 'block' }}>{title}</span>
        {sub && <span className="option-sub">{sub}</span>}
      </span>
      <Icon name="chevron-right" size={18} className="faint" />
    </button>
  );
}

export function SectionHead({ title, action }: { title: ReactNode; action?: ReactNode }) {
  return (
    <div className="section-head">
      <h2 className="section-title">{title}</h2>
      {action}
    </div>
  );
}

/**
 * Campo numérico que pode ficar vazio enquanto você digita (apagar tudo e digitar outro número).
 * Vazio chega como `undefined`; quem usa decide se dá para salvar.
 */
export function NumberField({ value, onChange, label, width = 80, maxLength = 3, id }: {
  value?: number;
  onChange: (v: number | undefined) => void;
  label: string;
  width?: number;
  maxLength?: number;
  id?: string;
}) {
  const shown = value == null || Number.isNaN(value) ? '' : String(value);
  const [text, setText] = useState(shown);
  // Acompanha mudanças vindas de fora (ex.: trocar de opção), sem atrapalhar a digitação
  useEffect(() => {
    if ((text === '' ? '' : String(Number(text))) !== shown) setText(shown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown]);
  return (
    <input
      id={id}
      type="text"
      inputMode="numeric"
      autoComplete="off"
      className="input num"
      style={{ width, textAlign: 'center' }}
      value={text}
      aria-label={label}
      aria-invalid={text === '' || undefined}
      onChange={(e) => {
        const t = e.target.value.replace(/\D/g, '').slice(0, maxLength);
        setText(t);
        onChange(t === '' ? undefined : Number(t));
      }}
    />
  );
}
