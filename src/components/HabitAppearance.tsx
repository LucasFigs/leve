import type { HabitColor, Task } from '../domain/types';
import { getHabitIcon, HABIT_COLORS, HABIT_ICONS } from '../domain/habits';
import { Icon } from './Icon';
import { habitStyle } from './habitStyle';

/** Texto e símbolo identificam o hábito mesmo sem percepção de cor. */
export function HabitIdentity({ task }: { task: Task }) {
  return <span className="habit-identity"><Icon name={getHabitIcon(task)} size={14} />Hábito</span>;
}

export function HabitAppearance({ task, onChange }: { task: Task; onChange: (patch: Partial<Task>) => void }) {
  return <div className="task-editor-details habit-appearance" style={habitStyle(task)}>
    <div className="habit-appearance-preview" aria-label="Prévia do hábito">
      <span className="habit-appearance-symbol"><Icon name={getHabitIcon(task)} size={22} /></span>
      <span><strong>{task.title.trim() || 'Seu hábito'}</strong><span className="xs muted">Hábito · registro com um toque</span></span>
    </div>
    <fieldset className="habit-appearance-field">
      <legend className="task-field-label">Ícone</legend>
      <div className="chips">
        <button type="button" className={`chip${!task.habitIcon ? ' on' : ''}`} aria-pressed={!task.habitIcon} onClick={() => onChange({ habitIcon: undefined })}>Automático</button>
        {HABIT_ICONS.map(icon => <button type="button" key={icon.value} className={`icon-btn habit-appearance-option${task.habitIcon === icon.value ? ' selected' : ''}`} aria-label={`Ícone: ${icon.label}`} title={icon.label} aria-pressed={task.habitIcon === icon.value} onClick={() => onChange({ habitIcon: icon.value })}><Icon name={icon.value} size={20} /></button>)}
      </div>
    </fieldset>
    <fieldset className="habit-appearance-field">
      <legend className="task-field-label">Cor</legend>
      <div className="chips">
        <button type="button" className={`chip${!task.habitColor ? ' on' : ''}`} aria-pressed={!task.habitColor} onClick={() => onChange({ habitColor: undefined })}>Automática</button>
        {HABIT_COLORS.map(color => <HabitColorOption key={color.value} task={task} color={color.value} label={color.label} onChange={onChange} />)}
      </div>
    </fieldset>
    <p className="xs muted">Ícone e cor aparecem no Hoje, na lista e no histórico. São opcionais.</p>
  </div>;
}

function HabitColorOption({ task, color, label, onChange }: { task: Task; color: HabitColor; label: string; onChange: (patch: Partial<Task>) => void }) {
  return <button type="button" className={`habit-color-option${task.habitColor === color ? ' selected' : ''}`} style={habitStyle({ ...task, habitColor: color })} aria-label={`Cor: ${label}`} title={label} aria-pressed={task.habitColor === color} onClick={() => onChange({ habitColor: color })}>
    <span className="habit-color-swatch" aria-hidden="true" />
    {task.habitColor === color && <Icon name="check" size={18} stroke={2.5} />}
  </button>;
}
