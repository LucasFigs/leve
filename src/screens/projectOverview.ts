/** Projeção de leitura exclusiva de Projetos. Nunca modifica o histórico. */
import type { Task } from '../domain/types';
import { emptyCatalogFilters, taskCatalog } from './taskCatalog';

export function projectOverview(tasks: Task[], projectId: string, today: string) {
  // Consultar o acervo inteiro preserva exceções movidas para outro projeto.
  const groups = taskCatalog(tasks, {...emptyCatalogFilters(), status:'all', projectId}, today);
  const pending = groups.filter(g=>g.key!=='done' && g.key!=='archived').flatMap(g=>g.rows);
  const history = groups.find(g=>g.key==='done')?.rows ?? [];
  const archived = groups.find(g=>g.key==='archived')?.rows ?? [];
  // Uma exceção continua sendo parte de uma série, não uma etapa do objetivo.
  const punctual = [...pending,...history].filter(({task:t})=>t.kind==='task' && !t.recurrence && !t.seriesId && t.status!=='inbox');
  const done = punctual.filter(r=>r.task.status==='done').length;
  const progress = {total:punctual.length, done, pct:punctual.length ? done/punctual.length : 0};
  const events = pending.filter(r=>r.task.kind==='event');
  const continuous = pending.filter(r=>r.task.kind!=='event' && (r.task.kind==='habit' || !!r.task.recurrence || !!r.task.seriesId));
  const actions = pending.filter(r=>!events.includes(r) && !continuous.includes(r));
  const summary = pending.length
    ? [actions.length && `${actions.length} ${actions.length===1?'pendência':'pendências'}`, events.length && `${events.length} ${events.length===1?'compromisso':'compromissos'}`, continuous.length && `${continuous.length} ${continuous.length===1?'atividade contínua':'atividades contínuas'}`].filter(Boolean).join(' · ')
    : progress.total && done===progress.total ? 'Tarefas pontuais concluídas' : history.length || archived.length ? 'Sem pendências atuais' : 'Adicione a primeira tarefa';
  return {progress, summary, actions, events, continuous, history, archived, pending};
}
