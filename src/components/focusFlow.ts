import { todayISO } from '../domain/dates';
import { parse } from '../domain/parser';
import { actions, getState } from '../store/store';
import { openSheet } from '../store/ui';

/** Tarefa grande ou muito adiada: vale revisar os passos antes de começar. */
export function needsBreakdown(taskId: string): boolean {
  const t = getState().tasks.find((x) => x.id === taskId);
  if (!t || t.kind !== 'task') return false;
  if (t.subtasks.length) return true;
  return (t.duration ?? 0) >= 60 || t.postponed >= 3 || parse(t.title).big;
}

/** “Começar agora”: se a tarefa for grande, sugere começar por 10 minutos. */
export function startTask(taskId: string, date = todayISO()) {
  if (needsBreakdown(taskId)) {
    openSheet({ type: 'breakdown', id: taskId, thenFocus: true });
    return;
  }
  actions.startFocus(taskId, date);
}
