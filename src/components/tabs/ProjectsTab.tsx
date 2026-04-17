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
  X,
  Pencil,
  Filter,
} from 'lucide-react';
import type { Project, ProjectDetail, ProjectTask } from '../../types';
import { api } from '../../lib/api';
import { renderRichText } from '../../lib/richText';
import { trackActivity } from '../../lib/activity';

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
  const [newTaskAssignee, setNewTaskAssignee] = useState('');
  const [newUpdate, setNewUpdate] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState('');
  const [hideCompleted, setHideCompleted] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'completed'>('all');
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const detailIdRef = useRef<number | null>(null);

  useEffect(() => {
    api.getProjects()
      .then((data) => {
        setProjects(data);
        if (data.length > 0 && data[0]) setActiveId(data[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (activeId === null) { setDetail(null); return; }
    detailIdRef.current = activeId;
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
      trackActivity('project_created', { projectId: project.id });
    } catch { /* ignore */ }
  }, []);

  const deleteProject = useCallback(async (id: number) => {
    if (!confirm('Delete this project and all its tasks?')) return;
    try {
      await api.deleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));
      if (activeId === id) { setActiveId(null); setDetail(null); }
      trackActivity('project_deleted', { projectId: id });
    } catch { /* ignore */ }
  }, [activeId]);

  // Use ref for stable ID in debounced saves
  const updateField = useCallback((field: string, value: unknown) => {
    if (!detail) return;
    setDetail({ ...detail, [field]: value } as ProjectDetail);
    const id = detailIdRef.current;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (id) api.updateProject(id, { [field]: value }).catch(() => {});
    }, 500);
  }, [detail]);

  const addTag = useCallback(() => {
    if (!detail || !tagInput.trim()) return;
    const tag = tagInput.trim().replace(/^#/, '');
    if (detail.tags.includes(tag)) { setTagInput(''); return; }
    const newTags = [...detail.tags, tag];
    updateField('tags', newTags);
    setTagInput('');
  }, [detail, tagInput, updateField]);

  const removeTag = useCallback((tag: string) => {
    if (!detail) return;
    updateField('tags', detail.tags.filter((t) => t !== tag));
  }, [detail, updateField]);

  const handleAddTask = useCallback(async () => {
    if (!detail || !newTaskTitle.trim()) return;
    try {
      const task = await api.addProjectTask(detail.id, newTaskTitle.trim(), newTaskAssignee || undefined);
      setDetail({ ...detail, tasks: [...detail.tasks, task] });
      setNewTaskTitle('');
      setNewTaskAssignee('');
      trackActivity('project_task_added', { projectId: detail.id, title: newTaskTitle.trim() });
    } catch { /* ignore */ }
  }, [detail, newTaskTitle, newTaskAssignee]);

  const handleToggleTask = useCallback(async (task: ProjectTask) => {
    if (!detail) return;
    const nextStatus = task.status === 'completed' ? 'open' : 'completed';
    setDetail({
      ...detail,
      tasks: detail.tasks.map((t) => t.id === task.id ? { ...t, status: nextStatus as ProjectTask['status'] } : t),
    });
    try {
      await api.toggleProjectTask(detail.id, task.id, nextStatus);
      trackActivity('project_task_toggled', { projectId: detail.id, taskId: task.id, status: nextStatus });
    } catch { /* ignore */ }
  }, [detail]);

  const handleDeleteTask = useCallback(async (taskId: number) => {
    if (!detail || !confirm('Delete this task?')) return;
    setDetail({ ...detail, tasks: detail.tasks.filter((t) => t.id !== taskId) });
    try { await api.deleteProjectTask(detail.id, taskId); } catch { /* ignore */ }
  }, [detail]);

  const startEditTask = useCallback((task: ProjectTask) => {
    setEditingTaskId(task.id);
    setEditingTaskTitle(task.title);
  }, []);

  const saveEditTask = useCallback(async () => {
    if (!detail || editingTaskId === null) return;
    setDetail({
      ...detail,
      tasks: detail.tasks.map((t) => t.id === editingTaskId ? { ...t, title: editingTaskTitle } : t),
    });
    setEditingTaskId(null);
    // Backend task title update (reuse status endpoint pattern)
    try {
      await api.toggleProjectTask(detail.id, editingTaskId, detail.tasks.find((t) => t.id === editingTaskId)?.status || 'open');
    } catch { /* ignore */ }
  }, [detail, editingTaskId, editingTaskTitle]);

  const handleAddUpdate = useCallback(async () => {
    if (!detail || !newUpdate.trim()) return;
    try {
      const update = await api.addProjectUpdate(detail.id, newUpdate.trim());
      setDetail({ ...detail, updates: [update, ...detail.updates] });
      setNewUpdate('');
      trackActivity('project_update_posted', { projectId: detail.id });
    } catch { /* ignore */ }
  }, [detail, newUpdate]);

  const filteredProjects = statusFilter === 'all' ? projects : projects.filter((p) => p.status === statusFilter);
  const activeCount = projects.filter((p) => p.status === 'active').length;

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
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold text-th-text">Projects</h2>
            {activeCount > 0 && (
              <span className="rounded-full bg-th-elevated px-1.5 py-0.5 text-[10px] text-th-text-muted">{activeCount}</span>
            )}
          </div>
          <button onClick={createProject} className="rounded-lg p-2 text-th-text-secondary hover:bg-th-elevated hover:text-cyan-400">
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Status filter */}
        <div className="flex gap-1 border-b border-th-border px-3 py-1.5">
          {(['all', 'active', 'paused', 'completed'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded px-2 py-0.5 text-[10px] capitalize ${statusFilter === s ? 'bg-cyan-600/20 text-cyan-400' : 'text-th-text-muted hover:text-th-text-secondary'}`}
            >{s}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto">
          {filteredProjects.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-th-text-muted">
              <FolderOpen className="h-8 w-8" />
              <p className="text-xs">{projects.length === 0 ? 'No projects yet' : 'No matching projects'}</p>
              {projects.length === 0 && (
                <button onClick={createProject} className="mt-1 rounded-md bg-cyan-600 px-3 py-1.5 text-xs text-white hover:bg-cyan-500">
                  Create First Project
                </button>
              )}
            </div>
          )}

          {filteredProjects.map((project) => {
            const StatusIcon = statusIcons[project.status] || Circle;
            const progress = project.taskCount > 0 ? Math.round((project.completedTaskCount / project.taskCount) * 100) : 0;
            const isCompleted = project.status === 'completed';
            return (
              <button
                key={project.id}
                onClick={() => setActiveId(project.id)}
                className={`group flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors ${
                  activeId === project.id
                    ? 'bg-th-elevated text-th-text'
                    : isCompleted
                      ? 'text-th-text-muted hover:bg-th-elevated/50'
                      : 'text-th-text-secondary hover:bg-th-elevated/50 hover:text-th-text'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <StatusIcon className={`h-3 w-3 shrink-0 ${statusColors[project.status]}`} />
                    <p className={`truncate text-sm ${isCompleted ? 'line-through' : ''}`}>{project.title || 'New Project'}</p>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2 ml-5">
                    {project.taskCount > 0 && (
                      <span className="text-[10px] text-th-text-muted">{project.completedTaskCount}/{project.taskCount}</span>
                    )}
                    {progress > 0 && (
                      <div className="h-1.5 w-16 rounded-full bg-th-border overflow-hidden">
                        <div className={`h-full rounded-full ${progress === 100 ? 'bg-emerald-400' : 'bg-cyan-400'}`} style={{ width: `${progress}%` }} />
                      </div>
                    )}
                  </div>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
                  className="ml-1 shrink-0 rounded p-1.5 text-th-text-muted opacity-0 hover:text-red-400 group-hover:opacity-100"
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
            <div className="flex items-center border-b border-th-border md:hidden">
              <button onClick={() => setActiveId(null)} className="px-3 py-3 text-xs text-cyan-400">&larr; Back</button>
            </div>

            {/* Project header */}
            <div className={`border-b border-th-border px-6 py-4 ${detail.status === 'completed' ? 'opacity-70' : ''}`}>
              <input
                value={detail.title}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="Project title"
                className="w-full bg-transparent text-lg font-semibold text-th-text outline-none placeholder-th-text-muted"
              />

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <select
                  value={detail.status}
                  onChange={(e) => { updateField('status', e.target.value); trackActivity('project_status_changed', { projectId: detail.id, status: e.target.value }); }}
                  className="rounded-md border border-th-border bg-th-input px-2 py-1.5 text-xs text-th-text outline-none focus:border-cyan-600"
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="completed">Completed</option>
                </select>

                <input
                  type="date"
                  value={detail.targetDate || ''}
                  onChange={(e) => updateField('targetDate', e.target.value || null)}
                  className="rounded-md border border-th-border bg-th-input px-2 py-1.5 text-xs text-th-text outline-none focus:border-cyan-600"
                />
              </div>

              {/* Tags */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {detail.tags.map((tag) => (
                  <span key={tag} className="group flex items-center gap-0.5 rounded-full bg-cyan-600/10 px-2 py-0.5 text-[11px] text-cyan-400">
                    <Hash className="h-3 w-3" />{tag}
                    <button onClick={() => removeTag(tag)} className="ml-0.5 opacity-0 group-hover:opacity-100 hover:text-red-400">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addTag(); }}
                  placeholder="+ tag"
                  className="w-16 bg-transparent text-[11px] text-th-text-muted outline-none placeholder-th-text-muted"
                />
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
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-th-text-secondary">
                  Tasks {detail.tasks.length > 0 && `(${detail.tasks.filter((t) => t.status === 'completed').length}/${detail.tasks.length})`}
                </h3>
                {detail.tasks.some((t) => t.status === 'completed') && (
                  <button
                    onClick={() => setHideCompleted(!hideCompleted)}
                    className="flex items-center gap-1 text-[10px] text-th-text-muted hover:text-th-text-secondary"
                  >
                    <Filter className="h-3 w-3" />
                    {hideCompleted ? 'Show completed' : 'Hide completed'}
                  </button>
                )}
              </div>

              {/* Progress bar */}
              {detail.tasks.length > 0 && (
                <div className="mb-3 h-2 w-full rounded-full bg-th-border overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      detail.tasks.every((t) => t.status === 'completed') ? 'bg-emerald-400' : 'bg-cyan-400'
                    }`}
                    style={{ width: `${Math.round((detail.tasks.filter((t) => t.status === 'completed').length / detail.tasks.length) * 100)}%` }}
                  />
                </div>
              )}

              <div className="space-y-1">
                {detail.tasks
                  .filter((t) => !hideCompleted || t.status !== 'completed')
                  .map((task) => (
                  <div key={task.id} className="group flex items-center gap-2.5 rounded-md px-1 py-2 hover:bg-th-elevated/50">
                    <button onClick={() => handleToggleTask(task)} className="shrink-0 text-th-text-secondary hover:text-cyan-400 h-8 w-8 flex items-center justify-center">
                      {task.status === 'completed'
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        : <Circle className="h-4 w-4" />}
                    </button>
                    {editingTaskId === task.id ? (
                      <input
                        value={editingTaskTitle}
                        onChange={(e) => setEditingTaskTitle(e.target.value)}
                        onBlur={saveEditTask}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEditTask(); if (e.key === 'Escape') setEditingTaskId(null); }}
                        autoFocus
                        className="flex-1 bg-transparent text-base md:text-sm text-th-text outline-none border-b border-cyan-600"
                      />
                    ) : (
                      <span
                        className={`flex-1 text-sm cursor-text ${task.status === 'completed' ? 'text-th-text-muted line-through' : 'text-th-text'}`}
                        onClick={() => startEditTask(task)}
                      >
                        {renderRichText(task.title)}
                      </span>
                    )}
                    {task.assignee && (
                      <span className="text-[10px] text-purple-400">@{task.assignee}</span>
                    )}
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100">
                      <button onClick={() => startEditTask(task)} className="rounded p-1.5 text-th-text-muted hover:text-cyan-400">
                        <Pencil className="h-3 w-3" />
                      </button>
                      <button onClick={() => handleDeleteTask(task.id)} className="rounded p-1.5 text-th-text-muted hover:text-red-400">
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
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
                <input
                  value={newTaskAssignee}
                  onChange={(e) => setNewTaskAssignee(e.target.value)}
                  placeholder="@assign"
                  className="w-20 bg-transparent text-[11px] text-purple-400 outline-none placeholder-th-text-muted"
                />
                <button
                  onClick={handleAddTask}
                  disabled={!newTaskTitle.trim()}
                  className="rounded-md bg-cyan-600 px-2 py-1 text-[11px] text-white hover:bg-cyan-500 disabled:opacity-30"
                >Add</button>
              </div>
            </div>

            {/* Progress Updates */}
            <div className="px-6 py-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-th-text-secondary">Progress Updates</h3>

              <div className="mb-3 flex items-start gap-2">
                <textarea
                  value={newUpdate}
                  onChange={(e) => setNewUpdate(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) handleAddUpdate(); }}
                  placeholder="Log a progress update... (Ctrl+Enter to send)"
                  rows={2}
                  className="flex-1 resize-none rounded-lg border border-th-border bg-th-input px-3 py-2 text-base md:text-sm text-th-text outline-none placeholder-th-text-muted focus:border-cyan-600"
                />
                <button
                  onClick={handleAddUpdate}
                  disabled={!newUpdate.trim()}
                  className="mt-1 rounded-lg bg-cyan-600 p-2.5 text-white hover:bg-cyan-500 disabled:opacity-50"
                >
                  <Send className="h-4 w-4" />
                </button>
              </div>

              {detail.updates.length === 0 ? (
                <p className="text-xs text-th-text-muted">No updates yet. Log your first progress note above.</p>
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
