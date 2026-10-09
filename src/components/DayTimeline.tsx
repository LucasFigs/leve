import { useEffect, useRef } from 'react';
import type { DayItem } from '../domain/types';
import { formatDuration, minToTime, nowMin, pad, timeToMin, todayISO } from '../domain/dates';
import { useStore } from '../store/store';
import { openSheet } from '../store/ui';
import { Icon } from './Icon';

interface Props {
  date: string;
  items: DayItem[];
  hourHeight?: number;
  scrollToNow?: boolean;
}

interface Positioned {
  item: DayItem;
  start: number;
  end: number;
  lane: number;
  lanes: number;
}

/** Distribui blocos sobrepostos em colunas. */
function layout(items: DayItem[]): Positioned[] {
  const timed = items
    .filter((i) => i.time)
    // Altura proporcional à duração real (30 min = meia hora); mínimo de 15 min só para caber o título
    .map((i) => ({ item: i, start: timeToMin(i.time!), end: timeToMin(i.time!) + Math.max(i.duration, 15), lane: 0, lanes: 1 }))
    .sort((a, b) => a.start - b.start);
  let group: Positioned[] = [];
  let groupEnd = -1;
  const flush = () => {
    const lanes = Math.max(1, ...group.map((g) => g.lane + 1));
    group.forEach((g) => (g.lanes = lanes));
    group = [];
  };
  for (const p of timed) {
    if (p.start >= groupEnd) {
      flush();
      groupEnd = -1;
    }
    const used = new Set(group.filter((g) => g.end > p.start).map((g) => g.lane));
    let lane = 0;
    while (used.has(lane)) lane++;
    p.lane = lane;
    group.push(p);
    groupEnd = Math.max(groupEnd, p.end);
  }
  flush();
  return timed;
}

export function DayTimeline({ date, items, hourHeight = 60, scrollToNow }: Props) {
  const settings = useStore((s) => s.settings);
  const nowRef = useRef<HTMLDivElement>(null);
  const positioned = layout(items);
  const isToday = date === todayISO();
  const now = nowMin();

  const firstItem = positioned[0]?.start ?? Infinity;
  const lastItem = Math.max(0, ...positioned.map((p) => p.end));
  const startHour = Math.max(0, Math.min(Math.floor(timeToMin(settings.dayStart) / 60), Math.floor(firstItem / 60)));
  const endHour = Math.min(24, Math.max(Math.ceil(timeToMin(settings.dayEnd) / 60), Math.ceil(lastItem / 60)));
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);
  const y = (min: number) => ((min - startHour * 60) / 60) * hourHeight;

  useEffect(() => {
    if (scrollToNow && isToday) nowRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [scrollToNow, isToday]);

  return (
    <div className="timeline" style={{ height: hours.length * hourHeight }}>
      {hours.map((h) => (
        <div key={h} className="hour" style={{ height: hourHeight }}>
          <span className="hour-label num">{pad(h)}:00</span>
          <button
            className="hour-slot"
            aria-label={`Adicionar às ${pad(h)}:00`}
            onClick={() => openSheet({ type: 'quickAdd', defaults: { date, time: `${pad(h)}:00` } })}
          />
        </div>
      ))}
      {positioned.map(({ item, start, end, lane, lanes }) => {
        const t = item.task;
        const kind = t.kind === 'event' ? 'event' : t.kind === 'habit' ? 'habit' : `block-task ${t.priority ?? ''}`;
        const height = Math.max(((end - start) / 60) * hourHeight - 2, 16);
        return (
          <button
            key={t.id + item.date}
            className={`block ${kind}${item.missed ? ' missed' : item.done ? ' done' : isToday && end <= now ? ' past' : ''}${height < 36 ? ' compact' : ''}${height < 24 ? ' tiny' : ''}`}
            style={{
              top: y(start) + 1,
              height,
              left: `calc(6px + ${(lane / lanes) * 100}% - ${(lane / lanes) * 12}px)`,
              right: 'auto',
              width: `calc(${100 / lanes}% - ${12 / lanes + 2}px)`,
            }}
            onClick={() => openSheet({ type: 'task', id: t.id, date: item.date })}
            aria-label={`${t.title}, ${item.time}–${minToTime(timeToMin(item.time!) + item.duration)}, ${formatDuration(item.duration)}${item.missed ? ', não aconteceu' : ''}`}
          >
            <span className="block-title">
              {height < 36 && <span className="num block-time">{item.time} </span>}
              {t.title}
            </span>
            {height > 40 && (
              <span className="block-meta num">
                {t.kind === 'habit' && <Icon name="repeat" size={11} />}
                {item.time}–{minToTime(timeToMin(item.time!) + item.duration)}
                {t.kind !== 'event' && ` · ${formatDuration(item.duration)}`}
                {item.missed && ' · não aconteceu'}
              </span>
            )}
          </button>
        );
      })}
      {isToday && now >= startHour * 60 && now <= endHour * 60 && (
        <div ref={nowRef} className="now-line" style={{ top: y(now) }} aria-hidden="true" />
      )}
    </div>
  );
}
