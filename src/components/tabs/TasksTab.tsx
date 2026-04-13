import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RefreshCw,
  ListChecks,
  Circle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
} from 'lucide-react';
import type { Task } from '../../types';
import { api } from '../../lib/api';
import { showToast } from '../Toast';
import { trackActivity } from '../../lib/activity';

const statusIcons: Record<Task['status'], React.FC<{ className?: string }>> = {
  open: Circle,
  in_progress: Clock,
  completed: CheckCircle2,
};

const statusColors: Record<Task['status'], string> = {
  open: 'text-th-text-secondary',
  in_progress: 'text-amber-400',
  completed: 'text-emerald-400',
};

const priorityColors: Record<string, string> = {
  high: 'border-l-red-500',
  medium: 'border-l-amber-500',
  low: 'border-l-slate-600',
};

function timeAgo(isoString: string | null): string {
  if (!isoString) return 'never';
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function TasksTab() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'open' | 'in_progress' | 'completed'>('open');

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getTasks();
      setTasks(result.tasks);
      setSyncedAt(result.syncedAt);
    } catch {
      setError('Could not load tasks. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const result = await api.syncTasks();
      setTasks(result.tasks);
      setSyncedAt(result.syncedAt);
      showToast(`Synced ${result.tasks.length} tasks`, 'success');
    } catch {
      setError('Sync failed. OpenClaw may be unreachable.');
      showToast('Task sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Auto-refresh when chat tool calls modify data (debounce to avoid stomping on toggling)
  const lastToggleRef = useRef(0);
  useEffect(() => {
    const handler = () => {
      // Don't re-fetch if we just toggled a task (within 5s)
      if (Date.now() - lastToggleRef.current < 5000) return;
      fetchTasks();
    };
    window.addEventListener('orion-data-changed', handler);
    return () => window.removeEventListener('orion-data-changed', handler);
  }, [fetchTasks]);

  const [quickAdd, setQuickAdd] = useState('');

  const handleQuickAdd = useCallback(async () => {
    if (!quickAdd.trim()) return;
    try {
      const task = await api.createTask(quickAdd.trim());
      setTasks((prev) => [task, ...prev]);
      setQuickAdd('');
    } catch { /* ignore */ }
  }, [quickAdd]);

  const handleToggleStatus = useCallback(async (taskId: number | string, currentStatus: string) => {
    const nextStatus = currentStatus === 'completed' ? 'open' : 'completed';
    lastToggleRef.current = Date.now();

    // Optimistic update (use == for loose comparison in case of number/string mismatch)
    const numId = Number(taskId);
    setTasks((prev) =>
      prev.map((t) => (Number(t.id) === numId ? { ...t, status: nextStatus as Task['status'] } : t)),
    );

    try {
      await api.updateTaskStatus(numId, nextStatus);
      const task = tasks.find((t) => Number(t.id) === numId);
      trackActivity(nextStatus === 'completed' ? 'task_completed' : 'task_reopened', { taskId: numId, title: task?.title });
    } catch {
      // Don't revert — the backend already updated SQLite locally even if OpenClaw failed.
      // The optimistic state is correct for the local view.
      console.error('Task status update failed for task', numId);
    }
  }, [tasks]);

  const filtered = filter === 'all' ? tasks : tasks.filter((t) => t.status === filter);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-th-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-sm font-semibold text-th-text">Tasks</h2>
            <p className="text-xs text-th-text-secondary">
              Tasks synced from OpenClaw
            </p>
          </div>
          {syncedAt && (
            <span className="flex items-center gap-1 text-[10px] text-th-text-muted">
              <Clock className="h-3 w-3" />
              Synced {timeAgo(syncedAt)}
            </span>
          )}
        </div>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-th-text-secondary hover:bg-th-elevated hover:text-th-text disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          Sync
        </button>
      </div>

      {/* Filter bar */}
      <div className="flex gap-1 border-b border-th-border px-4 py-2">
        {(['open', 'in_progress', 'completed', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`rounded-md px-2.5 py-1 text-xs capitalize transition-colors ${
              filter === f
                ? 'bg-cyan-600/20 text-cyan-400'
                : 'text-th-text-secondary hover:text-th-text-secondary'
            }`}
          >
            {f.replace('_', ' ')}
          </button>
        ))}
      </div>

      {/* Quick add */}
      <div className="flex items-center gap-2 border-b border-th-border px-4 py-2">
        <Plus className="h-3.5 w-3.5 text-th-text-muted" />
        <input
          value={quickAdd}
          onChange={(e) => setQuickAdd(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleQuickAdd(); }}
          placeholder="Add a task..."
          className="flex-1 bg-transparent text-base md:text-sm text-th-text outline-none placeholder-th-text-muted"
        />
        {quickAdd && (
          <button
            onClick={handleQuickAdd}
            className="rounded-md bg-cyan-600 px-2.5 py-1 text-[11px] text-white hover:bg-cyan-500"
          >
            Add
          </button>
        )}
      </div>

      {/* Task list */}
      <div className="flex-1 overflow-y-auto">
        {error && (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
            <AlertTriangle className="h-8 w-8 text-amber-500" />
            <p className="text-sm text-th-text-secondary">{error}</p>
          </div>
        )}

        {!error && filtered.length === 0 && !loading && (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-th-text-secondary">
            <ListChecks className="h-10 w-10" />
            <p className="text-sm">No tasks found</p>
          </div>
        )}

        <div className="flex flex-col">
          {filtered.map((task) => (
            <TaskRow key={task.id} task={task} onToggle={handleToggleStatus} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TaskRow({ task, onToggle }: { task: Task; onToggle: (id: number | string, status: string) => void }) {
  const StatusIcon = statusIcons[task.status];
  const color = statusColors[task.status];
  const borderColor = priorityColors[task.priority ?? 'low'] ?? 'border-l-slate-700';

  return (
    <div
      className={`flex items-start gap-3 border-b border-l-4 border-b-th-border px-4 py-3 ${borderColor}`}
    >
      <button
        onClick={() => onToggle(task.id, task.status)}
        className={`mt-0.5 shrink-0 transition-colors hover:text-cyan-400 ${color}`}
        title={task.status === 'completed' ? 'Mark open' : 'Mark complete'}
      >
        <StatusIcon className="h-4 w-4" />
      </button>
      <div className="flex-1">
        <p className={`text-sm ${task.status === 'completed' ? 'text-th-text-secondary line-through' : 'text-th-text'}`}>{task.title}</p>
        {task.description && (
          <p className="mt-0.5 text-xs text-th-text-secondary">{task.description}</p>
        )}
        <div className="mt-1.5 flex items-center gap-3 text-[11px] text-th-text-muted">
          <span className="capitalize">{task.status.replace('_', ' ')}</span>
          {task.priority && <span className="capitalize">{task.priority} priority</span>}
          {task.dueDate && <span>Due {new Date(task.dueDate).toLocaleDateString()}</span>}
        </div>
      </div>
    </div>
  );
}
