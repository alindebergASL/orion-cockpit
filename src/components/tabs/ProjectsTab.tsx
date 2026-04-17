import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Plus,
  Trash2,
  FolderOpen,
  Circle,
  CheckCircle2,
  Clock,
  Pause,
  Send,
  Hash,
} from 'lucide-react';
import type { Project, ProjectDetail, ProjectTask } from '../../types';
import { api } from '../../lib/api';
import { renderRichText } from '../../lib/richText';

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

const statusColors: Record<string, string> = {
  active: 'text-emerald-400',
  paused: 'text-amber-400',
  completed: 'text-th-text-muted',
};

const statusIcons: Record<string, React.FC<{ className?: string }>> = {
  active: Circle,
  paused: Pause,
  completed: CheckCircle2,
};

export function ProjectsTab() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newUpdate, setNewUpdate] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Load projects list
  useEffect(() => {
    api.getProjects()
      .then((data) => {
        setProjects(data);
        if (data.length > 0 && data[0]) setActiveId(data[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Load project detail when selection changes
  useEffect(() => {
    if (activeId === null) { setDetail(null); return; }
    setLoadingDetail(true);
    api.getProject(activeId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoadingDetail(false));
  }, [activeId]);

  const createProject = useCallback(async () => {
    try {
      const project = await api.createProject();
      setProjects((prev) => [project, ...prev]);
      setActiveId(project.id);
    } catch { /* ignore */ }
  }, []);

  const deleteProject = useCallback(async (id: number) => {
    if (!confirm('Delete this project and all its tasks?')) return;
    try {
      await api.deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (activeId === id) { setActiveId(null); setDetail(null); }
    } catch { /* ignore */ }
  }, [activeId]);

  const updateField = useCallback((field: string, value: unknown) => {
    if (!detail) return;
    setDetail({ ...detail, [field]: value } as ProjectDetail);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      api.updateProject(detail.id, { [field]: value }).catch(() => {});
    }, 500);
  }, [detail]);

  const handleAddTask = useCallback(async () => {
    if (!detail || !newTaskTitle.trim()) return;
    try {
      const task = await api.addProjectTask(detail.id, newTaskTitle.trim());
      setDetail({ ...detail, tasks: [...detail.tasks, task] });
      setNewTaskTitle('');
    } catch { /* ignore */ }
  }, [detail, newTaskTitle]);

  const handleToggleTask = useCallback(async (task: ProjectTask) => {
    if (!detail) return;
    const nextStatus = task.status === 'completed' ? 'open' : 'completed';
    setDetail({
      ...detail,
      tasks: detail.tasks.map((t) => t.id === task.id ? { ...t, status: nextStatus as ProjectTask['status'] } : t),
    });
    try {
      await api.toggleProjectTask(detail.id, task.id, nextStatus);
    } catch { /* ignore */ }
  }, [detail]);

  const handleDeleteTask = useCallback(async (taskId: number) => {
    if (!detail) return;
    setDetail({ ...detail, tasks: detail.tasks.filter((t) => t.id !== taskId) });
    try {
      await api.deleteProjectTask(detail.id, taskId);
    } catch { /* ignore */ }
  }, [detail]);

  const handleAddUpdate = useCallback(async () => {
    if (!detail || !newUpdate.trim()) return;
    try {
      const update = await api.addProjectUpdate(detail.id, newUpdate.trim());
      setDetail({ ...detail, updates: [update, ...detail.updates] });
      setNewUpdate('');
    } catch { /* ignore */ }
  }, [detail, newUpdate]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-th-border-strong border-t-cyan-400" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Sidebar */}
      <div className={`${activeId !== null ? 'hidden md:flex' : 'flex'} w-full md:w-64 flex-col border-b md:border-b-0 md:border-r border-th-border bg-th-surface`}>
        <div className="flex items-center justify-between border-b border-th-border px-3 py-3">
          <h2 className="text-sm font-semibold text-th-text">Projects</h2>
          <button onClick={createProject} className="rounded-lg p-1.5 text-th-text-secondary hover:bg-th-elevated hover:text-cyan-400">
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {projects.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-th-text-muted">
              <FolderOpen className="h-8 w-8" />
              <p className="text-xs">No projects yet</p>
            </div>
          )}

          {projects.map((project) => {
            const StatusIcon = statusIcons[project.status] || Circle;
            const progress = project.taskCount > 0 ? Math.round((project.completedTaskCount / project.taskCount) * 100) : 0;
            return (
              <button
                key={project.id}
                onClick={() => setActiveId(project.id)}
                className={`flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors ${
                  activeId === project.id
                    ? 'bg-th-elevated text-th-text'
                    : 'text-th-text-secondary hover:bg-th-elevated/50 hover:text-th-text'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <StatusIcon className={`h-3 w-3 shrink-0 ${statusColors[project.status]}`} />
                    <p className="truncate text-sm">{project.title || 'New Project'}</p>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 ml-5">
                    {project.taskCount > 0 && (
                      <span className="text-[10px] text-th-text-muted">{project.completedTaskCount}/{project.taskCount} tasks</span>
                    )}
                    {progress > 0 && (
                      <div className="h-1 w-12 rounded-full bg-th-border overflow-hidden">
                        <div className="h-full rounded-full bg-cyan-400" style={{ width: `${progress}%` }} />
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
                  className="ml-1 shrink-0 rounded p-1 text-th-text-muted opacity-0 hover:text-red-400 group-hover:opacity-100"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </button>
            );
          })}
        </div>
      </div>

      {/* Detail panel */}
      <div className={`${activeId === null ? 'hidden md:flex' : 'flex'} flex-1 flex-col overflow-y-auto`}>
        {!detail && !loadingDetail ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-th-text-muted">
            <FolderOpen className="h-12 w-12" />
            <p>Select or create a project</p>
          </div>
        ) : loadingDetail ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-th-border-strong border-t-cyan-400" />
          </div>
        ) : detail && (
          <div className="flex-1 overflow-y-auto">
            {/* Mobile back button */}
            <div className="flex items-center border-b border-th-border md:hidden">
              <button onClick={() => setActiveId(null)} className="px-3 py-3 text-xs text-cyan-400">&larr; Back</button>
            </div>

            {/* Project header */}
            <div className="border-b border-th-border px-6 py-4">
              <input
                value={detail.title}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="Project title"
                className="w-full bg-transparent text-lg font-semibold text-th-text outline-none placeholder-th-text-muted"
              />

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  value={detail.status}
                  onChange={(e) => updateField('status', e.target.value)}
                  className="rounded-md border border-th-border bg-th-input px-2 py-1 text-xs text-th-text outline-none"
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                </select>

                <input
                  type="date"
                  value={detail.targetDate || ''}
                  onChange={(e) => updateField('targetDate', e.target.value || null)}
                  className="rounded-md border border-th-border bg-th-input px-2 py-1 text-xs text-th-text outline-none"
                />

                {detail.tags.length > 0 && detail.tags.map((tag) => (
                  <span key={tag} className="flex items-center gap-0.5 rounded-full bg-cyan-600/10 px-2 py-0.5 text-[11px] text-cyan-400">
                    <Hash className="h-3 w-3" />{tag}
                  </span>
                ))}
              </div>
            </div>

            {/* Description */}
            <div className="border-b border-th-border px-6 py-3">
              <textarea
                value={detail.description}
                onChange={(e) => updateField('description', e.target.value)}
                placeholder="Project description, objectives, notes..."
                rows={3}
                className="w-full resize-none bg-transparent text-base md:text-sm text-th-text-secondary leading-relaxed outline-none placeholder-th-text-muted"
              />
            </div>

            {/* Tasks */}
            <div className="border-b border-th-border px-6 py-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-th-text-secondary">
                Tasks {detail.tasks.length > 0 && `(${detail.tasks.filter((t) => t.status === 'completed').length}/${detail.tasks.length})`}
              </h3>

              <div className="space-y-1">
                {detail.tasks.map((task) => (
                  <div key={task.id} className="group flex items-center gap-2.5 rounded-md px-1 py-1.5 hover:bg-th-elevated/50">
                    <button onClick={() => handleToggleTask(task)} className="shrink-0 text-th-text-secondary hover:text-cyan-400">
                      {task.status === 'completed'
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        : <Circle className="h-4 w-4" />}
                    </button>
                    <span className={`flex-1 text-sm ${task.status === 'completed' ? 'text-th-text-muted line-through' : 'text-th-text'}`}>
                      {renderRichText(task.title)}
                    </span>
                    {task.assignee && (
                      <span className="text-[10px] text-purple-400">@{task.assignee}</span>
                    )}
                    <button
                      onClick={() => handleDeleteTask(task.id)}
                      className="shrink-0 rounded p-0.5 text-th-text-muted opacity-0 hover:text-red-400 group-hover:opacity-100"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Add task */}
              <div className="mt-2 flex items-center gap-2">
                <Plus className="h-3.5 w-3.5 text-th-text-muted" />
                <input
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleAddTask(); }}
                  placeholder="Add a task..."
                  className="flex-1 bg-transparent text-base md:text-sm text-th-text outline-none placeholder-th-text-muted"
                />
                {newTaskTitle && (
                  <button onClick={handleAddTask} className="rounded-md bg-cyan-600 px-2 py-1 text-[11px] text-white hover:bg-cyan-500">Add</button>
                )}
              </div>
            </div>

            {/* Progress Updates */}
            <div className="px-6 py-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-th-text-secondary">Progress Updates</h3>

              {/* Add update */}
              <div className="mb-3 flex items-start gap-2">
                <textarea
                  value={newUpdate}
                  onChange={(e) => setNewUpdate(e.target.value)}
                  placeholder="Log a progress update..."
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-th-border bg-th-input px-3 py-2 text-base md:text-sm text-th-text outline-none placeholder-th-text-muted focus:border-cyan-600"
                />
                <button
                  onClick={handleAddUpdate}
                  disabled={!newUpdate.trim()}
                  className="mt-1 rounded-lg bg-cyan-600 p-2 text-white hover:bg-cyan-500 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>

              {detail.updates.length === 0 ? (
                <p className="text-xs text-th-text-muted">No updates yet.</p>
              ) : (
                <div className="space-y-2">
                  {detail.updates.map((update) => (
                    <div key={update.id} className="rounded-lg border border-th-border bg-th-surface px-4 py-2.5">
                      <p className="text-sm text-th-text-secondary whitespace-pre-wrap">{renderRichText(update.content)}</p>
                      <p className="mt-1 text-[10px] text-th-text-muted flex items-center gap-1">
                        <Clock className="h-3 w-3" />{timeAgo(update.createdAt)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
