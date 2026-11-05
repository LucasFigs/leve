import { todayISO } from '../domain/dates';
import { actions, getState } from '../store/store';
import { closeAllSheets } from '../store/ui';

/**
 * Inicia ou retoma a execução em um toque, sem preparação obrigatória.
 */
export function startTask(taskId: string, date = todayISO()) {
  const state = getState();
  if (!state.tasks.some(t => t.id === taskId)) return;
  closeAllSheets();
  if (state.focus?.taskId === taskId && state.focus.date === date) actions.resumeFocus();
  else {
    if (state.focus) actions.endFocus();
    actions.startFocus(taskId, date, undefined, true);
  }
}
