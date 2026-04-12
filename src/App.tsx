import { useEffect, useState } from 'react';
import type { TabId } from './types';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider } from './contexts/ThemeContext';
import { ToastContainer } from './components/Toast';
import { trackActivity } from './lib/activity';
import { LoginPage } from './components/auth/LoginPage';
import { Layout } from './components/Layout';
import { HomeTab } from './components/tabs/HomeTab';
import { ChatTab } from './components/tabs/ChatTab';
import { CalendarTab } from './components/tabs/CalendarTab';
import { TasksTab } from './components/tabs/TasksTab';
import { NotesTab } from './components/tabs/NotesTab';

const tabComponents: Record<TabId, React.FC> = {
  home: HomeTab,
  chat: ChatTab,
  calendar: CalendarTab,
  tasks: TasksTab,
  notes: NotesTab,
};

const tabEntries = Object.entries(tabComponents) as [TabId, React.FC][];
const tabIds = Object.keys(tabComponents) as TabId[];

function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('home');

  // Keyboard shortcuts: Ctrl/Cmd + 1-5 for tabs
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
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
    trackActivity('tab_viewed', { tab });
  };

  return (
    <Layout activeTab={activeTab} onTabChange={handleTabChange}>
      {tabEntries.map(([id, Component]) => (
        <div key={id} className={id === activeTab ? 'h-full' : 'hidden'}>
          <Component />
        </div>
      ))}
    </Layout>
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
    <ThemeProvider>
      <AuthProvider>
        <AppContent />
        <ToastContainer />
      </AuthProvider>
    </ThemeProvider>
  );
}
