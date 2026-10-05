/** Ações com feedback (toast + desfazer) usadas em várias telas. */
import { todayISO } from '../domain/dates';
import { itemsForDate } from '../domain/selectors';
import { actions, getState } from '../store/store';
import { toast } from '../store/ui';

export function completeWithFeedback(taskId: string, date = todayISO()) {
  actions.complete(taskId, date);
  const s = getState();
  const left = itemsForDate(s.tasks, todayISO()).filter((i) => !i.done && i.task.kind !== 'event').length;
  const msg = date !== todayISO() ? 'Concluída' : left === 0 ? 'Tudo feito por hoje.' : left === 1 ? 'Concluída · falta 1 hoje' : `Concluída · faltam ${left} hoje`;
  toast(msg, { label: 'Desfazer', run: () => actions.undo() });
}

export function removeWithFeedback(taskId: string) {
  actions.remove(taskId);
  toast('Excluída', { label: 'Desfazer', run: () => actions.undo() });
}

export function archiveWithFeedback(taskId: string) {
  actions.archive(taskId);
  toast('Arquivada', { label: 'Desfazer', run: () => actions.undo() });
}
