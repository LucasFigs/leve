import { describe, it, expect } from 'vitest';
import { toRfc3339, taskToGoogleEventPayload } from './googleCalendar';
import type { Task } from '../domain/types';

describe('Google Calendar Service', () => {
  describe('toRfc3339', () => {
    it('formats date and time with proper RFC 3339 timezone offset', () => {
      const result = toRfc3339('2026-10-17', '14:30', 45);

      // Deve começar com data e hora ISO
      expect(result.start).toMatch(/^2026-10-17T14:30:00[+-]\d{2}:\d{2}$/);
      expect(result.end).toMatch(/^2026-10-17T15:15:00[+-]\d{2}:\d{2}$/);
    });

    it('pads single-digit hours and minutes correctly', () => {
      const result = toRfc3339('2026-10-17', '9:5', 30);

      expect(result.start).toMatch(/^2026-10-17T09:05:00[+-]\d{2}:\d{2}$/);
      expect(result.end).toMatch(/^2026-10-17T09:35:00[+-]\d{2}:\d{2}$/);
    });

    it('handles durations rolling over past midnight', () => {
      const result = toRfc3339('2026-10-17', '23:30', 60);

      expect(result.start).toMatch(/^2026-10-17T23:30:00[+-]\d{2}:\d{2}$/);
      expect(result.end).toMatch(/^2026-10-18T00:30:00[+-]\d{2}:\d{2}$/);
    });
  });

  describe('taskToGoogleEventPayload', () => {
    const baseTask: Task = {
      id: 'task-1',
      title: 'Reunião de Alinhamento',
      kind: 'event',
      status: 'active',
      date: '2026-10-17',
      time: '10:00',
      duration: 60,
      notes: 'Trazer métricas do mês',
      subtasks: [],
      postponed: 0,
      createdAt: 1000,
      updatedAt: 1000,
    };

    it('creates payload for timed event with RFC 3339 start and end', () => {
      const payload = taskToGoogleEventPayload(baseTask, 'America/Sao_Paulo');

      expect(payload).not.toBeNull();
      expect(payload?.summary).toBe('Reunião de Alinhamento');
      expect(payload?.description).toContain('Trazer métricas do mês');
      expect(payload?.description).toContain('Compromisso');
      expect(payload?.start.timeZone).toBe('America/Sao_Paulo');
      expect(payload?.start.dateTime).toMatch(/^2026-10-17T10:00:00[+-]\d{2}:\d{2}$/);
      expect(payload?.end.dateTime).toMatch(/^2026-10-17T11:00:00[+-]\d{2}:\d{2}$/);
    });

    it('creates payload for all-day task with exclusive end date (next day)', () => {
      const allDayTask: Task = {
        ...baseTask,
        time: undefined,
        duration: undefined,
      };

      const payload = taskToGoogleEventPayload(allDayTask, 'America/Sao_Paulo');

      expect(payload).not.toBeNull();
      expect(payload?.start).toEqual({ date: '2026-10-17' });
      expect(payload?.end).toEqual({ date: '2026-10-18' });
    });

    it('prepends checkmark to summary when task is done', () => {
      const doneTask: Task = {
        ...baseTask,
        status: 'done',
      };

      const payload = taskToGoogleEventPayload(doneTask, 'America/Sao_Paulo');
      expect(payload?.summary).toBe('✓ Reunião de Alinhamento');
    });

    it('returns null if task has neither date nor recurrence anchor', () => {
      const noDateTask: Task = {
        ...baseTask,
        date: undefined,
        recurrence: undefined,
      };

      const payload = taskToGoogleEventPayload(noDateTask, 'America/Sao_Paulo');
      expect(payload).toBeNull();
    });

    it('adds RRULE recurrence for recurring tasks', () => {
      const recurringTask: Task = {
        ...baseTask,
        date: undefined,
        recurrence: {
          freq: 'weekly',
          anchor: '2026-10-17',
          weekdays: [1, 3, 5],
        },
      };

      const payload = taskToGoogleEventPayload(recurringTask, 'America/Sao_Paulo');
      expect(payload?.recurrence).toBeDefined();
      expect(payload?.recurrence[0]).toContain('RRULE:FREQ=WEEKLY');
      expect(payload?.recurrence[0]).toContain('BYDAY=MO,WE,FR');
    });
  });
});

