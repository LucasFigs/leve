import { useEffect, useMemo } from 'react';
import { inboxTasks } from './domain/selectors';
import { useStore } from './store/store';
import { goTo, openSheet, useUI, type Sheet, type Tab } from './store/ui';
import { Icon, type IconName } from './components/Icon';
import { Toasts } from './components/ui';
import { TodayScreen } from './screens/Today';
import { AgendaScreen } from './screens/Agenda';
import { InboxScreen } from './screens/Inbox';
import { ProjectsScreen } from './screens/Projects';
import { TasksScreen } from './screens/Tasks';
import { ProfileScreen } from './screens/Profile';
import { FocusMode } from './screens/Focus';
import { Onboarding } from './screens/Onboarding';
import { Login, Splash } from './screens/Login';
import { canUseOffline, cloudEnabled, useCloud } from './store/sync';
import { TaskSheet } from './sheets/TaskSheet';
import { BreakdownSheet, EventMissedSheet, PlanSheet, ReplanSheet, ReviewSheet, WeekSheet } from './sheets/PlanningSheets';
import { ProjectSheet, QuickAddSheet, SearchSheet } from './sheets/OtherSheets';
import { AccountMenuSheet } from './sheets/AccountMenu';
import { startReminders } from './services/reminders';
import { refreshPush } from './services/push';

const TABS: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'today', label: 'Hoje', icon: 'sun' },
  { id: 'agenda', label: 'Agenda', icon: 'calendar' },
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
    const dark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0c0c0f' : '#f4f4f6');
  }, [theme]);
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
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
      return <TaskSheet key={sheet.id} id={sheet.id} date={sheet.date} />;
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
    case 'project':
      return <ProjectSheet id={sheet.id} />;
    case 'search':
      return <SearchSheet />;
    case 'account':
      return <AccountMenuSheet />;
  }
}

export default function App() {
  useTheme();
  useShortcuts();
  useEffect(() => startReminders(), []);
  const onboarded = useStore((s) => s.settings.onboarded);
  const tasks = useStore((s) => s.tasks);
  const tab = useUI((u) => u.tab);
  const sheet = useUI((u) => u.sheet);
  const inboxCount = useMemo(() => inboxTasks(tasks).length, [tasks]);
  const auth = useCloud((c) => c.auth);
  const recovery = useCloud((c) => c.recovery);
  const syncStatus = useCloud((c) => c.status);
  useEffect(() => {
    if (auth === 'in') refreshPush();
  }, [auth]);

  if (cloudEnabled) {
    if (auth === 'loading') return <Splash text="" />;
    if (recovery || (auth === 'out' && !canUseOffline())) return <Login />;
    if (syncStatus === 'loading') return <Splash />;
  }
  if (!onboarded) return <Onboarding />;

  const screen = {
    today: <TodayScreen />,
    agenda: <AgendaScreen />,
    inbox: <InboxScreen />,
    tasks: <TasksScreen />,
    projects: <ProjectsScreen />,
    profile: <ProfileScreen />,
  }[tab];

  return (
    <div className="app">
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

      <main className="main" key={tab}>
        {screen}
      </main>

      <nav className="tabbar" aria-label="Navegação principal">
        <div className="tabbar-inner">
          {TABS.slice(0, 2).map((t) => (
            <TabButton key={t.id} tab={t} active={tab === t.id} />
          ))}
          <button className="fab" onClick={() => openSheet({ type: 'quickAdd' })} aria-label="Adicionar">
            <Icon name="plus" size={26} stroke={2.2} />
          </button>
          {/* No celular, “Tarefas” também dá acesso aos projetos (abas no topo da tela) */}
          {TABS.slice(2, 4).map((t) => (
            <TabButton key={t.id} tab={t} active={tab === t.id || (t.id === 'tasks' && tab === 'projects')} badge={t.id === 'inbox' ? inboxCount : 0} />
          ))}
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
