import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  CalendarDays,
  Scale,
  ChevronRight,
  ChevronDown,
  PlayCircle,
  MessageSquare,
  AlertCircle,
  ArrowRight,
  Lightbulb,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';
import { trackActivity } from '../../lib/activity';
import type { CalendarEvent, Task, Insight, Project } from '../../types';

// ── Helpers ──────────────────────────────────────────────

function getGreetingText(): string {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function isSameDay(dateStr: string, target: Date): boolean {
  const d = new Date(dateStr);
  return (
    d.getFullYear() === target.getFullYear() &&
    d.getMonth() === target.getMonth() &&
    d.getDate() === target.getDate()
  );
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatDay(d: Date): string {
  return d.toLocaleDateString([], { weekday: 'short' });
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

interface WeatherData {
  current: { tempF: string; description: string; humidity: string; feelsLikeF: string };
  today: { maxTempF: string; minTempF: string; description?: string };
  tomorrow: { maxTempF: string; minTempF: string; description?: string };
  location: string;
}

function navigateTab(tab: string) {
  window.dispatchEvent(new CustomEvent('orion-navigate', { detail: { tab } }));
}

function sendToChat(text: string) {
  navigateTab('chat');
  // Slight delay so ChatTab is mounted/active before we deliver the message
  setTimeout(() => {
    window.dispatchEvent(new CustomEvent('orion-chat-send', { detail: { text } }));
  }, 50);
}

// ── Status sentence ──────────────────────────────────────

function buildStatusSentence(
  events: CalendarEvent[],
  now: Date,
): string {
  const hour = now.getHours();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const upcomingToday = events
    .filter((e) => !e.allDay && new Date(e.start) > now && isSameDay(e.start, now))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const tomorrowEvents = events
    .filter((e) => !e.allDay && isSameDay(e.start, tomorrow))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  if (hour < 12) {
    if (upcomingToday[0]) {
      return `OpenClaw is helping you start the day — ${upcomingToday[0].title} at ${formatTime(upcomingToday[0].start)}.`;
    }
    return 'OpenClaw is helping you ease into the day — calendar is clear.';
  }

  if (hour < 17) {
    if (upcomingToday[0]) {
      return `OpenClaw is keeping you on track — ${upcomingToday[0].title} at ${formatTime(upcomingToday[0].start)}.`;
    }
    if (tomorrowEvents[0]) {
      return `OpenClaw is helping you look ahead — ${tomorrowEvents[0].title} tomorrow at ${formatTime(tomorrowEvents[0].start)}.`;
    }
    return 'OpenClaw is keeping things calm — the rest of the day is yours.';
  }

  // Evening
  if (tomorrowEvents[0]) {
    return `OpenClaw is helping you wrap up today — ${tomorrowEvents[0].title} at ${formatTime(tomorrowEvents[0].start)} tomorrow.`;
  }
  return 'OpenClaw is helping you wrap up today — tomorrow is wide open.';
}

// ── Sub-components ───────────────────────────────────────

function WeatherChip({ weather }: { weather: WeatherData }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-th-border bg-th-surface px-2.5 py-1 text-xs text-th-text-secondary">
      <span className="font-medium text-th-text">{weather.current.tempF}°</span>
      <span className="text-th-text-muted">{weather.current.description}</span>
    </span>
  );
}

function FamilyChip() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-th-border bg-th-surface px-2.5 py-1 text-xs text-th-text-secondary">
      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
      Family · all good
    </span>
  );
}

function RecapPill({
  insights,
  open,
  onToggle,
}: {
  insights: Insight[];
  open: boolean;
  onToggle: () => void;
}) {
  const count = insights.length;
  if (count === 0) return null;
  return (
    <div className="mt-2">
      <button
        onClick={onToggle}
        className="inline-flex items-center gap-1.5 rounded-full border border-th-ai/30 bg-th-ai-soft px-3 py-1 text-xs font-medium text-th-ai-text hover:border-th-ai/50"
      >
        <Sparkles className="h-3 w-3" />
        OpenClaw did {count} thing{count === 1 ? '' : 's'} today
        <ArrowRight className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && (
        <div className="mt-2 rounded-xl border border-th-ai/20 bg-th-ai-soft/40 p-4 animate-slide-up">
          <ul className="space-y-2">
            {insights.slice(0, 6).map((i) => (
              <li key={i.id} className="text-sm text-th-text-secondary">
                <span className="font-medium text-th-text">{i.title}</span>
                {i.body && <span className="text-th-text-muted"> — {i.body}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function InsightHighlight({ insight }: { insight: Insight }) {
  return (
    <button
      onClick={() => api.markInsightRead(insight.id).catch(() => {})}
      className="mb-3 flex w-full items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-left text-xs text-th-text-secondary hover:bg-amber-500/10"
    >
      <Lightbulb className="h-3.5 w-3.5 shrink-0 text-amber-400" />
      <span className="truncate">
        <span className="font-medium text-th-text">{insight.title}</span>
        {insight.body && <span className="text-th-text-muted"> · {insight.body}</span>}
      </span>
    </button>
  );
}

function HeroChatInput() {
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSend = () => {
    const v = value.trim();
    if (!v) return;
    sendToChat(v);
    setValue('');
  };

  // ⌘K focuses the hero input when it's visible (offsetParent is null when hidden by parent).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        const el = inputRef.current;
        if (el && el.offsetParent !== null) {
          e.preventDefault();
          e.stopImmediatePropagation();
          el.focus();
          el.select();
        }
      }
    };
    window.addEventListener('keydown', handler, { capture: true });
    return () => window.removeEventListener('keydown', handler, { capture: true } as EventListenerOptions);
  }, []);

  return (
    <div className="rounded-2xl border border-th-border bg-th-surface p-6 shadow-sm">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-th-ai-text" />
        <h2 className="text-base font-semibold text-th-text">What can I help with?</h2>
      </div>
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleSend();
            }
          }}
          placeholder="Try: Plan my DC trip…"
          className="flex-1 rounded-xl border border-th-border bg-th-input px-4 py-3 text-sm text-th-text placeholder-th-text-muted outline-none focus:border-th-accent"
        />
        <kbd className="hidden rounded-md border border-th-border bg-th-elevated px-2 py-1 text-[10px] font-medium text-th-text-muted sm:inline-block">
          ⌘K
        </kbd>
        <button
          onClick={handleSend}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-th-accent text-white hover:opacity-90 disabled:opacity-50"
          disabled={!value.trim()}
          aria-label="Send"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ProjectIcon({ project }: { project: Project }) {
  const ch = (project.icon || project.title.charAt(0) || '·').slice(0, 2);
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-base font-semibold"
      style={{
        backgroundColor: project.color ? `${project.color}22` : 'var(--color-accent-soft)',
        color: project.color || 'var(--color-accent-text)',
      }}
    >
      {ch}
    </div>
  );
}

function FocusCard({
  project,
  focusTask,
  openItems,
  recommendation,
  onOpenTask,
}: {
  project: Project | null;
  focusTask: Task | null;
  openItems: Task[];
  recommendation: string | null;
  onOpenTask: (task: Task) => void;
}) {
  // No projects at all
  if (!project) {
    return (
      <div className="rounded-2xl border border-th-border bg-th-surface p-6 text-center">
        <p className="mb-3 text-sm text-th-text-secondary">You don&apos;t have an active project yet.</p>
        <button
          onClick={() => sendToChat('Help me set up a new project to focus on.')}
          className="inline-flex items-center gap-1.5 rounded-full bg-th-ai-soft px-3 py-1.5 text-xs font-medium text-th-ai-text hover:opacity-90"
        >
          <Sparkles className="h-3 w-3" />
          Ask OpenClaw to set one up
        </button>
      </div>
    );
  }

  const start = new Date(project.createdAt);
  const target = project.targetDate ? new Date(project.targetDate) : null;
  const daysToGo = target ? daysBetween(new Date(), target) : null;
  const dateRange = target
    ? `${start.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${target.toLocaleDateString([], { month: 'short', day: 'numeric' })}`
    : start.toLocaleDateString([], { month: 'short', day: 'numeric' });

  const completed = project.completedTaskCount;
  const total = project.taskCount;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const dueChip = focusTask?.dueDate
    ? new Date(focusTask.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })
    : null;

  return (
    <div className="rounded-2xl border border-th-border bg-th-surface p-6">
      <div className="flex items-start gap-3">
        <ProjectIcon project={project} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-base font-semibold text-th-text">{project.title}</h3>
          <p className="text-xs text-th-text-muted">
            {dateRange}
            {daysToGo !== null && daysToGo >= 0 && (
              <> · <span className="text-th-text-secondary">{daysToGo} day{daysToGo === 1 ? '' : 's'} to go</span></>
            )}
          </p>
        </div>
      </div>

      {focusTask && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-sm text-th-text-muted">Right now:</span>
          <span className="text-sm font-medium text-th-text">{focusTask.title}</span>
          {dueChip && (
            <span className="rounded-full border border-th-border bg-th-elevated px-2 py-0.5 text-[11px] text-th-text-secondary">
              Due {dueChip}
            </span>
          )}
          <button
            onClick={() => onOpenTask(focusTask)}
            className="ml-auto inline-flex items-center gap-1 rounded-lg border border-th-border bg-th-elevated px-3 py-1 text-xs text-th-text-secondary hover:bg-th-surface"
          >
            Open task
            <ChevronRight className="h-3 w-3" />
          </button>
        </div>
      )}

      <div className="mt-4">
        <div className="mb-1 flex items-center justify-between text-[11px] text-th-text-muted">
          <span>{completed}/{total || 0} done</span>
          <span>{pct}%</span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-th-elevated">
          <div
            className="h-full rounded-full bg-th-accent"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {openItems.length > 0 && (
        <div className="mt-4 divide-y divide-th-border rounded-xl border border-th-border">
          {openItems.slice(0, 3).map((t) => (
            <button
              key={t.id}
              onClick={() => onOpenTask(t)}
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-th-elevated/50"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-th-text-muted" />
              <span className="flex-1 truncate text-sm text-th-text">{t.title}</span>
              <ChevronRight className="h-4 w-4 shrink-0 text-th-text-muted" />
            </button>
          ))}
        </div>
      )}

      {recommendation && (
        <button
          onClick={() => sendToChat(recommendation)}
          className="mt-4 flex w-full items-center gap-2 rounded-xl border border-th-ai/20 bg-th-ai-soft/50 px-3 py-2 text-left text-xs"
        >
          <Sparkles className="h-3 w-3 shrink-0 text-th-ai-text" />
          <span className="flex-1 truncate text-th-text-secondary">
            <span className="font-medium text-th-ai-text">OpenClaw recommends:</span> {recommendation}
          </span>
          <span className="shrink-0 text-th-ai-text">Review →</span>
        </button>
      )}
    </div>
  );
}

function SummaryPills({
  events,
  insights,
  open,
  onOpen,
}: {
  events: CalendarEvent[];
  insights: Insight[];
  open: 'week' | 'decisions' | null;
  onOpen: (k: 'week' | 'decisions' | null) => void;
}) {
  // Build week summary
  const now = new Date();
  const week: { day: string; count: number; date: Date }[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() + i);
    const count = events.filter((e) => isSameDay(e.start, d)).length;
    week.push({ day: formatDay(d), count, date: d });
  }
  const todayCount = week[0]?.count ?? 0;
  const busyDay = week.slice(1, 5).reduce((max, d) => (d.count > max.count ? d : max), { day: '', count: 0, date: now });
  const summaryText =
    todayCount === 0
      ? 'Today clear'
      : `Today ${todayCount} event${todayCount === 1 ? '' : 's'}`;
  const busyText = busyDay.count >= 3 ? `${busyDay.day} busy` : 'rest of week light';

  const decisions = insights.length;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-th-border bg-th-surface">
        <button
          onClick={() => onOpen(open === 'week' ? null : 'week')}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <CalendarDays className="h-4 w-4 shrink-0 text-th-accent-text" />
          <span className="flex-1 truncate text-sm text-th-text-secondary">
            {summaryText} · {busyText} · Weekend with family
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-th-text-muted transition-transform ${open === 'week' ? 'rotate-180' : ''}`}
          />
        </button>
        {open === 'week' && (
          <div className="border-t border-th-border px-4 py-3 animate-slide-up">
            <ul className="space-y-1.5 text-xs">
              {week.map((d) => (
                <li key={d.day + d.date.toDateString()} className="flex justify-between text-th-text-secondary">
                  <span>{d.day} {d.date.getMonth() + 1}/{d.date.getDate()}</span>
                  <span className="text-th-text-muted">
                    {d.count === 0 ? 'no events' : `${d.count} event${d.count === 1 ? '' : 's'}`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-th-border bg-th-surface">
        <button
          onClick={() => onOpen(open === 'decisions' ? null : 'decisions')}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <Scale className="h-4 w-4 shrink-0 text-th-accent-text" />
          <span className="flex-1 truncate text-sm text-th-text-secondary">
            {decisions} decision{decisions === 1 ? '' : 's'} waiting
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-th-text-muted transition-transform ${open === 'decisions' ? 'rotate-180' : ''}`}
          />
        </button>
        {open === 'decisions' && (
          <div className="border-t border-th-border px-4 py-3 animate-slide-up">
            {decisions === 0 ? (
              <p className="text-xs text-th-text-muted">Nothing waiting on you.</p>
            ) : (
              <ul className="space-y-1.5 text-xs">
                {insights.slice(0, 5).map((i) => (
                  <li key={i.id} className="text-th-text-secondary">
                    <span className="font-medium text-th-text">{i.title}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FooterPills({ resumeText }: { resumeText: string | null }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <button
        onClick={() => navigateTab('chat')}
        className="flex items-center gap-2 rounded-2xl border border-th-border bg-th-surface px-4 py-3 text-left hover:bg-th-elevated/50"
      >
        <PlayCircle className="h-4 w-4 shrink-0 text-emerald-400" />
        <span className="flex-1 truncate text-sm text-th-text-secondary">
          {resumeText ?? 'Resume where you left off'}
        </span>
      </button>
      <button
        onClick={() => navigateTab('chat')}
        className="flex items-center gap-2 rounded-2xl border border-th-border bg-th-surface px-4 py-3 text-left hover:bg-th-elevated/50"
      >
        <MessageSquare className="h-4 w-4 shrink-0 text-sky-400" />
        <span className="flex-1 truncate text-sm text-th-text-secondary">Return to chat</span>
      </button>
      <button
        onClick={() => sendToChat('What family update do I need to know about?')}
        className="flex items-center gap-2 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-left hover:bg-rose-500/15"
      >
        <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
        <span className="flex-1 truncate text-sm text-rose-100">Family update</span>
        <span className="shrink-0 rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold text-white">
          1
        </span>
      </button>
    </div>
  );
}

function InsightsCollapsible({
  insights,
  open,
  onToggle,
}: {
  insights: Insight[];
  open: boolean;
  onToggle: () => void;
}) {
  if (insights.length === 0) return null;
  return (
    <div className="rounded-2xl border border-th-border bg-th-surface">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-4 py-3 text-left"
      >
        <Lightbulb className="h-4 w-4 shrink-0 text-amber-400" />
        <span className="flex-1 truncate text-sm text-th-text-secondary">
          OpenClaw insights
        </span>
        <span className="text-xs text-th-text-muted">{insights.length}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-th-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="border-t border-th-border p-4 animate-slide-up space-y-2">
          {insights.map((i) => (
            <div key={i.id} className="rounded-xl border border-th-border bg-th-elevated/40 p-3">
              <p className="text-sm font-medium text-th-text">{i.title}</p>
              {i.body && <p className="mt-0.5 text-xs text-th-text-muted">{i.body}</p>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main Component ──────────────────────────────────────

export function TodayTab() {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  const [recapOpen, setRecapOpen] = useState(false);
  const [insightsOpen, setInsightsOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState<'week' | 'decisions' | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getCalendarEvents().catch(() => ({ events: [], syncedAt: null })),
      api.getTasks().catch(() => ({ tasks: [], syncedAt: null })),
      api.getWeather().catch(() => null),
      api.getInsights().catch(() => ({ insights: [], unreadCount: 0 })),
      api.getProjects().catch(() => []),
    ])
      .then(([calData, taskData, weatherData, insightData, projectData]) => {
        setEvents(calData.events);
        setTasks(taskData.tasks);
        setWeather(weatherData);
        setInsights(insightData.insights.filter((i: Insight) => !i.read));
        setProjects(projectData);
      })
      .finally(() => setLoading(false));
  }, []);

  const now = useMemo(() => new Date(), []);

  const activeProject = useMemo<Project | null>(() => {
    const active = projects.filter((p) => p.status === 'active');
    if (active.length === 0) return null;
    // Prefer one with an upcoming targetDate, then most recently updated
    active.sort((a, b) => {
      const at = a.targetDate ? new Date(a.targetDate).getTime() : Infinity;
      const bt = b.targetDate ? new Date(b.targetDate).getTime() : Infinity;
      if (at !== bt) return at - bt;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    return active[0] ?? null;
  }, [projects]);

  const focusTask = useMemo<Task | null>(() => {
    const open = tasks.filter((t) => t.status !== 'completed');
    const dueToday = open.filter((t) => t.dueDate && isSameDay(t.dueDate, now));
    dueToday.sort((a) => (a.priority === 'high' ? -1 : 1));
    return dueToday[0] ?? null;
  }, [tasks, now]);

  const openItems = useMemo<Task[]>(
    () => tasks.filter((t) => t.status !== 'completed').slice(0, 3),
    [tasks],
  );

  const topInsight = insights[0] ?? null;
  const restInsights = insights.slice(1);

  const recommendation = useMemo<string | null>(() => {
    if (!activeProject) return null;
    if (focusTask) return `Tackle "${focusTask.title}" before end of day.`;
    if (activeProject.taskCount > activeProject.completedTaskCount) {
      return `Pick up the next item on ${activeProject.title}.`;
    }
    return null;
  }, [activeProject, focusTask]);

  const resumeText = activeProject ? `Continue ${activeProject.title}` : null;

  const handleOpenTask = useCallback((task: Task) => {
    trackActivity('task_focus_opened', { taskId: task.id });
    navigateTab('tasks');
  }, []);

  const greeting = getGreetingText();
  const firstName = user?.displayName?.split(' ')[0] ?? '';
  const statusSentence = buildStatusSentence(events, now);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-th-border-strong border-t-cyan-400" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-x-hidden overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6 md:py-10 space-y-5">
        {/* 1. Greeting row */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold text-th-text">
            {greeting}, {firstName}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            {weather && <WeatherChip weather={weather} />}
            <FamilyChip />
          </div>
        </div>

        {/* 2. Status sentence + recap pill */}
        <div>
          <p className="text-sm text-th-text-secondary">{statusSentence}</p>
          <RecapPill insights={insights} open={recapOpen} onToggle={() => setRecapOpen((v) => !v)} />
        </div>

        {/* 3. Hero chat input */}
        <HeroChatInput />

        {/* 4. Focus card (with optional top insight pill above) */}
        <div>
          {topInsight && <InsightHighlight insight={topInsight} />}
          <FocusCard
            project={activeProject}
            focusTask={focusTask}
            openItems={openItems}
            recommendation={recommendation}
            onOpenTask={handleOpenTask}
          />
        </div>

        {/* 5. Two summary pills */}
        <SummaryPills
          events={events}
          insights={insights}
          open={summaryOpen}
          onOpen={setSummaryOpen}
        />

        {/* 6. Footer pill row */}
        <FooterPills resumeText={resumeText} />

        {/* Collapsible insights (closed by default) */}
        {restInsights.length > 0 && (
          <InsightsCollapsible
            insights={restInsights}
            open={insightsOpen}
            onToggle={() => setInsightsOpen((v) => !v)}
          />
        )}
      </div>
    </div>
  );
}
