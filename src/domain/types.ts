export type Priority = 'essential' | 'important' | 'optional';
export type Kind = 'task' | 'event' | 'habit';
export type Status = 'inbox' | 'active' | 'done' | 'archived';
export type Energy = 'low' | 'medium' | 'high';
export type Category = 'trabalho' | 'pessoal' | 'saude' | 'casa' | 'financas' | 'estudos';
export type DayPart = 'morning' | 'afternoon' | 'evening';

export type Freq = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Recurrence {
  /** 'interval' = formato antigo de “a cada N dias” (equivale a daily + interval) */
  freq: Freq | 'interval';
  /** a cada N dias/semanas/meses/anos (padrão 1) */
  interval?: number;
  /** 0 = domingo … 6 = sábado (weekly) */
  weekdays?: number[];
  /** dia do mês (monthly/yearly) */
  monthDay?: number;
  /** “na 2ª terça”: posição 1–4 ou -1 = última (monthly/yearly, junto com `weekday`) */
  nth?: number;
  weekday?: number;
  /** mês 0–11 (yearly) */
  month?: number;
  /** primeira data da série (YYYY-MM-DD) */
  anchor: string;
  /** termina nesta data (inclusive) */
  until?: string;
  /** termina após N ocorrências */
  count?: number;
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
  /** ocorrências puladas ou editadas à parte (tarefas recorrentes) */
  skipDates?: string[];
  /** compromissos recorrentes: ocorrências que não aconteceram */
  missedDates?: string[];
  /** compromisso que não aconteceu (status 'done' + missed) */
  missed?: boolean;
  /** ocorrência editada à parte: série de origem e data original */
  seriesId?: string;
  seriesDate?: string;
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
  /** avisar antes de tarefas e compromissos com horário */
  reminders?: boolean;
  /** quantos minutos antes avisar */
  reminderLead?: number;
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
  /** compromisso marcado como “não aconteceu” */
  missed: boolean;
  recurring: boolean;
}
