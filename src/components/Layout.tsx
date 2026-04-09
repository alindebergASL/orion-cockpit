import {
  MessageSquare,
  CalendarDays,
  ListChecks,
  StickyNote,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { TabId } from '../types';
import { useOpenClaw } from '../hooks/useOpenClaw';

const tabs: { id: TabId; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'chat', label: 'Chat', icon: MessageSquare },
  { id: 'calendar', label: 'Calendar', icon: CalendarDays },
  { id: 'tasks', label: 'Tasks', icon: ListChecks },
  { id: 'notes', label: 'Notes', icon: StickyNote },
];

interface LayoutProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  children: React.ReactNode;
}

export function Layout({ activeTab, onTabChange, children }: LayoutProps) {
  const { connected } = useOpenClaw();

  return (
    <div className="flex h-full">
      {/* Sidebar */}
      <aside className="flex w-20 flex-col items-center justify-between border-r border-slate-800 bg-slate-900 py-4">
        <div className="flex flex-col items-center gap-1">
          {/* Logo */}
          <div className="mb-6 flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-600 text-sm font-bold tracking-tight">
            OC
          </div>

          {/* Tab buttons */}
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => onTabChange(id)}
              className={`flex w-16 flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-[11px] transition-colors ${
                activeTab === id
                  ? 'bg-cyan-600/20 text-cyan-400'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>

        {/* Connection status */}
        <div
          className="flex flex-col items-center gap-1 text-[10px]"
          title={connected ? 'Connected to OpenClaw' : 'Disconnected'}
        >
          {connected ? (
            <Wifi className="h-4 w-4 text-emerald-400" />
          ) : (
            <WifiOff className="h-4 w-4 text-red-400" />
          )}
          <span className={connected ? 'text-emerald-400' : 'text-red-400'}>
            {connected ? 'Online' : 'Offline'}
          </span>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
