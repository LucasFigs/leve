import { useEffect, useMemo } from 'react';
import { StorageNotice } from './components/StorageNotice';
import { inboxTasks } from './domain/selectors';
import { useStore } from './store/store';
import { goTo, openSheet, useUI, type Sheet, type Tab } from './store/ui';
import { Icon, type IconName } from './components/Icon';
import { Toasts } from './components/ui';
import { TodayScreen } from './screens/Today';
import { AgendaScreen } from './screens/Agenda';
import { HabitsScreen } from './screens/Habits';
import { InboxScreen } from './screens/Inbox';
import { ProjectsScreen } from './screens/Projects';
import { TasksScreen } from './screens/Tasks';
import { ProfileScreen } from './screens/Profile';
import { FocusMode } from './screens/Focus';
import { Onboarding } from './screens/Onboarding';
import { Login, Splash } from './screens/Login';
import { canUseOffline, cloudEnabled, useCloud } from './store/sync';
import { TaskSheet } from './sheets/TaskSheet';
import { HabitCalendarSheet } from './sheets/HabitCalendarSheet';
import { BreakdownSheet, EventMissedSheet, PlanSheet, ReplanSheet, ReviewSheet, WeekSheet } from './sheets/PlanningSheets';
import { ProjectSheet, QuickAddSheet, SearchSheet } from './sheets/OtherSheets';
import { AccountMenuSheet } from './sheets/AccountMenu';
import { startReminders } from './services/reminders';
import { refreshPush } from './services/push';
import { initGoogleCalendarListener, restoreGoogleCalendarConnection } from './services/googleCalendar';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'today', label: 'Hoje', icon: 'sun' },
  { id: 'agenda', label: 'Agenda', icon: 'calendar' },
  { id: 'habits', label: 'Hábitos', icon: 'repeat' },
  { id: 'inbox', label: 'Inbox', icon: 'inbox' },
  { id: 'tasks', label: 'Tarefas', icon: 'list' },
  { id: 'projects', label: 'Projetos', icon: 'folder' },
  { id: 'profile', label: 'Perfil', icon: 'user' },
];

function useTheme() {
  const theme = useStore((s) => s.settings.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', theme);
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c0c0f' : '#f4f4f6');
    };
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [theme]);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat || e.isComposing) return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      const el = e.target as HTMLElement;
      const typing = el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable;
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openSheet({ type: 'search' });
      } else if (!typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (e.key === 'n' || e.key === 'c') {
          e.preventDefault();
          openSheet({ type: 'quickAdd' });
        } else if (e.key === '/') {
          e.preventDefault();
          openSheet({ type: 'search' });
        } else if (/^[1-6]$/.test(e.key)) goTo(TABS[+e.key - 1].id);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}

function SheetHost({ sheet }: { sheet?: Sheet }) {
  if (!sheet) return null;
  switch (sheet.type) {
    case 'quickAdd':
      return <QuickAddSheet defaults={sheet.defaults} />;
    case 'task':
      return <TaskSheet key={`${sheet.id}:${sheet.date ?? ''}:${sheet.mode ?? ''}`} id={sheet.id} date={sheet.date} mode={sheet.mode} />;
    case 'newTask':
      return <TaskSheet key={sheet.task.id} initial={sheet.task} />;
    case 'eventMissed':
      return <EventMissedSheet id={sheet.id} date={sheet.date} />;
    case 'plan':
      return <PlanSheet date={sheet.date} />;
    case 'review':
      return <ReviewSheet />;
    case 'week':
      return <WeekSheet />;
    case 'replan':
      return <ReplanSheet id={sheet.id} date={sheet.date} />;
    case 'breakdown':
      return <BreakdownSheet id={sheet.id} thenFocus={sheet.thenFocus} />;
    case 'habitCalendar':
      return <HabitCalendarSheet key={sheet.id} id={sheet.id} />;
    case 'project':
      return <ProjectSheet key={sheet.id ?? 'new'} id={sheet.id} />;
    case 'search':
      return <SearchSheet />;
    case 'account':
      return <AccountMenuSheet />;
  }
}

export default function App() {
  return <><StorageNotice /><Application /></>;
}

function Application() {
  useTheme();
  useShortcuts();
  useEffect(() => startReminders(), []);
  useEffect(() => initGoogleCalendarListener(), []);
  const onboarded = useStore((s) => s.settings.onboarded);
  const tasks = useStore((s) => s.tasks);
  const tab = useUI((u) => u.tab);
  const sheet = useUI((u) => u.sheet);
  const inboxCount = useMemo(() => inboxTasks(tasks).length, [tasks]);
  const auth = useCloud((c) => c.auth);
  const accountEmail = useCloud((c) => c.email);
  const recovery = useCloud((c) => c.recovery);
  const syncStatus = useCloud((c) => c.status);
  const cloudReady = auth === 'in' && syncStatus !== 'loading';
  useEffect(() => {
    if (auth === 'in') refreshPush();
  }, [auth]);
  useEffect(() => {
    if (!cloudReady) return;
    const restore = () => { if (navigator.onLine) void restoreGoogleCalendarConnection(); };
    restore();
    window.addEventListener('online', restore);
    const visible = () => { if (document.visibilityState === 'visible') restore(); };
    document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('online', restore); document.removeEventListener('visibilitychange', visible); };
  }, [cloudReady, accountEmail]);

  if (cloudEnabled) {
    if (auth === 'loading') return <Splash text="" />;
    if (recovery || (auth === 'out' && !canUseOffline())) return <Login />;
    if (syncStatus === 'loading') return <Splash />;
  }
  if (!onboarded) return <Onboarding />;

  const screen = {
    today: <TodayScreen />,
    agenda: <AgendaScreen />,
    habits: <HabitsScreen />,
    inbox: <InboxScreen />,
    tasks: <TasksScreen />,
    projects: <ProjectsScreen />,
    profile: <ProfileScreen />,
  }[tab];

  return (
    <div className="app">
      <a className="skip-link" href="#main-content">Ir para o conteúdo</a>
      <nav className="sidebar" aria-label="Navegação principal">
        <div className="brand">
          <span className="brand-mark"><Icon name="leaf" size={16} stroke={2.2} /></span>
          Leve
        </div>
        <button className="btn btn-primary" style={{ marginBottom: 16, justifyContent: 'flex-start' }} onClick={() => openSheet({ type: 'quickAdd' })}>
          <Icon name="plus" size={18} />
          Capturar
          <span className="kbd" style={{ marginLeft: 'auto', color: 'inherit', borderColor: 'currentColor', opacity: 0.6 }}>N</span>
        </button>
        {TABS.map((t) => (
          <button key={t.id} className="side-link" aria-current={tab === t.id ? 'page' : undefined} onClick={() => goTo(t.id)}>
            <Icon name={t.icon} size={18} />
            {t.label}
            {t.id === 'inbox' && inboxCount > 0 && <span className="count num">{inboxCount}</span>}
          </button>
        ))}
        <button className="side-link" style={{ marginTop: 'auto' }} onClick={() => openSheet({ type: 'search' })}>
          <Icon name="search" size={18} />
          Buscar
          <span className="kbd" style={{ marginLeft: 'auto' }}>Ctrl K</span>
        </button>
      </nav>

      <main className="main" id="main-content" tabIndex={-1} key={tab}>
        {screen}
      </main>

      {/* Bottom tab bar — mobile: Hoje | Agenda | + | Inbox | Tarefas */}
      <nav className="tabbar" aria-label="Navegação principal">
        <div className="tabbar-inner">
          <TabButton tab={TABS.find((t) => t.id === 'today')!} active={tab === 'today'} />
          <TabButton tab={TABS.find((t) => t.id === 'agenda')!} active={tab === 'agenda'} />
          <button className="fab" onClick={() => openSheet({ type: 'quickAdd' })} aria-label="Adicionar">
            <Icon name="plus" size={26} stroke={2.2} />
          </button>
          <TabButton tab={TABS.find((t) => t.id === 'inbox')!} active={tab === 'inbox'} badge={inboxCount} />
          <TabButton
            tab={TABS.find((t) => t.id === 'tasks')!}
            active={tab === 'tasks' || tab === 'habits' || tab === 'projects'}
          />
        </div>
      </nav>

      <SheetHost sheet={sheet} />
      <FocusMode />
      <Toasts />
    </div>
  );
}

function TabButton({ tab, active, badge }: { tab: (typeof TABS)[number]; active: boolean; badge?: number }) {
  return (
    <button className="tab" aria-current={active ? 'page' : undefined} onClick={() => goTo(tab.id)}>
      <Icon name={tab.icon} size={22} stroke={active ? 2.1 : 1.8} />
      {tab.label}
      {!!badge && <span className="badge num" aria-label={`${badge} itens`}>{badge > 99 ? '99+' : badge}</span>}
    </button>
  );
}
