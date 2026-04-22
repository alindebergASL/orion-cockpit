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
  Sparkles,
  RefreshCw,
  Smile,
  StickyNote,
  ChevronDown,
} from 'lucide-react';
import type { Project, ProjectDetail, ProjectTask, ProjectNote, ProjectDigest } from '../../types';
import { api } from '../../lib/api';
import { renderRichText } from '../../lib/richText';
import { trackActivity } from '../../lib/activity';
import { showToast, showUndoToast } from '../Toast';

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

const PROJECT_COLORS = [
  { name: 'slate',   hex: '#64748b' },
  { name: 'red',     hex: '#ef4444' },
  { name: 'orange',  hex: '#f97316' },
  { name: 'amber',   hex: '#f59e0b' },
  { name: 'emerald', hex: '#10b981' },
  { name: 'cyan',    hex: '#06b6d4' },
  { name: 'blue',    hex: '#3b82f6' },
  { name: 'purple',  hex: '#8b5cf6' },
  { name: 'pink',    hex: '#ec4899' },
] as const;

function getColorHex(name: string | null | undefined): string {
  const found = PROJECT_COLORS.find((c) => c.name === name);
  return found ? found.hex : '#64748b';
}

const EMOJI_CATEGORIES: { name: string; emojis: string[] }[] = [
  { name: 'Home & Family',  emojis: ['🏠', '🏡', '👨‍👩‍👧', '👶', '🐶', '🐱', '🛋️', '🛏️', '🔑'] },
  { name: 'Health',         emojis: ['💪', '🏃', '🧘', '🚴', '🏋️', '❤️', '🥗', '💊', '🦷'] },
  { name: 'Money',          emojis: ['💰', '📊', '💳', '🏦', '📈', '💸', '🪙'] },
  { name: 'Travel',         emojis: ['✈️', '🏖️', '🗺️', '🚗', '🏕️', '🎒', '🧳', '🌍'] },
  { name: 'Learning',       emojis: ['📚', '🎓', '✏️', '📝', '💡', '🧠', '🔬'] },
  { name: 'Creative',       emojis: ['🎨', '🎵', '📷', '🎬', '✍️', '🎭', '🎸'] },
  { name: 'Food',           emojis: ['🍳', '🍕', '🍎', '☕', '🍷', '🥘', '🍰'] },
  { name: 'Nature',         emojis: ['🌱', '🌿', '🌸', '🌞', '🌊', '🌲', '🌙'] },
  { name: 'Work',           emojis: ['💼', '🚀', '⭐', '🎯', '📅', '⚡', '🔥', '🏆'] },
];

function ProgressRing({ progress, size = 28, stroke = 3, color }: { progress: number; size?: number; stroke?: number; color: string }) {
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const offset = circumference * (1 - Math.max(0, Math.min(100, progress)) / 100);
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeWidth={stroke} className="text-th-border" />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={stroke}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
        style={{ transition: 'stroke-dashoffset 0.4s ease' }}
      />
    </svg>
  );
}

function HealthBadge({ health }: { health: ProjectDigest['health'] }) {
  const config = {
    on_track:         { label: 'On Track',         dot: 'bg-emerald-400', text: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    at_risk:          { label: 'At Risk',          dot: 'bg-amber-400',   text: 'text-amber-400',   bg: 'bg-amber-400/10'   },
    needs_attention:  { label: 'Needs Attention',  dot: 'bg-red-400',     text: 'text-red-400',     bg: 'bg-red-400/10'     },
  }[health];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium ${config.bg} ${config.text}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${config.dot}`} />
      {config.label}
    </span>
  );
}

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
  const [digest, setDigest] = useState<ProjectDigest | null>(null);
  const [digestLoading, setDigestLoading] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [planLoading, setPlanLoading] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const detailIdRef = useRef<number | null>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);

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
    setDigest(null);
    api.getProject(activeId)
      .then(setDetail)
      .catch(() => setDetail(null))
      .finally(() => setLoadingDetail(false));
  }, [activeId]);

  // Close emoji picker on outside click
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handler = (e: MouseEvent) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(e.target as Node)) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [showEmojiPicker]);

  const createProject = useCallback(async () => {
    try {
      const project = await api.createProject();
      setProjects((prev) => [project, ...prev]);
      setActiveId(project.id);
      trackActivity('project_created', { projectId: project.id });
    } catch { /* ignore */ }
  }, []);

  const deleteProject = useCallback((id: number) => {
    const projectToDelete = projects.find((p) => p.id === id);
    if (!projectToDelete) return;

    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (activeId === id) { setActiveId(null); setDetail(null); }

    let undone = false;
    showUndoToast(
      `Deleted "${projectToDelete.title || 'project'}"`,
      () => {
        undone = true;
        setProjects((prev) => [projectToDelete, ...prev]);
      },
      {
        onExpire: async () => {
          if (undone) return;
          try {
            await api.deleteProject(id);
            trackActivity('project_deleted', { projectId: id });
          } catch {
            setProjects((prev) => [projectToDelete, ...prev]);
            showToast('Failed to delete project', 'error');
          }
        },
      },
    );
  }, [activeId, projects]);

  // Use ref for stable ID in debounced saves
  const updateField = useCallback((field: string, value: unknown) => {
    if (!detail) return;
    setDetail({ ...detail, [field]: value } as ProjectDetail);
    // Keep sidebar projects list in sync for icon/color/title/status
    if (field === 'icon' || field === 'color' || field === 'title' || field === 'status') {
      setProjects((prev) => prev.map((p) => p.id === detail.id ? { ...p, [field]: value } as Project : p));
    }
    const id = detailIdRef.current;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (id) api.updateProject(id, { [field]: value }).catch(() => {});
    }, 500);
  }, [detail]);

  const handleSetIcon = useCallback((emoji: string | null) => {
    updateField('icon', emoji);
    setShowEmojiPicker(false);
  }, [updateField]);

  const handleSetColor = useCallback((colorName: string) => {
    updateField('color', colorName);
  }, [updateField]);

  const fetchDigest = useCallback(async () => {
    if (!detail) return;
    setDigestLoading(true);
    try {
      const d = await api.getProjectDigest(detail.id);
      setDigest(d);
      trackActivity('project_digest_generated', { projectId: detail.id });
    } catch {
      setDigest(null);
    } finally {
      setDigestLoading(false);
    }
  }, [detail]);

  const handleGeneratePlan = useCallback(async () => {
    if (!detail) return;
    setPlanLoading(true);
    try {
      const { tasks } = await api.generateProjectPlan(detail.id);
      setDetail((prev) => prev ? { ...prev, tasks: [...prev.tasks, ...tasks] } : prev);
      setProjects((prev) => prev.map((p) => p.id === detail.id ? { ...p, taskCount: p.taskCount + tasks.length } : p));
      trackActivity('project_plan_generated', { projectId: detail.id, taskCount: tasks.length });
    } catch { /* ignore */ }
    finally {
      setPlanLoading(false);
    }
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

  // ── Project notes ──────────────────────────────────
  const [activeNoteId, setActiveNoteId] = useState<number | null>(null);
  const [noteTitle, setNoteTitle] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [notesExpanded, setNotesExpanded] = useState(true);
  const noteDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const activeNote = detail?.notes.find((n) => n.id === activeNoteId);

  const handleCreateNote = useCallback(async () => {
    if (!detail) return;
    try {
      const note = await api.addProjectNote(detail.id, 'Untitled', '');
      setDetail({ ...detail, notes: [note, ...detail.notes] });
      setActiveNoteId(note.id);
      setNoteTitle('Untitled');
      setNoteContent('');
    } catch { /* ignore */ }
  }, [detail]);

  const handleSelectNote = useCallback((note: ProjectNote) => {
    setActiveNoteId(note.id);
    setNoteTitle(note.title);
    setNoteContent(note.content);
  }, []);

  const handleNoteFieldChange = useCallback((field: 'title' | 'content', value: string) => {
    if (!detail || activeNoteId === null) return;
    if (field === 'title') setNoteTitle(value);
    else setNoteContent(value);
    setDetail({
      ...detail,
      notes: detail.notes.map((n) => n.id === activeNoteId ? { ...n, [field]: value, updatedAt: new Date().toISOString() } : n),
    });
    if (noteDebounceRef.current) clearTimeout(noteDebounceRef.current);
    const noteId = activeNoteId;
    noteDebounceRef.current = setTimeout(() => {
      api.updateProjectNote(detail.id, noteId, { [field]: value }).catch(() => {});
    }, 500);
  }, [detail, activeNoteId]);

  const handleDeleteNote = useCallback((noteId: number) => {
    if (!detail) return;
    const noteToDelete = detail.notes.find((n) => n.id === noteId);
    if (!noteToDelete) return;
    const currentDetail = detail;

    setDetail({ ...detail, notes: detail.notes.filter((n) => n.id !== noteId) });
    if (activeNoteId === noteId) setActiveNoteId(null);

    let undone = false;
    showUndoToast(
      `Deleted "${noteToDelete.title || 'note'}"`,
      () => {
        undone = true;
        setDetail((prev) => prev && prev.id === currentDetail.id
          ? { ...prev, notes: [noteToDelete, ...prev.notes] }
          : prev);
      },
      {
        onExpire: async () => {
          if (undone) return;
          try {
            await api.deleteProjectNote(currentDetail.id, noteId);
          } catch {
            setDetail((prev) => prev && prev.id === currentDetail.id
              ? { ...prev, notes: [noteToDelete, ...prev.notes] }
              : prev);
            showToast('Failed to delete note', 'error');
          }
        },
      },
    );
  }, [detail, activeNoteId]);

  useEffect(() => {
    setActiveNoteId(null);
  }, [activeId]);

  const filteredProjects = statusFilter === 'all' ? projects : projects.filter((p) => p.status === statusFilter);
  const activeCount = projects.filter((p) => p.status === 'active').length;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-th-border-strong border-t-cyan-400" />
      </div>
    );
  }

  const detailColorHex = detail ? getColorHex(detail.color) : '#64748b';

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
            const colorHex = getColorHex(project.color);
            return (
              <button
                key={project.id}
                onClick={() => setActiveId(project.id)}
                style={{ borderLeftColor: colorHex, borderLeftWidth: '3px' }}
                className={`group flex w-full items-center gap-2 pr-2 py-2.5 pl-2 text-left transition-colors ${
                  activeId === project.id
                    ? 'bg-th-elevated text-th-text'
                    : isCompleted
                      ? 'text-th-text-muted hover:bg-th-elevated/50'
                      : 'text-th-text-secondary hover:bg-th-elevated/50 hover:text-th-text'
                }`}
              >
                {/* Progress ring or status icon */}
                {project.taskCount > 0 ? (
                  <ProgressRing progress={progress} size={26} stroke={2.5} color={progress === 100 ? '#10b981' : colorHex} />
                ) : (
                  <div className="flex h-[26px] w-[26px] items-center justify-center">
                    <StatusIcon className={`h-3.5 w-3.5 ${statusColors[project.status]}`} />
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {project.icon && <span className="text-sm leading-none">{project.icon}</span>}
                    <p className={`truncate text-sm ${isCompleted ? 'line-through' : ''}`}>{project.title || 'New Project'}</p>
                  </div>
                  {project.taskCount > 0 && (
                    <div className="mt-0.5 text-[10px] text-th-text-muted">
                      {project.completedTaskCount}/{project.taskCount} · {progress}%
                    </div>
                  )}
                </div>

                <button
                  onClick={(e) => { e.stopPropagation(); deleteProject(project.id); }}
                  className="shrink-0 rounded p-1.5 text-th-text-muted opacity-0 hover:text-red-400 group-hover:opacity-100"
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
              <button onClick={() => setActiveId(null)} className="flex items-center gap-1 px-3 py-3 text-sm text-cyan-400">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
                Back
              </button>
            </div>

            {/* Cover gradient strip */}
            <div
              className="h-20 w-full"
              style={{ background: `linear-gradient(135deg, ${detailColorHex}35 0%, ${detailColorHex}10 50%, transparent 100%)` }}
            />

            {/* Project header */}
            <div className={`border-b border-th-border px-6 pt-4 pb-4 -mt-10 relative ${detail.status === 'completed' ? 'opacity-80' : ''}`}>
              {/* Emoji + color selector row */}
              <div className="flex items-start gap-3 mb-3">
                <div className="relative" ref={emojiPickerRef}>
                  <button
                    onClick={() => setShowEmojiPicker((v) => !v)}
                    className="flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-th-border bg-th-surface shadow-sm hover:border-th-border-strong transition-colors"
                    style={{ borderColor: detail.icon ? 'transparent' : undefined, background: detail.icon ? `${detailColorHex}15` : undefined }}
                    title="Set project icon"
                  >
                    {detail.icon ? (
                      <span className="text-3xl leading-none">{detail.icon}</span>
                    ) : (
                      <Smile className="h-6 w-6 text-th-text-muted" />
                    )}
                  </button>

                  {showEmojiPicker && (
                    <div className="fixed inset-x-4 bottom-auto z-30 sm:absolute sm:inset-x-auto sm:left-0 sm:top-full mt-2 max-w-72 max-h-80 overflow-y-auto rounded-lg border border-th-border bg-th-surface shadow-xl">
                      <div className="flex items-center justify-between border-b border-th-border px-3 py-2">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-th-text-secondary">Pick icon</span>
                        {detail.icon && (
                          <button onClick={() => handleSetIcon(null)} className="text-[10px] text-th-text-muted hover:text-red-400">Clear</button>
                        )}
                      </div>
                      {EMOJI_CATEGORIES.map((cat) => (
                        <div key={cat.name} className="px-3 py-2">
                          <div className="mb-1 text-[10px] text-th-text-muted">{cat.name}</div>
                          <div className="flex flex-wrap gap-1">
                            {cat.emojis.map((e) => (
                              <button
                                key={e}
                                onClick={() => handleSetIcon(e)}
                                className="flex h-9 w-9 md:h-7 md:w-7 items-center justify-center rounded hover:bg-th-elevated text-lg"
                              >{e}</button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <input
                    value={detail.title}
                    onChange={(e) => updateField('title', e.target.value)}
                    placeholder="Project title"
                    className="w-full bg-transparent text-xl font-semibold text-th-text outline-none placeholder-th-text-muted"
                  />
                  {/* Color selector */}
                  <div className="mt-2 flex items-center gap-1.5">
                    {PROJECT_COLORS.map((c) => (
                      <button
                        key={c.name}
                        onClick={() => handleSetColor(c.name)}
                        title={c.name}
                        className={`h-4 w-4 rounded-full transition-transform hover:scale-110 ${detail.color === c.name ? 'ring-2 ring-offset-2 ring-offset-th-surface' : ''}`}
                        style={{ backgroundColor: c.hex, ...((detail.color === c.name) ? { boxShadow: `0 0 0 2px ${c.hex}` } : {}) }}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
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

            {/* AI Digest Card */}
            <div className="border-b border-th-border px-6 py-3">
              <div className="rounded-xl border border-th-border bg-gradient-to-br from-th-surface to-th-elevated/30 p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-purple-400" />
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-th-text-secondary">AI Insights</h3>
                    {digest && <HealthBadge health={digest.health} />}
                  </div>
                  <button
                    onClick={fetchDigest}
                    disabled={digestLoading}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-[10px] text-th-text-muted hover:bg-th-elevated hover:text-th-text-secondary disabled:opacity-50"
                    title={digest ? 'Refresh' : 'Generate insights'}
                  >
                    <RefreshCw className={`h-3 w-3 ${digestLoading ? 'animate-spin' : ''}`} />
                    {digest ? 'Refresh' : 'Analyze'}
                  </button>
                </div>

                {digestLoading && !digest && (
                  <div className="space-y-2">
                    <div className="h-3 w-3/4 rounded bg-th-elevated animate-pulse" />
                    <div className="h-3 w-full rounded bg-th-elevated animate-pulse" />
                    <div className="h-3 w-5/6 rounded bg-th-elevated animate-pulse" />
                  </div>
                )}

                {!digestLoading && !digest && (
                  <p className="text-xs text-th-text-muted">
                    Get an AI-generated health check, narrative summary, and next action for this project.
                  </p>
                )}

                {digest && (
                  <div className="space-y-2">
                    <p className="text-sm text-th-text leading-relaxed">{digest.summary}</p>
                    {digest.nextAction && (
                      <div className="mt-2 rounded-lg bg-th-elevated/60 px-3 py-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-th-text-muted mb-0.5">Next action</div>
                        <p className="text-sm text-th-text-secondary">{digest.nextAction}</p>
                      </div>
                    )}
                    {digest.blockers && digest.blockers.length > 0 && (
                      <div className="mt-2">
                        <div className="text-[10px] font-semibold uppercase tracking-wider text-th-text-muted mb-0.5">Blockers</div>
                        <ul className="list-disc pl-4 space-y-0.5">
                          {digest.blockers.map((b, i) => (
                            <li key={i} className="text-sm text-th-text-secondary">{b}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
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

            {/* Notes */}
            <div className="border-b border-th-border px-6 py-4">
              <div className="flex items-center justify-between mb-3">
                <button
                  onClick={() => setNotesExpanded(!notesExpanded)}
                  className="flex items-center gap-2"
                >
                  <StickyNote className="h-4 w-4 text-cyan-400" />
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-th-text-secondary">
                    Notes {detail.notes.length > 0 && `(${detail.notes.length})`}
                  </h3>
                  <ChevronDown className={`h-3 w-3 text-th-text-muted transition-transform ${notesExpanded ? '' : '-rotate-90'}`} />
                </button>
                <button
                  onClick={handleCreateNote}
                  className="flex items-center gap-1 rounded-md border border-th-border px-2 py-1 text-[11px] text-th-text-secondary hover:bg-th-elevated"
                >
                  <Plus className="h-3 w-3" /> Note
                </button>
              </div>

              {notesExpanded && (
                <>
                  {detail.notes.length === 0 ? (
                    <p className="text-xs text-th-text-muted">No notes yet. Add meeting notes, research, or ideas for this project.</p>
                  ) : (
                    <div className="space-y-1 mb-2">
                      {detail.notes.map((note) => (
                        <div
                          key={note.id}
                          className={`group flex items-center gap-2 rounded-md px-2 py-2 cursor-pointer ${activeNoteId === note.id ? 'bg-th-elevated' : 'hover:bg-th-elevated/50'}`}
                          onClick={() => handleSelectNote(note)}
                        >
                          <StickyNote className="h-3.5 w-3.5 text-th-text-muted shrink-0" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm text-th-text">{note.title || 'Untitled'}</p>
                            <p className="truncate text-xs text-th-text-muted">{note.content.slice(0, 60) || 'Empty note'}</p>
                          </div>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }}
                            className="shrink-0 rounded p-1.5 text-th-text-muted md:opacity-0 md:group-hover:opacity-100 hover:text-red-400"
                          >
                            <Trash2 className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeNoteId !== null && activeNote && (
                    <div className="rounded-lg border border-th-border bg-th-surface">
                      <input
                        value={noteTitle}
                        onChange={(e) => handleNoteFieldChange('title', e.target.value)}
                        placeholder="Note title"
                        className="w-full border-b border-th-border bg-transparent px-4 py-2.5 text-sm font-medium text-th-text outline-none placeholder-th-text-muted"
                      />
                      <textarea
                        value={noteContent}
                        onChange={(e) => handleNoteFieldChange('content', e.target.value)}
                        placeholder="Write your note... (supports Markdown)"
                        rows={5}
                        className="w-full resize-y bg-transparent px-4 py-3 text-base md:text-sm text-th-text-secondary leading-relaxed outline-none placeholder-th-text-muted font-mono"
                      />
                      <div className="flex items-center justify-between border-t border-th-border px-4 py-1.5">
                        <span className="text-[10px] text-th-text-muted">
                          {noteContent.split(/\s+/).filter(Boolean).length} words
                        </span>
                        <button
                          onClick={() => setActiveNoteId(null)}
                          className="text-[10px] text-th-text-muted hover:text-th-text-secondary"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* Tasks */}
            <div className="border-b border-th-border px-6 py-4">
              <div className="flex items-center justify-between mb-3 gap-2">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-th-text-secondary">
                    Tasks {detail.tasks.length > 0 && `(${detail.tasks.filter((t) => t.status === 'completed').length}/${detail.tasks.length})`}
                  </h3>
                  {detail.tasks.length > 0 && (
                    <ProgressRing
                      progress={Math.round((detail.tasks.filter((t) => t.status === 'completed').length / detail.tasks.length) * 100)}
                      size={22}
                      stroke={2.5}
                      color={detail.tasks.every((t) => t.status === 'completed') ? '#10b981' : detailColorHex}
                    />
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleGeneratePlan}
                    disabled={planLoading || !detail.title}
                    className="flex items-center gap-1 rounded-md bg-purple-600/15 px-2 py-1 text-[11px] text-purple-400 hover:bg-purple-600/25 disabled:opacity-40"
                    title="Generate tasks from project goal using AI"
                  >
                    <Sparkles className={`h-3 w-3 ${planLoading ? 'animate-pulse' : ''}`} />
                    {planLoading ? 'Generating…' : 'AI Plan'}
                  </button>
                  {detail.tasks.some((t) => t.status === 'completed') && (
                    <button
                      onClick={() => setHideCompleted(!hideCompleted)}
                      className="flex items-center gap-1 text-[10px] text-th-text-muted hover:text-th-text-secondary"
                    >
                      <Filter className="h-3 w-3" />
                      {hideCompleted ? 'Show' : 'Hide'} done
                    </button>
                  )}
                </div>
              </div>

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
                    <div className="flex items-center gap-0.5 md:opacity-0 md:group-hover:opacity-100">
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
