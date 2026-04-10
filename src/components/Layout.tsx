import { useEffect, useRef, useState } from 'react';
import {
  MessageSquare,
  CalendarDays,
  ListChecks,
  StickyNote,
  Wifi,
  WifiOff,
  LogOut,
  Settings,
} from 'lucide-react';
import type { TabId } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { UserManagement } from './admin/UserManagement';

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
  const { user, logout } = useAuth();
  const [connected, setConnected] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval>>(null);

  useEffect(() => {
    const check = async () => setConnected(await api.ping());
    check();
    intervalRef.current = setInterval(check, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const initials = user?.displayName
    ?.split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2) ?? '?';

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

        {/* Bottom section: user info + status */}
        <div className="flex flex-col items-center gap-3">
          {/* Admin button */}
          {user?.role === 'admin' && (
            <button
              onClick={() => setAdminOpen(true)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-slate-300"
              title="User Management"
            >
              <Settings className="h-4 w-4" />
            </button>
          )}

          {/* Connection status */}
          <div
            className="flex flex-col items-center gap-1 text-[10px]"
            title={connected ? 'Connected to backend' : 'Disconnected'}
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

          {/* User info + logout */}
          <div className="flex flex-col items-center gap-1">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-700 text-[10px] font-medium text-slate-200">
              {initials}
            </div>
            <span className="max-w-[64px] truncate text-[10px] text-slate-500">
              {user?.displayName}
            </span>
            <button
              onClick={logout}
              className="rounded p-1 text-slate-600 hover:text-red-400"
              title="Logout"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden">{children}</main>

      {/* Admin panel overlay */}
      {adminOpen && <UserManagement onClose={() => setAdminOpen(false)} />}
    </div>
  );
}
