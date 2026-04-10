import { useState } from 'react';
import type { TabId } from './types';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { LoginPage } from './components/auth/LoginPage';
import { Layout } from './components/Layout';
import { ChatTab } from './components/tabs/ChatTab';
import { CalendarTab } from './components/tabs/CalendarTab';
import { TasksTab } from './components/tabs/TasksTab';
import { NotesTab } from './components/tabs/NotesTab';

const tabComponents: Record<TabId, React.FC> = {
  chat: ChatTab,
  calendar: CalendarTab,
  tasks: TasksTab,
  notes: NotesTab,
};

function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>('chat');
  const ActiveComponent = tabComponents[activeTab];

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      <ActiveComponent />
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
