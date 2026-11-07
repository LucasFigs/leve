/** Projeção de consulta do acervo. Não altera registros nem regras de recorrência. */
import type { Category, Kind, Priority, Task } from '../domain/types';
import { nextOccurrence } from '../domain/recurrence';
import { normalize } from '../domain/parser';

export interface CatalogFilters {
  q: string;
  status: 'open' | 'done' | 'all';
  kind: Kind | '';
  priority: Priority | 'none' | '';
  projectId: string;
  category: Category | 'none' | '';
  undated: boolean;
}
export const emptyCatalogFilters = (): CatalogFilters => ({q:'',status:'open',kind:'',priority:'',projectId:'',category:'',undated:false});
export interface CatalogRow { task: Task; date?: string; ended: boolean; }
export interface CatalogGroup { key: string; title: string; rows: CatalogRow[]; }
const priorityOrder = {essential:0,important:1,optional:2};

export function taskCatalog(tasks: Task[], filters: CatalogFilters, today: string): CatalogGroup[] {
  const replacements = new Map<string,string[]>();
  // A exceção pode chegar antes de skipDates e estar oculta por um filtro.
  for (const task of tasks) if (!task.recurrence && task.seriesId && task.seriesDate) {
    const dates = replacements.get(task.seriesId) ?? []; dates.push(task.seriesDate); replacements.set(task.seriesId,dates);
  }
  const needle = normalize(filters.q.trim());
  const groups: CatalogGroup[] = [
    {key:'attention',title:'Precisam de atenção',rows:[]},
    {key:'planned',title:'Com data definida',rows:[]},
    {key:'undated',title:'Sem data definida',rows:[]},
    {key:'recurring',title:'Recorrentes',rows:[]},
    {key:'inbox',title:'Capturas do Inbox',rows:[]},
    {key:'done',title:'Concluídas e encerradas',rows:[]},
    {key:'archived',title:'Arquivadas',rows:[]},
  ];
  const byKey = Object.fromEntries(groups.map(g=>[g.key,g]));
  for (const task of tasks) {
    if (needle && !normalize(`${task.title} ${task.notes ?? ''} ${task.subtasks.map(s=>s.title).join(' ')}`).includes(needle)) continue;
    if (filters.kind && task.kind!==filters.kind || filters.priority && (filters.priority==='none'?!!task.priority:task.priority!==filters.priority) || filters.projectId && (filters.projectId==='none'?!!task.projectId:task.projectId!==filters.projectId) || filters.category && (filters.category==='none'?!!task.category:task.category!==filters.category)) continue;
    if (filters.undated && (task.status==='inbox' || task.date || task.recurrence)) continue;
    let date=task.date,ended=false;
    if (task.recurrence) {
      const skip=[...(task.skipDates??[]),...(replacements.get(task.id)??[])];
      const scheduled=nextOccurrence(task.recurrence,today,skip);
      ended=!scheduled;
      const completed=[...(task.doneDates??[]),...(task.missedDates??[])];
      date=completed.length ? nextOccurrence(task.recurrence,today,[...skip,...completed]) ?? scheduled : scheduled;
    }
    const closed=task.status==='done' || task.status==='active' && ended;
    if (filters.status==='open' && (closed || task.status==='archived')) continue;
    if (filters.status==='done' && !closed) continue;
    let key:string;
    if (task.status==='archived') key='archived';
    else if (closed) key='done';
    else if (task.status==='inbox') key='inbox';
    else if (task.recurrence) key='recurring';
    else if (task.date && task.date<today || task.due && task.due<today) key='attention';
    else key=task.date?'planned':'undated';
    byKey[key].rows.push({task,date,ended});
  }
  for (const group of groups) group.rows.sort((a,b)=> {
    if (group.key==='done') return (b.task.completedAt??b.task.updatedAt)-(a.task.completedAt??a.task.updatedAt) || a.task.id.localeCompare(b.task.id);
    return (a.date??'9999').localeCompare(b.date??'9999') || (a.task.time??'99:99').localeCompare(b.task.time??'99:99') || (priorityOrder[a.task.priority??'optional']-priorityOrder[b.task.priority??'optional']) || b.task.createdAt-a.task.createdAt || a.task.id.localeCompare(b.task.id);
  });
  return groups.filter(g=>g.rows.length);
}
