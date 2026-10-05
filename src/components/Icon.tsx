/** Conjunto de ícones em traço fino (24×24). */
const PATHS: Record<string, string> = {
  sun: 'M12 3v1.5M12 19.5V21M4.6 4.6l1.1 1.1M18.3 18.3l1.1 1.1M3 12h1.5M19.5 12H21M4.6 19.4l1.1-1.1M18.3 5.7l1.1-1.1M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z',
  calendar: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  inbox: 'M4 13h4l1.5 3h5L16 13h4M5.5 5h13L21 13v5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-5L5.5 5Z',
  folder: 'M3.5 7.5A1.5 1.5 0 0 1 5 6h4l2 2h8a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 19H5a1.5 1.5 0 0 1-1.5-1.5v-10Z',
  user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0',
  plus: 'M12 5v14M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  play: 'M8 5.5v13a.5.5 0 0 0 .77.42l10-6.5a.5.5 0 0 0 0-.84l-10-6.5A.5.5 0 0 0 8 5.5Z',
  pause: 'M8 5v14M16 5v14',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14ZM20 20l-4-4',
  x: 'M6 6l12 12M18 6 6 18',
  'chevron-left': 'M15 5l-7 7 7 7',
  'chevron-right': 'M9 5l7 7-7 7',
  'chevron-down': 'M5 9l7 7 7-7',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7v5l3 2',
  repeat: 'M17 3l3 3-3 3M4 11V9a3 3 0 0 1 3-3h13M7 21l-3-3 3-3M20 13v2a3 3 0 0 1-3 3H4',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  sparkles: 'M10 3l1.6 4.4L16 9l-4.4 1.6L10 15l-1.6-4.4L4 9l4.4-1.6L10 3ZM18 14l.8 2.2L21 17l-2.2.8L18 20l-.8-2.2L15 17l2.2-.8L18 14Z',
  trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3',
  archive: 'M4 4h16v4H4zM5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8M10 12h4',
  'arrow-right': 'M5 12h14M13 6l6 6-6 6',
  'arrow-up': 'M12 19V5M6 11l6-6 6 6',
  split: 'M6 4v6a4 4 0 0 0 4 4h8M6 4v16M14 10l4 4-4 4',
  list: 'M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01',
  'calendar-plus': 'M7 3v3M17 3v3M4 9h16M12 12v6M9 15h6M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  'calendar-arrow': 'M7 3v3M17 3v3M4 9h16M10 15h6M14 12.5 16.5 15 14 17.5M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z',
  hourglass: 'M6 3h12M6 21h12M7 3c0 5 5 6 5 9s-5 4-5 9M17 3c0 5-5 6-5 9s5 4 5 9',
  wand: 'M15 4V2M15 10V8M11 6h2M17 6h2M4 20 14 10M17.5 12.5l.5 1.5M20 11l-1.5.5',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10ZM12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z',
  coffee: 'M5 8h12v5a5 5 0 0 1-5 5h-2a5 5 0 0 1-5-5V8ZM17 9h1.5a2.5 2.5 0 0 1 0 5H17M8 3v2M11 3v2M14 3v2',
  bolt: 'M13 3 5 14h6l-1 7 8-11h-6l1-7Z',
  edit: 'M4 20h4L19 9l-4-4L4 16v4ZM13.5 6.5l4 4',
  note: 'M6 3h9l4 4v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM9 12h6M9 16h4',
  undo: 'M9 14 4 9l5-5M4 9h11a5 5 0 0 1 0 10h-3',
  settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19.4 13.5a7.6 7.6 0 0 0 0-3l2-1.5-2-3.4-2.3 1a7.6 7.6 0 0 0-2.6-1.5L14 2.5h-4l-.5 2.6a7.6 7.6 0 0 0-2.6 1.5l-2.3-1-2 3.4 2 1.5a7.6 7.6 0 0 0 0 3l-2 1.5 2 3.4 2.3-1a7.6 7.6 0 0 0 2.6 1.5l.5 2.6h4l.5-2.6a7.6 7.6 0 0 0 2.6-1.5l2.3 1 2-3.4-2-1.5Z',
  cloud: 'M7 18a4.5 4.5 0 0 1-.5-8.97A6 6 0 0 1 18 9.5a4.25 4.25 0 0 1-.5 8.5H7Z',
  logout: 'M15 4h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-3M10 16l-4-4 4-4M6 12h10',
  download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  share: 'M12 15V3M8 7l4-4 4 4M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1',
  leaf: 'M5 19c0-8 5-14 15-14 0 10-6 15-14 15M5 19c3-4 6-7 10-9',
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20, stroke = 1.8, className, fill }: {
  name: IconName;
  size?: number;
  stroke?: number;
  className?: string;
  fill?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
