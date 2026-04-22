import { lazy, Suspense, useEffect, useState } from 'react';
import type { TabId } from './types';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastContainer } from './components/Toast';
import { SearchPalette } from './components/SearchPalette';
import { ErrorBoundary } from './components/ErrorBoundary';
import { trackActivity } from './lib/activity';
import { LoginPage } from './components/auth/LoginPage';
import { Layout } from './components/Layout';

const TodayTab = lazy(() => import('./components/tabs/TodayTab').then((m) => ({ default: m.TodayTab })));
const ChatTab = lazy(() => import('./components/tabs/ChatTab').then((m) => ({ default: m.ChatTab })));
const CalendarTab = lazy(() => import('./components/tabs/CalendarTab').then((m) => ({ default: m.CalendarTab })));
const TasksTab = lazy(() => import('./components/tabs/TasksTab').then((m) => ({ default: m.TasksTab })));
const NotesTab = lazy(() => import('./components/tabs/NotesTab').then((m) => ({ default: m.NotesTab })));
const ProjectsTab = lazy(() => import('./components/tabs/ProjectsTab').then((m) => ({ default: m.ProjectsTab })));

const tabComponents: Record<TabId, React.FC> = {
  today: TodayTab,
  chat: ChatTab,
  calendar: CalendarTab,
  tasks: TasksTab,
  notes: NotesTab,
  projects: ProjectsTab,
};

function TabFallback() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-th-border-strong border-t-cyan-400" />
    </div>
  );
}

const tabEntries = Object.entries(tabComponents) as [TabId, React.FC][];
const tabIds = Object.keys(tabComponents) as TabId[];

function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('today');
  const [visitedTabs, setVisitedTabs] = useState<Set<TabId>>(new Set(['today']));
  const [searchOpen, setSearchOpen] = useState(false);

  // Mark each activated tab as visited so lazy-loaded modules mount (and stay mounted)
  useEffect(() => {
    setVisitedTabs((prev) => {
      if (prev.has(activeTab)) return prev;
      const next = new Set(prev);
      next.add(activeTab);
      return next;
    });
  }, [activeTab]);

  // Keyboard shortcuts: Ctrl/Cmd + 1-5 for tabs, Ctrl/Cmd+K for search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'k') {
          e.preventDefault();
          setSearchOpen((prev) => !prev);
          return;
        }
        const num = parseInt(e.key, 10);
        if (num >= 1 && num <= tabIds.length) {
          e.preventDefault();
          setActiveTab(tabIds[num - 1]!);
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Listen for navigation events from Home tab quick actions
  useEffect(() => {
    const handler = (e: Event) => {
      const tab = (e as CustomEvent).detail?.tab as TabId;
      if (tab && tabIds.includes(tab)) setActiveTab(tab);
    };
    window.addEventListener('orion-navigate', handler);
    return () => window.removeEventListener('orion-navigate', handler);
  }, []);

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    setVisitedTabs((prev) => {
      if (prev.has(tab)) return prev;
      const next = new Set(prev);
      next.add(tab);
      return next;
    });
    trackActivity('tab_viewed', { tab });
  };

  return (
    <>
      <Layout activeTab={activeTab} onTabChange={handleTabChange}>
        {tabEntries.map(([id, Component]) => {
          if (!visitedTabs.has(id)) return null;
          return (
            <div key={id} className={id === activeTab ? 'h-full' : 'hidden'}>
              <ErrorBoundary tabName={id}>
                <Suspense fallback={<TabFallback />}>
                  <Component />
                </Suspense>
              </ErrorBoundary>
            </div>
          );
        })}
      </Layout>

      {searchOpen && (
        <SearchPalette
          onClose={() => setSearchOpen(false)}
          onNavigate={(tab) => { handleTabChange(tab as TabId); setSearchOpen(false); }}
        />
      )}
    </>
  );
}

function AppContent() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-th-base">
        <div className="flex flex-col items-center gap-3">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400" />
          <p className="text-sm text-slate-500">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <LoginPage />;
  return <Dashboard />;
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <AppContent />
          <ToastContainer />
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
