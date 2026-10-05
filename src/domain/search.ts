/** Busca global com um pouco de linguagem natural. */
import type { AppState, Project, Task } from './types';
import { addDays, formatDay, todayISO } from './dates';
import { extractDate, normalize } from './parser';
import { itemsForDate, overdueTasks } from './selectors';

export interface SearchGroup {
  label: string;
  tasks: Task[];
}

export interface SearchResult {
  /** como a consulta foi entendida, quando houver interpretação */
  understood?: string;
  groups: SearchGroup[];
  projects: Project[];
}

const STOP = /\b(o que|que|eu|tinha|tenho|para|pra|fazer|de|do|da|as|os|a|o|minhas?|meus?|tarefas?|coisas?|mostrar|ver|quais|qual)\b/g;

export function search(query: string, state: AppState): SearchResult {
  const q = normalize(query).trim();
  const today = todayISO();
  const live = state.tasks.filter((t) => t.status !== 'archived');
  if (!q) return { groups: [], projects: [] };

  if (/\batrasad/.test(q)) {
    return { understood: 'Tarefas atrasadas', groups: [{ label: 'Atrasadas', tasks: overdueTasks(live, today) }], projects: [] };
  }
  if (/\b(inbox|capturas?|caixa de entrada)\b/.test(q)) {
    return { understood: 'Capturas no Inbox', groups: [{ label: 'Inbox', tasks: live.filter((t) => t.status === 'inbox') }], projects: [] };
  }
  if (/\b(sem data|quando der|sem dia)\b/.test(q)) {
    return {
      understood: 'Tarefas sem data',
      groups: [{ label: 'Quando der', tasks: live.filter((t) => t.status === 'active' && !t.date && !t.recurrence) }],
      projects: [],
    };
  }
  if (/\b(essencia(l|is)|urgentes?|prioritari)/.test(q)) {
    return {
      understood: 'Tarefas essenciais',
      groups: [{ label: 'Essenciais', tasks: live.filter((t) => t.priority === 'essential' && t.status !== 'done') }],
      projects: [],
    };
  }

  const projectMatch = q.match(/\bprojeto\s+(.+)$/);
  if (projectMatch) {
    const name = projectMatch[1].trim();
    const proj = state.projects.find((p) => normalize(p.name).includes(name));
    if (proj) {
      const tasks = live.filter((t) => t.projectId === proj.id);
      return {
        understood: `Projeto ${proj.name}`,
        groups: [
          { label: 'Pendentes', tasks: tasks.filter((t) => t.status !== 'done') },
          { label: 'Concluídas', tasks: tasks.filter((t) => t.status === 'done') },
        ],
        projects: [proj],
      };
    }
  }

  const wantsDone = /\b(conclu[ií]d|feit[ao]s?|terminad|fiz)\b/.test(q);
  const date = /\bontem\b/.test(q) ? addDays(today, -1) : /\b(hoje|amanha|semana que vem|segunda|terca|quarta|quinta|sexta|sabado|domingo|dia \d)/.test(q) ? extractDate(q) : undefined;

  if (date) {
    const items = itemsForDate(live, date);
    const tasks = items.filter((i) => (wantsDone ? i.done : true)).map((i) => i.task);
    return { understood: `${wantsDone ? 'Concluídas' : 'Agenda'} · ${formatDay(date, today)}`, groups: [{ label: formatDay(date, today), tasks }], projects: [] };
  }

  if (wantsDone && q.replace(STOP, '').replace(/\b(conclu[ií]d\w*|feit[ao]s?|terminad\w*|fiz)\b/g, '').trim() === '') {
    const done = live.filter((t) => t.status === 'done').sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    return { understood: 'Tarefas concluídas', groups: [{ label: 'Concluídas', tasks: done.slice(0, 50) }], projects: [] };
  }

  // Busca textual
  const terms = q.replace(STOP, ' ').split(/\s+/).filter((w) => w.length > 1);
  const words = terms.length ? terms : [q];
  const hay = (t: Task) => normalize([t.title, t.notes ?? '', ...t.subtasks.map((s) => s.title)].join(' '));
  const matches = live.filter((t) => {
    const h = hay(t);
    return words.every((w) => h.includes(w));
  });
  const projects = state.projects.filter((p) => !p.archived && words.every((w) => normalize(p.name).includes(w)));
  return {
    groups: [
      { label: 'Tarefas', tasks: matches.filter((t) => t.kind !== 'event' && t.status !== 'done') },
      { label: 'Compromissos', tasks: matches.filter((t) => t.kind === 'event' && t.status !== 'done') },
      { label: 'Concluídas', tasks: matches.filter((t) => t.status === 'done') },
    ].filter((g) => g.tasks.length),
    projects,
  };
}
