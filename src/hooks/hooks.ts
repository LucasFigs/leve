import { useEffect, useMemo, useState } from 'react';
import { nowMin, todayISO } from '../domain/dates';
import { itemsForDate, overdueTasks, unscheduledTasks } from '../domain/selectors';
import { useStore } from '../store/store';

/** Re-renderiza a cada minuto (relógio do app). */
export function useClock(intervalMs = 30_000) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), intervalMs);
    const onVis = () => document.visibilityState === 'visible' && setTick((t) => t + 1);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [intervalMs]);
  return { today: todayISO(), now: nowMin() };
}

export function useDay(date: string) {
  const tasks = useStore((s) => s.tasks);
  const fallback = useStore((s) => s.settings.defaultDuration);
  return useMemo(() => itemsForDate(tasks, date, fallback), [tasks, date, fallback]);
}

export function useTodayContext() {
  const { today, now } = useClock();
  const tasks = useStore((s) => s.tasks);
  const settings = useStore((s) => s.settings);
  const items = useDay(today);
  const overdue = useMemo(() => overdueTasks(tasks, today), [tasks, today]);
  const unscheduled = useMemo(() => unscheduledTasks(tasks), [tasks]);
  return { today, now, items, overdue, unscheduled, settings, tasks };
}

export function useMediaQuery(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}
