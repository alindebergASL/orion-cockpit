import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  RefreshCw,
  ListChecks,
  Circle,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Plus,
  Sparkles,
  Zap,
  Filter,
  ChevronDown,
  ChevronRight,
  X,
  Pencil,
} from 'lucide-react';
import type { Task } from '../../types';
import { api } from '../../lib/api';
import { showToast } from '../Toast';
import { trackActivity } from '../../lib/activity';
import { renderRichText } from '../../lib/richText';

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

const PRIORITY_HEX: Record<string, string> = {
  high: '#ef4444',
  medium: '#f59e0b',
  low: '#64748b',
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

function getDueDateColor(dueDate: string | undefined): string | undefined {
  if (!dueDate) return undefined;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return '#ef4444';
  if (diffDays === 0) return '#f59e0b';
  if (diffDays <= 3) return '#94a3b8';
  return undefined;
}

function formatDueDate(dueDate: string): string {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = new Date(dueDate);
  due.setHours(0, 0, 0, 0);
  const diffDays = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < -1) return `${Math.abs(diffDays)}d overdue`;
  if (diffDays === -1) return 'Yesterday';
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays <= 7) return `In ${diffDays}d`;
  return new Date(dueDate).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

type SortOption = 'dueDate' | 'priority' | 'recent';
const PRIORITY_ORDER: Record<string, number> = { high: 0, medium: 1, low: 2 };

export function TasksTab() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);

  // Filters
  const [filterList, setFilterList] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [sortBy, setSortBy] = useState<SortOption>('dueDate');
  const [groupByList, setGroupByList] = useState(false);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Quick add
  const [quickAdd, setQuickAdd] = useState('');
  const [quickAddExpanded, setQuickAddExpanded] = useState(false);
  const [quickAddPriority, setQuickAddPriority] = useState('');
  const [quickAddDueDate, setQuickAddDueDate] = useState('');
  const [quickAddList, setQuickAddList] = useState('');

  // Inline editing
  const [expandedTaskId, setExpandedTaskId] = useState<number | string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editPriority, setEditPriority] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const editDebounce = useRef<ReturnType<typeof setTimeout>>(null);

  // AI features
  const [aiPrioritizing, setAiPrioritizing] = useState(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState<{ taskId: number | string | null; title: string | null; reasoning: string } | null>(null);
  const [aiPriorities, setAiPriorities] = useState<{ id: number | string; title: string; suggestedPriority: string; reasoning: string }[] | null>(null);

  const lastToggleRef = useRef(0);

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

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  useEffect(() => {
    const handler = () => {
      if (Date.now() - lastToggleRef.current < 5000) return;
      fetchTasks();
    };
    window.addEventListener('orion-data-changed', handler);
    return () => window.removeEventListener('orion-data-changed', handler);
  }, [fetchTasks]);

  // Derived: available lists
  const availableLists = useMemo(() => {
    const lists = [...new Set(tasks.map((t) => t.listName).filter(Boolean))] as string[];
    return lists.sort();
  }, [tasks]);

  // Filtered + sorted tasks
  const filteredTasks = useMemo(() => {
    let result = [...tasks];
    if (filterList !== 'all') result = result.filter((t) => (t.listName || 'Uncategorized') === filterList);
    if (filterPriority !== 'all') result = result.filter((t) => (t.priority || 'low') === filterPriority);
    if (filterStatus !== 'all') {
      if (filterStatus === 'open') result = result.filter((t) => t.status !== 'completed');
      else if (filterStatus === 'completed') result = result.filter((t) => t.status === 'completed');
    }

    result.sort((a, b) => {
      if (sortBy === 'dueDate') {
        const ad = a.dueDate || '9999-12-31';
        const bd = b.dueDate || '9999-12-31';
        return ad.localeCompare(bd);
      }
      if (sortBy === 'priority') {
        const ap = PRIORITY_ORDER[a.priority || 'low'] ?? 3;
        const bp = PRIORITY_ORDER[b.priority || 'low'] ?? 3;
        return ap - bp;
      }
      // recent: higher id = more recent
      return Number(b.id) - Number(a.id);
    });
    return result;
  }, [tasks, filterList, filterPriority, filterStatus, sortBy]);

  // Grouped tasks
  const groupedTasks = useMemo(() => {
    if (!groupByList) return null;
    const groups: Record<string, Task[]> = {};
    for (const t of filteredTasks) {
      const key = t.listName || 'Uncategorized';
      (groups[key] ??= []).push(t);
    }
    return groups;
  }, [filteredTasks, groupByList]);

  const handleQuickAdd = useCallback(async () => {
    if (!quickAdd.trim()) return;
    try {
      const task = await api.createTask(quickAdd.trim(), {
        priority: quickAddPriority || undefined,
        dueDate: quickAddDueDate || undefined,
        list: quickAddList || undefined,
      });
      setTasks((prev) => [task, ...prev]);
      setQuickAdd('');
      setQuickAddPriority('');
      setQuickAddDueDate('');
      setQuickAddList('');
      setQuickAddExpanded(false);
      trackActivity('task_created', { title: quickAdd.trim() });
    } catch { /* ignore */ }
  }, [quickAdd, quickAddPriority, quickAddDueDate, quickAddList]);

  const handleToggleStatus = useCallback(async (taskId: number | string, currentStatus: string) => {
    const nextStatus = currentStatus === 'completed' ? 'open' : 'completed';
    lastToggleRef.current = Date.now();
    const matchTask = (t: Task) => t.externalId === taskId || t.id === taskId || String(t.id) === String(taskId);
    setTasks((prev) => prev.map((t) => (matchTask(t) ? { ...t, status: nextStatus as Task['status'] } : t)));
    try {
      await api.updateTaskStatus(taskId, nextStatus);
      const task = tasks.find(matchTask);
      trackActivity(nextStatus === 'completed' ? 'task_completed' : 'task_reopened', { taskId, title: task?.title });
    } catch {
      console.error('Task status update failed for task', taskId);
    }
  }, [tasks]);

  const handleExpandTask = useCallback((task: Task) => {
    if (expandedTaskId === task.id) {
      setExpandedTaskId(null);
      return;
    }
    setExpandedTaskId(task.id);
    setEditTitle(task.title);
    setEditDescription(task.description || '');
    setEditPriority(task.priority || '');
    setEditDueDate(task.dueDate || '');
  }, [expandedTaskId]);

  const saveTaskEdit = useCallback((taskId: number | string, field: string, value: string) => {
    setTasks((prev) => prev.map((t) => t.id === taskId ? { ...t, [field]: value || null } : t));
    if (editDebounce.current) clearTimeout(editDebounce.current);
    editDebounce.current = setTimeout(() => {
      api.updateTask(taskId, { [field]: value || undefined }).catch(() => {});
    }, 600);
  }, []);

  const handleAiPrioritize = useCallback(async () => {
    setAiPrioritizing(true);
    setAiPriorities(null);
    try {
      const result = await api.aiPrioritizeTasks();
      setAiPriorities(result.prioritized);
      trackActivity('ai_tasks_prioritized', { count: result.prioritized.length });
    } catch {
      showToast('AI prioritization failed', 'error');
    } finally {
      setAiPrioritizing(false);
    }
  }, []);

  const handleApplyPriority = useCallback(async (taskId: number | string, priority: string) => {
    setTasks((prev) => prev.map((t) => (t.id === taskId || t.externalId === String(taskId)) ? { ...t, priority: priority as Task['priority'] } : t));
    try {
      await api.updateTask(taskId, { priority });
    } catch { /* ignore */ }
  }, []);

  const handleApplyAllPriorities = useCallback(async () => {
    if (!aiPriorities) return;
    for (const item of aiPriorities) {
      await handleApplyPriority(item.id, item.suggestedPriority);
    }
    setAiPriorities(null);
    showToast('Priorities updated', 'success');
  }, [aiPriorities, handleApplyPriority]);

  const handleAiSuggest = useCallback(async () => {
    setAiSuggesting(true);
    setAiSuggestion(null);
    try {
      const result = await api.aiSuggestNextTask();
      setAiSuggestion(result);
      trackActivity('ai_task_suggested', { taskId: result.taskId });
    } catch {
      showToast('AI suggestion failed', 'error');
    } finally {
      setAiSuggesting(false);
    }
  }, []);

  const toggleGroup = useCallback((group: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  }, []);

  // Task counts for filter badges
  const counts = useMemo(() => ({
    open: tasks.filter((t) => t.status !== 'completed').length,
    completed: tasks.filter((t) => t.status === 'completed').length,
    high: tasks.filter((t) => t.priority === 'high' && t.status !== 'completed').length,
    medium: tasks.filter((t) => t.priority === 'medium' && t.status !== 'completed').length,
    low: tasks.filter((t) => (t.priority === 'low' || !t.priority) && t.status !== 'completed').length,
  }), [tasks]);

  const renderTask = (task: Task) => {
    const StatusIcon = statusIcons[task.status];
    const color = statusColors[task.status];
    const borderHex = PRIORITY_HEX[task.priority || 'low'] || '#334155';
    const isExpanded = expandedTaskId === task.id;
    const isHighlighted = aiSuggestion?.taskId != null && (aiSuggestion.taskId === task.id || String(aiSuggestion.taskId) === String(task.id));

    return (
      <div
        key={String(task.id)}
        className={`border-b border-b-th-border transition-colors ${isHighlighted ? 'bg-cyan-600/5' : ''}`}
        style={{ borderLeftWidth: '4px', borderLeftColor: borderHex }}
      >
        <div className="flex items-start gap-3 px-4 py-3">
          <button
            onClick={() => handleToggleStatus(task.externalId || task.id, task.status)}
            className={`mt-0.5 shrink-0 p-2 -m-2 transition-colors hover:text-cyan-400 ${color}`}
            title={task.status === 'completed' ? 'Mark open' : 'Mark complete'}
          >
            <StatusIcon className="h-4 w-4" />
          </button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p
                className={`flex-1 text-sm cursor-pointer ${task.status === 'completed' ? 'text-th-text-secondary line-through' : 'text-th-text'}`}
                onClick={() => handleExpandTask(task)}
              >
                {renderRichText(task.title)}
              </p>
              <button onClick={() => handleExpandTask(task)} className="shrink-0 rounded p-2.5 -m-1.5 text-th-text-muted hover:text-th-text-secondary">
                <Pencil className="h-3 w-3" />
              </button>
            </div>
            {!isExpanded && task.description && (
              <p className="mt-0.5 text-xs text-th-text-muted truncate">{task.description}</p>
            )}
            <div className="mt-1 flex items-center gap-3 text-xs text-th-text-muted">
              {task.priority && <span className="capitalize" style={{ color: PRIORITY_HEX[task.priority] }}>{task.priority}</span>}
              {task.dueDate && (
                <span style={{ color: getDueDateColor(task.dueDate) }}>{formatDueDate(task.dueDate)}</span>
              )}
              {task.listName && <span>{task.listName}</span>}
            </div>
          </div>
        </div>

        {/* Expanded inline edit */}
        {isExpanded && (
          <div className="px-4 pb-4 pt-1 ml-7 space-y-2 border-t border-th-border/50">
            <input
              value={editTitle}
              onChange={(e) => { setEditTitle(e.target.value); saveTaskEdit(task.id, 'title', e.target.value); }}
              className="w-full bg-transparent text-sm text-th-text outline-none font-medium border-b border-th-border pb-1"
            />
            <textarea
              value={editDescription}
              onChange={(e) => { setEditDescription(e.target.value); saveTaskEdit(task.id, 'description', e.target.value); }}
              placeholder="Add description..."
              rows={2}
              className="w-full resize-none bg-transparent text-xs text-th-text-secondary outline-none placeholder-th-text-muted"
            />
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-th-text-muted mr-1">Priority:</span>
                {(['low', 'medium', 'high'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => { setEditPriority(p); saveTaskEdit(task.id, 'priority', p); }}
                    className={`rounded px-2 py-0.5 text-[10px] capitalize ${editPriority === p ? 'text-white' : 'text-th-text-muted hover:text-th-text-secondary'}`}
                    style={editPriority === p ? { backgroundColor: PRIORITY_HEX[p] } : {}}
                  >{p}</button>
                ))}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-th-text-muted mr-1">Due:</span>
                <input
                  type="date"
                  value={editDueDate}
                  onChange={(e) => { setEditDueDate(e.target.value); saveTaskEdit(task.id, 'dueDate', e.target.value); }}
                  className="rounded border border-th-border bg-th-input px-1.5 py-0.5 text-[10px] text-th-text outline-none"
                />
              </div>
              <button onClick={() => setExpandedTaskId(null)} className="ml-auto text-[10px] text-th-text-muted hover:text-th-text-secondary">
                Close
              </button>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-th-border px-4 py-3">
        <div className="flex items-center gap-3">
          <div>
            <h2 className="text-sm font-semibold text-th-text">Tasks</h2>
            {syncedAt && (
              <span className="flex items-center gap-1 text-[10px] text-th-text-muted">
                <Clock className="h-3 w-3" />
                Synced {timeAgo(syncedAt)}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleAiSuggest}
            disabled={aiSuggesting}
            className="flex items-center gap-1 rounded-md bg-purple-600/15 px-2 py-1.5 text-[11px] text-purple-400 hover:bg-purple-600/25 disabled:opacity-50"
            title="AI: What should I do next?"
          >
            <Zap className={`h-3 w-3 ${aiSuggesting ? 'animate-pulse' : ''}`} />
            Next
          </button>
          <button
            onClick={handleAiPrioritize}
            disabled={aiPrioritizing}
            className="flex items-center gap-1 rounded-md bg-purple-600/15 px-2 py-1.5 text-[11px] text-purple-400 hover:bg-purple-600/25 disabled:opacity-50"
            title="AI: Prioritize my tasks"
          >
            <Sparkles className={`h-3 w-3 ${aiPrioritizing ? 'animate-pulse' : ''}`} />
            Prioritize
          </button>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-th-text-secondary hover:bg-th-elevated hover:text-th-text disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
            Sync
          </button>
        </div>
      </div>

      {/* AI Suggestion card */}
      {aiSuggestion && aiSuggestion.taskId && (
        <div className="mx-4 mt-3 rounded-xl border border-purple-500/20 bg-purple-600/5 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 mb-1">
              <Zap className="h-4 w-4 text-purple-400" />
              <span className="text-xs font-semibold text-purple-400">Do this next</span>
            </div>
            <button onClick={() => setAiSuggestion(null)} className="text-th-text-muted hover:text-th-text-secondary">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <p className="text-sm font-medium text-th-text">{aiSuggestion.title}</p>
          <p className="mt-1 text-xs text-th-text-secondary leading-relaxed">{aiSuggestion.reasoning}</p>
        </div>
      )}

      {/* AI Priorities result */}
      {aiPriorities && (
        <div className="mx-4 mt-3 rounded-xl border border-purple-500/20 bg-purple-600/5 p-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-purple-400" />
              <span className="text-xs font-semibold text-purple-400">Suggested Priorities</span>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={handleApplyAllPriorities} className="rounded bg-purple-600/20 px-2 py-0.5 text-[10px] text-purple-300 hover:bg-purple-600/30">
                Apply All
              </button>
              <button onClick={() => setAiPriorities(null)} className="text-th-text-muted hover:text-th-text-secondary">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {aiPriorities.map((item) => (
              <div key={String(item.id)} className="flex items-center gap-2 text-xs">
                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: PRIORITY_HEX[item.suggestedPriority] || '#64748b' }} />
                <span className="flex-1 text-th-text truncate">{item.title}</span>
                <span className="text-th-text-muted truncate max-w-[140px]">{item.reasoning}</span>
                <button
                  onClick={() => handleApplyPriority(item.id, item.suggestedPriority)}
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-cyan-400 hover:bg-th-elevated"
                >
                  Apply
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Filter bar */}
      <div className="border-b border-th-border px-4 py-2 space-y-1.5">
        <button
          onClick={() => setFiltersOpen(!filtersOpen)}
          className="flex items-center gap-2 text-xs text-th-text-secondary md:hidden"
        >
          <Filter className="h-3.5 w-3.5" />
          Filters
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${filtersOpen ? 'rotate-180' : ''}`} />
        </button>
        <div className={`${filtersOpen ? 'block' : 'hidden'} md:block space-y-1.5`}>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter className="h-3 w-3 text-th-text-muted shrink-0 hidden md:block" />
            {/* Status filter */}
            {(['all', 'open', 'completed'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`rounded px-2.5 py-1 text-xs capitalize ${filterStatus === s ? 'bg-cyan-600/20 text-cyan-400' : 'text-th-text-muted hover:text-th-text-secondary'}`}
              >
                {s === 'all' ? 'All' : s === 'open' ? `Open (${counts.open})` : `Done (${counts.completed})`}
              </button>
            ))}
            <span className="text-th-border">|</span>
            {/* Priority filter */}
            {(['all', 'high', 'medium', 'low'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setFilterPriority(p)}
                className={`rounded px-2.5 py-1 text-xs capitalize ${filterPriority === p ? 'bg-cyan-600/20 text-cyan-400' : 'text-th-text-muted hover:text-th-text-secondary'}`}
              >
                {p === 'all' ? 'Any Priority' : `${p} (${counts[p as keyof typeof counts] || 0})`}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* List filter */}
            {availableLists.length > 0 && (
              <>
                <span className="text-xs text-th-text-muted">List:</span>
                <button
                  onClick={() => setFilterList('all')}
                  className={`rounded px-2.5 py-1 text-xs ${filterList === 'all' ? 'bg-cyan-600/20 text-cyan-400' : 'text-th-text-muted hover:text-th-text-secondary'}`}
                >All</button>
                {availableLists.map((l) => (
                  <button
                    key={l}
                    onClick={() => setFilterList(l)}
                    className={`rounded px-2.5 py-1 text-xs ${filterList === l ? 'bg-cyan-600/20 text-cyan-400' : 'text-th-text-muted hover:text-th-text-secondary'}`}
                  >{l}</button>
                ))}
                <span className="text-th-border">|</span>
              </>
            )}
            {/* Sort */}
            <span className="text-xs text-th-text-muted">Sort:</span>
            {(['dueDate', 'priority', 'recent'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSortBy(s)}
                className={`rounded px-2.5 py-1 text-xs ${sortBy === s ? 'bg-cyan-600/20 text-cyan-400' : 'text-th-text-muted hover:text-th-text-secondary'}`}
              >{s === 'dueDate' ? 'Due Date' : s === 'priority' ? 'Priority' : 'Recent'}</button>
            ))}
            {availableLists.length > 0 && (
              <>
                <span className="text-th-border">|</span>
                <button
                  onClick={() => setGroupByList(!groupByList)}
                  className={`rounded px-2.5 py-1 text-xs ${groupByList ? 'bg-cyan-600/20 text-cyan-400' : 'text-th-text-muted hover:text-th-text-secondary'}`}
                >Group by list</button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Quick add */}
      <div className="border-b border-th-border px-4 py-2">
        <div className="flex items-center gap-2">
          <Plus className="h-3.5 w-3.5 text-th-text-muted" />
          <input
            value={quickAdd}
            onChange={(e) => setQuickAdd(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleQuickAdd(); }}
            onFocus={() => setQuickAddExpanded(true)}
            placeholder="Add a task..."
            className="flex-1 bg-transparent text-base md:text-sm text-th-text outline-none placeholder-th-text-muted"
          />
          {quickAdd && (
            <button onClick={handleQuickAdd} className="rounded-md bg-cyan-600 px-2.5 py-1 text-[11px] text-white hover:bg-cyan-500">
              Add
            </button>
          )}
        </div>
        {quickAddExpanded && (
          <div className="mt-2 ml-5 flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-1">
              {(['low', 'medium', 'high'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setQuickAddPriority(quickAddPriority === p ? '' : p)}
                  className={`rounded px-2 py-0.5 text-[10px] capitalize ${quickAddPriority === p ? 'text-white' : 'text-th-text-muted hover:text-th-text-secondary'}`}
                  style={quickAddPriority === p ? { backgroundColor: PRIORITY_HEX[p] } : {}}
                >{p}</button>
              ))}
            </div>
            <input
              type="date"
              value={quickAddDueDate}
              onChange={(e) => setQuickAddDueDate(e.target.value)}
              className="rounded border border-th-border bg-th-input px-1.5 py-0.5 text-[10px] text-th-text outline-none"
            />
            {availableLists.length > 0 && (
              <select
                value={quickAddList}
                onChange={(e) => setQuickAddList(e.target.value)}
                className="rounded border border-th-border bg-th-input px-1.5 py-0.5 text-[10px] text-th-text outline-none"
              >
                <option value="">No list</option>
                {availableLists.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
            )}
            <button
              onClick={() => { setQuickAddExpanded(false); setQuickAddPriority(''); setQuickAddDueDate(''); setQuickAddList(''); }}
              className="text-[10px] text-th-text-muted hover:text-th-text-secondary"
            >Collapse</button>
          </div>
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

        {!error && filteredTasks.length === 0 && !loading && (
          <div className="flex flex-col items-center gap-2 px-4 py-12 text-th-text-secondary">
            <ListChecks className="h-10 w-10" />
            <p className="text-sm">{tasks.length === 0 ? 'No tasks found' : 'No tasks match filters'}</p>
          </div>
        )}

        {!groupByList ? (
          <div className="flex flex-col">
            {filteredTasks.map(renderTask)}
          </div>
        ) : (
          <div className="flex flex-col">
            {groupedTasks && Object.entries(groupedTasks).map(([group, groupTasks]) => (
              <div key={group}>
                <button
                  onClick={() => toggleGroup(group)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-left bg-th-elevated/50 border-b border-th-border hover:bg-th-elevated"
                >
                  {collapsedGroups.has(group) ? <ChevronRight className="h-3 w-3 text-th-text-muted" /> : <ChevronDown className="h-3 w-3 text-th-text-muted" />}
                  <span className="text-xs font-semibold text-th-text-secondary">{group}</span>
                  <span className="rounded-full bg-th-border px-1.5 py-0.5 text-[10px] text-th-text-muted">{groupTasks.length}</span>
                </button>
                {!collapsedGroups.has(group) && groupTasks.map(renderTask)}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
