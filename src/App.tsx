import { useState } from 'react';
import type { TabId } from './types';
import { AuthProvider, useAuth } from './contexts/AuthContext';
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

function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('home');

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
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
      <div className="flex h-full items-center justify-center bg-slate-950">
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
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}
