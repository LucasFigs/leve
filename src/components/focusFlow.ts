import { todayISO } from '../domain/dates';
import { openSheet } from '../store/ui';

/**
 * “Começar agora / Pomodoro”:
 * Abre a seleção otimizada de passos para o usuário escolher o que focar,
 * e em seguida vai para o Pomodoro para dar start.
 */
export function startTask(taskId: string, _date = todayISO()) {
  openSheet({ type: 'breakdown', id: taskId, thenFocus: true });
}
