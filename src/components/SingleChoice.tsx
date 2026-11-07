import { useId, type ReactNode } from 'react';
import { Icon } from './Icon';

/** Radios nativos: uma escolha por grupo, com teclado e sem menu suspenso. */
export function SingleChoice<T extends string>({ label, value, options, onChange, disabled, optional, compact, className = '' }: {
  label: string;
  value?: T;
  options: { value: T | ''; label: string; icon?: ReactNode; disabled?: boolean }[];
  onChange: (value: T | undefined) => void;
  disabled?: boolean;
  optional?: boolean;
  className?: string;
  compact?: boolean;
}) {
  const name = useId();
  const empty = compact ? options.find(option => option.value === '') : undefined;
  // No primeiro legend, o controle não herda disabled do fieldset.
  const optionControl = (option: typeof options[number], reset = false) => <label className={`choice-option${reset ? ' choice-reset' : ''}`} key={option.value}>
    <input className="sr-only choice-input" type="radio" name={name} value={option.value}
      checked={(value ?? '') === option.value} disabled={disabled || option.disabled}
      onChange={() => onChange(option.value || undefined)} />
    <span className="choice-content">
      <span className="choice-mark" aria-hidden="true">
        <span className="choice-glyph">{option.icon ?? <span className="choice-radio" />}</span>
        <Icon name="check" size={16} stroke={2.5} className="choice-check" />
      </span>
      <span className="choice-label">{option.label}</span>
    </span>
  </label>;
  return <fieldset className={`choice-field${compact ? ' choice-field-compact' : ''} ${className}`} aria-label={label} disabled={disabled}>
    <legend className="task-field-label"><span>{label}{optional && !compact && <span className="task-field-optional">opcional</span>}</span>{empty && optionControl(empty, true)}</legend>
    <div className="choice-options">
      {options.filter(option => option !== empty).map(option => optionControl(option))}
    </div>
  </fieldset>;
}
