/**
 * Fronteira da “inteligência” do app.
 *
 * Hoje tudo roda localmente com heurísticas (rápido e offline).
 * Para usar um modelo de IA no futuro, basta criar outra implementação
 * de `Assistant` e trocá-la em `assistant` — a interface não muda.
 */
import type { Settings, Task } from '../domain/types';
import { parse, type ParseOptions, type Parsed } from '../domain/parser';
import { suggestBreakdown } from '../domain/breakdown';
import { suggestForTask, type Suggestion } from '../domain/organize';
import { planDay, planWeek, type DayPlan, type WeekAssignment } from '../domain/planner';

export interface Assistant {
  interpret(text: string, opts?: ParseOptions): Parsed;
  suggest(task: Task, tasks: Task[], settings: Settings): Suggestion;
  breakdown(task: Task): string[];
  planDay(tasks: Task[], date: string, settings: Settings): DayPlan;
  planWeek(tasks: Task[], settings: Settings, preferred?: Record<string, string>): WeekAssignment[];
}

export const localAssistant: Assistant = {
  interpret: (text, opts) => parse(text, opts),
  suggest: suggestForTask,
  breakdown: (task) => suggestBreakdown(task.title),
  planDay: (tasks, date, settings) => planDay(tasks, date, settings),
  planWeek,
};

export const assistant: Assistant = localAssistant;
