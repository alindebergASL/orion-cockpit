import { useEffect, useRef, useState } from 'react';
import {
  Home,
  MessageSquare,
  CalendarDays,
  ListChecks,
  StickyNote,
  Wifi,
  WifiOff,
  LogOut,
  Bell,
  Settings,
  Users,
  Menu,
  X,
} from 'lucide-react';
import type { TabId } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../lib/api';
import { UserManagement } from './admin/UserManagement';
import { SettingsModal } from './Settings';
import { NotificationPanel } from './NotificationPanel';
import { useNotifications } from '../hooks/useNotifications';

const tabs: { id: TabId; label: string; icon: React.FC<{ className?: string }> }[] = [
  { id: 'today', label: 'Today', icon: Home },
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
  const notifications = useNotifications();
  const [connected, setConnected] = useState(false);
  const [adminOpen, setAdminOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  const handleTabChange = (tab: TabId) => {
    onTabChange(tab);
    setMobileMenuOpen(false);
  };

  return (
    <div className="flex h-full">
      {/* Mobile header */}
      <div className="fixed top-0 left-0 right-0 z-30 flex items-center justify-between border-b border-th-border bg-th-surface px-4 py-2.5 md:hidden">
        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="rounded-lg p-2 text-th-text-secondary">
          {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-cyan-600 text-xs font-bold">OC</div>
        <div className="w-9" />
      </div>

      {/* Sidebar — full overlay on mobile, fixed narrow on desktop */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-10 bg-black/50 md:hidden" onClick={() => setMobileMenuOpen(false)} />
      )}
      <aside className={`${mobileMenuOpen ? 'fixed left-0 top-0 bottom-0 z-20 pt-14 w-20 overflow-y-auto' : 'hidden'} md:relative md:flex md:pt-0 w-20 flex-col items-center justify-between border-r border-th-border bg-th-surface py-4`}>
        <div className="flex flex-col items-center gap-1">
          {/* Logo (desktop only) */}
          <div className="mb-6 hidden md:flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-600 text-sm font-bold tracking-tight text-white">
            OC
          </div>

          {/* Tab buttons */}
          {tabs.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => handleTabChange(id)}
              className={`flex w-16 flex-col items-center gap-1 rounded-lg px-2 py-2.5 text-[11px] transition-colors ${
                activeTab === id
                  ? 'bg-cyan-600/20 text-cyan-400'
                  : 'text-th-text-secondary hover:bg-th-elevated hover:text-th-text'
              }`}
            >
              <Icon className="h-5 w-5" />
              {label}
            </button>
          ))}
        </div>

        {/* Bottom section */}
        <div className="flex flex-col items-center gap-3">
          {/* Notifications */}
          <button
            onClick={() => setNotificationsOpen(true)}
            className="relative rounded-lg p-2 text-th-text-secondary hover:bg-th-elevated hover:text-th-text"
            title="Notifications"
          >
            <Bell className="h-4 w-4" />
            {notifications.unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">
                {notifications.unreadCount > 9 ? '9+' : notifications.unreadCount}
              </span>
            )}
          </button>

          {/* Settings (all users) */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded-lg p-2 text-th-text-secondary hover:bg-th-elevated hover:text-th-text"
            title="Settings"
          >
            <Settings className="h-4 w-4" />
          </button>

          {/* Admin: user management */}
          {user?.role === 'admin' && (
            <button
              onClick={() => setAdminOpen(true)}
              className="rounded-lg p-2 text-th-text-secondary hover:bg-th-elevated hover:text-th-text"
              title="User Management"
            >
              <Users className="h-4 w-4" />
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
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-th-elevated text-[10px] font-medium text-th-text">
              {initials}
            </div>
            <span className="max-w-[64px] truncate text-[10px] text-th-text-muted">
              {user?.displayName}
            </span>
            <button
              onClick={logout}
              className="rounded p-1 text-th-text-muted hover:text-red-400"
              title="Logout"
            >
              <LogOut className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden pt-10 md:pt-0">{children}</main>

      {/* Notifications panel */}
      {notificationsOpen && (
        <NotificationPanel
          insights={notifications.insights}
          onClose={() => setNotificationsOpen(false)}
          onMarkRead={notifications.markRead}
          onMarkAllRead={notifications.markAllRead}
          onDismiss={notifications.dismiss}
          onActOn={notifications.actOn}
          onNavigate={(tab) => { onTabChange(tab as TabId); setNotificationsOpen(false); }}
        />
      )}

      {/* Settings modal */}
      {settingsOpen && <SettingsModal onClose={() => setSettingsOpen(false)} />}

      {/* Admin panel overlay */}
      {adminOpen && <UserManagement onClose={() => setAdminOpen(false)} />}
    </div>
  );
}
