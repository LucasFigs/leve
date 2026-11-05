import type { CSSProperties } from 'react';
import type { Task } from '../domain/types';
import { getHabitTheme } from '../domain/habits';

export function habitStyle(task: Task): CSSProperties {
  const theme = getHabitTheme(task);
  return {
    '--habit-primary': theme.primary, '--habit-glow': theme.glow,
    '--habit-bg': theme.bgLight, '--habit-border': theme.border,
  } as CSSProperties;
}
