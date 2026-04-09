import { useState } from 'react';
import type { TabId } from './types';
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

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('chat');
  const ActiveComponent = tabComponents[activeTab];

  return (
    <Layout activeTab={activeTab} onTabChange={setActiveTab}>
      <ActiveComponent />
    </Layout>
  );
}
