export type Priority = 'essential' | 'important' | 'optional';
export type Kind = 'task' | 'event' | 'habit';
export type Status = 'inbox' | 'active' | 'done' | 'archived';
export type Energy = 'low' | 'medium' | 'high';
export type Category = 'trabalho' | 'pessoal' | 'saude' | 'casa' | 'financas' | 'estudos';
export type DayPart = 'morning' | 'afternoon' | 'evening';

export interface Recurrence {
  freq: 'daily' | 'weekly' | 'monthly' | 'interval';
  /** 0 = domingo … 6 = sábado (weekly) */
  weekdays?: number[];
  /** dia do mês (monthly) */
  monthDay?: number;
  /** a cada N dias (interval) */
  interval?: number;
  /** data inicial (YYYY-MM-DD) */
  anchor: string;
}

export interface Subtask {
  id: string;
  title: string;
  done: boolean;
}

export interface Task {
  id: string;
  title: string;
  notes?: string;
  kind: Kind;
  status: Status;
  priority?: Priority;
  /** dia planejado (YYYY-MM-DD) */
  date?: string;
  /** horário (HH:mm) */
  time?: string;
  /** duração em minutos */
  duration?: number;
  /** prazo final (YYYY-MM-DD) */
  due?: string;
  dayPart?: DayPart;
  projectId?: string;
  category?: Category;
  energy?: Energy;
  recurrence?: Recurrence;
  /** ocorrências concluídas (tarefas recorrentes) */
  doneDates?: string[];
  /** ocorrências puladas (tarefas recorrentes) */
  skipDates?: string[];
  subtasks: Subtask[];
  /** quantas vezes foi adiada */
  postponed: number;
  focusMinutes?: number;
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
}

export interface Project {
  id: string;
  name: string;
  emoji: string;
  color: string;
  createdAt: number;
  archived?: boolean;
}

export interface Settings {
  name: string;
  theme: 'system' | 'light' | 'dark';
  dayStart: string;
  dayEnd: string;
  defaultDuration: number;
  protectLunch: boolean;
  /** início e fim do almoço protegido (HH:mm) */
  lunchStart: string;
  lunchEnd: string;
  nudges: boolean;
  onboarded: boolean;
}

export interface FocusSession {
  taskId: string;
  date: string;
  startedAt: number;
  /** ms acumulados antes da última retomada */
  elapsedBefore: number;
  running: boolean;
  /** duração-alvo em minutos (modo “só 10 minutos”) */
  target?: number;
}

export interface AppState {
  version: 1;
  tasks: Task[];
  projects: Project[];
  settings: Settings;
  /** chave da sugestão → data em que foi dispensada */
  dismissed: Record<string, string>;
  focus?: FocusSession;
}

/** Uma ocorrência concreta de uma tarefa em um dia. */
export interface DayItem {
  task: Task;
  date: string;
  time?: string;
  duration: number;
  done: boolean;
  recurring: boolean;
}
