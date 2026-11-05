import { getState } from '../store/store';
import { openSheet, toast } from '../store/ui';
import { isDate } from '../domain/validation';

interface Intent { taskId: string; date?: string; owner?: string }
let pending: Intent | undefined;
let warnedOwner: string | undefined;
function validId(value: unknown): value is string { return typeof value === 'string' && value.length > 0 && value.length <= 200 && !/[\s\x00-\x1f]/.test(value); }
export function rememberNotification(value: {taskId?: unknown;date?: unknown;owner?: unknown}) {
  if (!validId(value.taskId) || (value.date != null && !isDate(value.date)) || (value.owner != null && !validId(value.owner))) return;
  pending = { taskId:value.taskId,date:value.date as string | undefined,owner:value.owner as string | undefined };
  warnedOwner = undefined;
}
export function rememberNotificationUrl() {
  const query = new URLSearchParams(location.search);
  if (query.has('task')) rememberNotification({taskId:query.get('task'),date:query.get('date') ?? undefined,owner:query.get('owner') ?? undefined});
}
/** Chamado somente após autenticação e leitura inicial confirmada; não consome a intenção durante o login. */
export function resumeNotification(ready: boolean, owner?: string) {
  if (!ready || !pending) return;
  const intent = pending;
  if (intent.owner && intent.owner !== owner) {
    if (warnedOwner !== owner) toast('Este lembrete pertence a outra conta. Entre na conta que recebeu o aviso.');
    warnedOwner = owner;
    return;
  } else if (getState().tasks.some(t => t.id === intent.taskId)) {
    openSheet({type:'task',id:intent.taskId,date:intent.date});
  } else toast('Esta atividade não está disponível nesta conta. Ela pode ter sido excluída.');
  pending = undefined;
  const url = new URL(location.href);
  for (const key of ['task','date','owner']) url.searchParams.delete(key);
  history.replaceState(null,'',url.pathname+url.search+url.hash);
}
