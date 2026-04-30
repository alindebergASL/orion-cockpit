import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  CalendarDays,
  Scale,
  ChevronRight,
  ChevronDown,
  PenLine,
  MessageSquare,
  Users,
  ArrowRight,
  Lightbulb,
  Sun,
  Sunrise,
  Moon,
  Info,
  Circle,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';
import { trackActivity } from '../../lib/activity';
import type { CalendarEvent, Task, Insight, Project, ProjectDigest } from '../../types';

// ── Helpers ──────────────────────────────────────────────

function getGreeting(): { text: string; Icon: LucideIcon } {
  const hour = new Date().getHours();
  if (hour < 12) return { text: 'Good morning', Icon: Sunrise };
  if (hour < 17) return { text: 'Good afternoon', Icon: Sun };
  return { text: 'Good evening', Icon: Moon };
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

function timeAgo(d: Date): string {
  const s = Math.round((Date.now() - d.getTime()) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  return `${h}h ago`;
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
    <div className="inline-flex items-center gap-2 rounded-xl border border-th-border bg-th-surface px-3 py-2">
      <Sun className="h-5 w-5 shrink-0 text-amber-400" />
      <div className="leading-tight">
        <p className="text-sm font-semibold text-th-text">{weather.current.tempF}°F</p>
        <p className="text-[11px] text-th-text-muted">{weather.current.description}</p>
      </div>
    </div>
  );
}

function FamilyChip() {
  return (
    <div className="inline-flex items-center gap-2 rounded-xl border border-th-border bg-th-surface px-3 py-2">
      <div className="relative flex shrink-0">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-th-elevated text-[10px] font-medium text-th-text">A</span>
        <span className="flex h-7 w-7 -ml-2 items-center justify-center rounded-full bg-th-elevated text-[10px] font-medium text-th-text ring-2 ring-th-surface">L</span>
        <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-th-surface bg-emerald-400" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-semibold text-th-text">Family</p>
        <p className="text-[11px] text-th-text-muted">Everyone&apos;s good</p>
      </div>
    </div>
  );
}

const META_KEYWORDS = ['dashboard', 'usage pattern', 'activity is all', 'your browsing', 'session'];

function isMetaInsight(i: Insight): boolean {
  const text = `${i.title} ${i.body}`.toLowerCase();
  return META_KEYWORDS.some((kw) => text.includes(kw));
}

function isActionableInsight(i: Insight): boolean {
  return !!i.actionType && !isMetaInsight(i);
}

function RecapPill({
  actionSummary,
  insights,
  open,
  onToggle,
}: {
  actionSummary: string | null;
  insights: Insight[];
  open: boolean;
  onToggle: () => void;
}) {
  const actionable = insights.filter(isActionableInsight);
  if (!actionSummary && actionable.length === 0) return null;
  return (
    <div className="mt-1">
      <button
        onClick={onToggle}
        className="inline-flex items-center gap-1 text-xs font-medium text-th-ai-text hover:underline"
      >
        {actionSummary || `OpenClaw handled ${actionable.length} item${actionable.length === 1 ? '' : 's'} today`}
        <ArrowRight className={`h-3 w-3 transition-transform ${open ? 'rotate-90' : ''}`} />
      </button>
      {open && actionable.length > 0 && (
        <div className="mt-2 rounded-xl border border-th-ai/20 bg-th-ai-soft/40 p-4 animate-slide-up">
          <ul className="space-y-2">
            {actionable.slice(0, 5).map((i) => (
              <li key={i.id} className="text-sm text-th-text-secondary">
                <span className="font-medium text-th-text">{i.title}</span>
                {i.body && <span className="text-th-text-muted"> — {i.body}</span>}
              </li>
            ))}
          </ul>
          {actionable.length > 5 && (
            <p className="mt-2 text-xs text-th-text-muted">
              + {actionable.length - 5} more
            </p>
          )}
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
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-th-ai-text" />
          <h2 className="text-base font-semibold text-th-text">What can I help with?</h2>
        </div>
        <kbd className="hidden rounded-md border border-th-border bg-th-elevated px-2 py-1 text-[10px] font-medium text-th-text-muted sm:inline-block">
          ⌘K
        </kbd>
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
        <button
          onClick={handleSend}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-blue-500/90 text-white hover:bg-blue-500 disabled:opacity-50"
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
  const hasCustom = !!project.icon;
  const ch = (project.icon || '').slice(0, 2);
  return (
    <div
      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-base font-semibold text-purple-300"
      style={
        project.color
          ? { backgroundColor: `${project.color}22`, color: project.color }
          : undefined
      }
    >
      {hasCustom ? ch : <CalendarDays className="h-5 w-5" />}
    </div>
  );
}

function formatDueChip(dueIso: string, now: Date): { text: string; urgent: boolean } {
  const due = new Date(dueIso);
  const days = daysBetween(
    new Date(now.getFullYear(), now.getMonth(), now.getDate()),
    new Date(due.getFullYear(), due.getMonth(), due.getDate()),
  );
  if (days === 0) return { text: 'Due today', urgent: true };
  if (days === 1) return { text: 'Due tomorrow', urgent: true };
  if (days < 0) return { text: 'Overdue', urgent: true };
  return {
    text: due.toLocaleDateString([], { month: 'short', day: 'numeric' }),
    urgent: false,
  };
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

  const now = new Date();
  const target = project.targetDate ? new Date(project.targetDate) : null;
  const daysToGo = target ? daysBetween(now, target) : null;

  const completed = project.completedTaskCount;
  const total = project.taskCount;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;

  const focusDue = focusTask?.dueDate ? formatDueChip(focusTask.dueDate, now) : null;
  const metaText = project.tags && project.tags.length > 0 ? project.tags.join(' • ') : null;

  return (
    <div className="rounded-2xl border border-th-border bg-th-surface p-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Left column — project info */}
        <div className="min-w-0">
          <div className="flex items-start gap-3">
            <ProjectIcon project={project} />
            <h3 className="mt-1 min-w-0 flex-1 truncate text-base font-semibold text-th-text">
              {project.title}
            </h3>
          </div>

          {focusTask && (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <span className="text-sm text-th-text">
                <span className="text-th-text-muted">Right now:</span>{' '}
                <span className="font-medium">{focusTask.title}</span>
              </span>
              {focusDue && (
                <span
                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
                    focusDue.urgent
                      ? 'bg-rose-500/15 text-rose-400'
                      : 'border border-th-border bg-th-elevated text-th-text-secondary'
                  }`}
                >
                  {focusDue.text}
                </span>
              )}
              <button
                onClick={() => onOpenTask(focusTask)}
                className="inline-flex items-center gap-1 rounded-lg bg-blue-500 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500/90"
              >
                Open task
              </button>
            </div>
          )}

          {metaText && (
            <p className="mt-3 text-xs text-th-text-muted">{metaText}</p>
          )}

          <div className="mt-4 flex items-center gap-3">
            <span className="shrink-0 text-xs font-medium text-th-text-secondary">
              {completed} / {total || 0} tasks
            </span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-th-elevated">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
            </div>
            {daysToGo !== null && daysToGo >= 0 && (
              <span className="shrink-0 text-xs text-th-text-muted">
                {daysToGo} day{daysToGo === 1 ? '' : 's'} to go
              </span>
            )}
          </div>
        </div>

        {/* Right column — task list */}
        <div className="min-w-0">
          {openItems.length > 0 ? (
            <div className="space-y-2">
              {openItems.slice(0, 3).map((t) => {
                const due = t.dueDate ? formatDueChip(t.dueDate, now) : null;
                return (
                  <button
                    key={t.id}
                    onClick={() => onOpenTask(t)}
                    className="flex w-full items-center gap-3 rounded-xl border border-th-border bg-th-surface px-3 py-2.5 text-left hover:bg-th-elevated/50"
                  >
                    <Circle className="h-4 w-4 shrink-0 text-th-text-muted" />
                    <span className="flex-1 truncate text-sm text-th-text">{t.title}</span>
                    {due && (
                      <span
                        className={`shrink-0 text-[11px] font-medium ${
                          due.urgent ? 'text-rose-400' : 'text-th-text-muted'
                        }`}
                      >
                        {due.text}
                      </span>
                    )}
                    <ChevronRight className="h-4 w-4 shrink-0 text-th-text-muted" />
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full items-center justify-center rounded-xl border border-dashed border-th-border px-3 py-6 text-center text-xs text-th-text-muted">
              No open tasks — you&apos;re caught up.
            </div>
          )}
        </div>
      </div>

      {recommendation && (
        <button
          onClick={() => sendToChat(recommendation)}
          className="mt-5 flex w-full items-center gap-2 rounded-xl border border-th-ai/20 bg-th-ai-soft/50 px-3 py-2 text-left text-xs"
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

  const sat = new Date(now);
  sat.setDate(now.getDate() + (6 - now.getDay()));
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);
  const weekendEvts = events.filter((e) => isSameDay(e.start, sat) || isSameDay(e.start, sun));
  const weekendText = weekendEvts.length > 0 && weekendEvts[0]
    ? `Weekend: ${weekendEvts[0].title}`
    : now.getDay() < 5 ? 'weekend clear' : null;

  const calParts = [summaryText, busyText, weekendText].filter(Boolean).join(' · ');

  const decisions = insights.length;

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border border-th-border bg-th-surface">
        <button
          onClick={() => onOpen(open === 'week' ? null : 'week')}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/15 text-emerald-400">
            <CalendarDays className="h-4 w-4" />
          </span>
          <span className="flex-1 truncate text-sm text-th-text-secondary">
            {calParts}
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-th-text-muted transition-transform ${open === 'week' ? 'rotate-180' : ''}`}
          />
        </button>
        {open === 'week' && (
          <div className="border-t border-th-border px-4 py-3 animate-slide-up">
            {(() => {
              const busy = week.filter((d) => d.count > 0);
              if (busy.length === 0) return <p className="text-xs text-th-text-muted">No events this week.</p>;
              return (
                <p className="text-sm text-th-text-secondary leading-relaxed">
                  {busy.map((d, i) => (
                    <span key={d.day + d.date.toDateString()}>
                      {i > 0 && ', '}
                      <span className="font-medium text-th-text">{d.count}</span> on {d.day}
                    </span>
                  ))}
                  {busy.length < 7 && <span className="text-th-text-muted">, otherwise clear</span>}
                  .
                </p>
              );
            })()}
            <button onClick={() => navigateTab('calendar')} className="mt-2 text-xs text-th-accent-text hover:underline">
              Open calendar →
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-th-border bg-th-surface">
        <button
          onClick={() => onOpen(open === 'decisions' ? null : 'decisions')}
          className="flex w-full items-center gap-3 px-4 py-3 text-left"
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-500/15 text-purple-400">
            <Scale className="h-4 w-4" />
          </span>
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
              <div className="space-y-1.5">
                {insights.slice(0, 5).map((i) => (
                  <button
                    key={i.id}
                    onClick={() => {
                      if (i.actionType === 'navigate' && i.actionData) {
                        try {
                          const data = typeof i.actionData === 'string' ? JSON.parse(i.actionData) : i.actionData;
                          if (data.tab) navigateTab(data.tab as string);
                        } catch { /* ignore */ }
                      } else {
                        sendToChat(i.title);
                      }
                      api.markInsightRead(i.id).catch(() => {});
                    }}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-xs hover:bg-th-elevated/50"
                  >
                    <span className="flex-1 font-medium text-th-text">{i.title}</span>
                    <ChevronRight className="h-3 w-3 shrink-0 text-th-text-muted" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function FooterPills({ resumeText, familyAlerts }: { resumeText: string | null; familyAlerts: number }) {
  const hasAlert = familyAlerts > 0;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <button
        onClick={() => navigateTab('chat')}
        className="flex items-center gap-2 rounded-2xl border border-th-border bg-th-surface px-4 py-3 text-left hover:bg-th-elevated/50"
      >
        <PenLine className="h-4 w-4 shrink-0 text-emerald-400" />
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
        className={`flex items-center gap-2 rounded-2xl border px-4 py-3 text-left ${
          hasAlert
            ? 'border-rose-500/30 bg-rose-500/10 hover:bg-rose-500/15'
            : 'border-th-border bg-th-surface hover:bg-th-elevated/50'
        }`}
      >
        <Users className={`h-4 w-4 shrink-0 ${hasAlert ? 'text-rose-400' : 'text-th-text-secondary'}`} />
        <span className="flex-1 truncate text-sm text-th-text-secondary">Family update</span>
        {hasAlert && (
          <span className="shrink-0 rounded-full bg-rose-500 px-1.5 text-[10px] font-semibold text-white">
            {familyAlerts}
          </span>
        )}
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
  const [showAll, setShowAll] = useState(false);
  const filtered = insights.filter((i) => !isMetaInsight(i));
  if (filtered.length === 0) return null;
  const visible = showAll ? filtered : filtered.slice(0, 3);
  const hasMore = filtered.length > 3 && !showAll;
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
        <span className="text-xs text-th-text-muted">{filtered.length}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-th-text-muted transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
        <div className="border-t border-th-border p-4 animate-slide-up space-y-2">
          {visible.map((i) => (
            <button
              key={i.id}
              onClick={() => {
                if (i.actionType === 'navigate' && i.actionData) {
                  try {
                    const data = typeof i.actionData === 'string' ? JSON.parse(i.actionData) : i.actionData;
                    if (data.tab) navigateTab(data.tab as string);
                  } catch { /* ignore */ }
                } else {
                  sendToChat(i.title);
                }
                api.markInsightRead(i.id).catch(() => {});
              }}
              className="flex w-full items-start gap-3 rounded-xl border border-th-border bg-th-elevated/40 p-3 text-left hover:bg-th-elevated/70 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-th-text">{i.title}</p>
                {i.body && <p className="mt-0.5 text-xs text-th-text-muted">{i.body}</p>}
              </div>
              <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-th-text-muted" />
            </button>
          ))}
          {hasMore && (
            <button
              onClick={() => setShowAll(true)}
              className="w-full text-center text-xs text-th-ai-text hover:underline py-1"
            >
              Show all {filtered.length} insights
            </button>
          )}
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
  const [aiBriefing, setAiBriefing] = useState<string | null>(null);
  const [digest, setDigest] = useState<ProjectDigest | null>(null);
  const [journalOpen, setJournalOpen] = useState(false);
  const [journal, setJournal] = useState('');
  const [actionSummary, setActionSummary] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const journalSaveRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const briefingTriggered = useRef(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getCalendarEvents().catch(() => ({ events: [], syncedAt: null })),
      api.getTasks().catch(() => ({ tasks: [], syncedAt: null })),
      api.getWeather().catch(() => null),
      api.getInsights().catch(() => ({ insights: [], unreadCount: 0 })),
      api.getProjects().catch(() => []),
      api.getActivitySummary().catch(() => ({ summary: null, total: 0 })),
    ])
      .then(([calData, taskData, weatherData, insightData, projectData, activityData]) => {
        setEvents(calData.events);
        setTasks(taskData.tasks);
        setWeather(weatherData);
        setInsights(insightData.insights.filter((i: Insight) => !i.read));
        setProjects(projectData);
        setActionSummary(activityData.summary);
        setSyncedAt(new Date());
      })
      .finally(() => setLoading(false));
  }, []);

  const now = useMemo(() => new Date(), []);

  // Stream an AI briefing once primary data is in (today only).
  useEffect(() => {
    if (briefingTriggered.current) return;
    if (loading) return;
    briefingTriggered.current = true;
    const eventList = events
      .filter((e) => !e.allDay && isSameDay(e.start, now))
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
      .map((e) => ({ title: e.title, time: formatTime(e.start) }));
    setAiBriefing('');
    api
      .aiGenerateBriefing(
        {
          weather: weather
            ? {
                tempF: weather.current.tempF,
                description: weather.current.description,
                feelsLikeF: weather.current.feelsLikeF,
              }
            : undefined,
          events: eventList,
          taskCount: tasks.filter((t) => t.status !== 'completed').length,
          displayName: user?.displayName?.split(' ')[0],
          dayOfWeek: now.toLocaleDateString([], { weekday: 'long' }),
        },
        (chunk) => setAiBriefing((prev) => (prev ?? '') + chunk),
      )
      .catch(() => setAiBriefing(null));
  }, [loading, events, weather, tasks, user, now]);

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

  // Load today's journal lazily — only when the user opens it.
  const dateKey = useMemo(() => {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }, [now]);
  const journalLoaded = useRef(false);
  useEffect(() => {
    if (!journalOpen || journalLoaded.current) return;
    journalLoaded.current = true;
    api
      .getDailyNote(dateKey)
      .then((n) => setJournal(n.content || ''))
      .catch(() => {});
  }, [journalOpen, dateKey]);

  const handleJournalChange = useCallback(
    (value: string) => {
      setJournal(value);
      if (journalSaveRef.current) clearTimeout(journalSaveRef.current);
      journalSaveRef.current = setTimeout(() => {
        api.saveDailyNote(dateKey, value).catch(() => {});
      }, 500);
    },
    [dateKey],
  );

  // Fetch project digest for the active project (powers the recommendation strip).
  useEffect(() => {
    if (!activeProject) {
      setDigest(null);
      return;
    }
    let cancelled = false;
    api
      .getProjectDigest(activeProject.id)
      .then((d) => {
        if (!cancelled) setDigest(d);
      })
      .catch(() => {
        if (!cancelled) setDigest(null);
      });
    return () => {
      cancelled = true;
    };
  }, [activeProject]);

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

  const surfaceInsights = insights.filter((i) => !isMetaInsight(i));
  const topInsight = surfaceInsights[0] ?? null;
  const restInsights = surfaceInsights.slice(1);

  const recommendation = useMemo<string | null>(() => {
    if (digest?.nextAction) return digest.nextAction;
    if (!activeProject) return null;
    if (focusTask) return `Tackle "${focusTask.title}" before end of day.`;
    if (activeProject.taskCount > activeProject.completedTaskCount) {
      return `Pick up the next item on ${activeProject.title}.`;
    }
    return null;
  }, [digest, activeProject, focusTask]);

  const resumeText = activeProject ? `Continue ${activeProject.title}` : null;

  const handleOpenTask = useCallback((task: Task) => {
    trackActivity('task_focus_opened', { taskId: task.id });
    navigateTab('tasks');
  }, []);

  const greeting = getGreeting();
  const GreetingIcon = greeting.Icon;
  const firstName = user?.displayName?.split(' ')[0] ?? '';
  // Prefer the streamed AI briefing once it has content; fall back to the deterministic sentence.
  const statusSentence = aiBriefing && aiBriefing.length > 0
    ? aiBriefing
    : buildStatusSentence(events, now);
  const dateLine = now.toLocaleDateString([], {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-th-border-strong border-t-th-accent" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-x-hidden overflow-y-auto">
      {/* Sticky greeting bar — anchors the page on scroll */}
      <div className="sticky top-0 z-10 border-b border-transparent bg-th-base/95 backdrop-blur-sm transition-colors">
        <div className="mx-auto w-full max-w-3xl px-4 py-4 md:px-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold text-th-text">
                <GreetingIcon className="h-6 w-6 text-amber-400" />
                {greeting.text}, {firstName}
              </h1>
              <p className="mt-0.5 text-xs text-th-text-muted">
                {dateLine}
                {syncedAt && (
                  <span className="ml-2 text-th-text-muted" title={syncedAt.toLocaleTimeString()}>
                    · Synced {timeAgo(syncedAt)}
                  </span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {weather && <WeatherChip weather={weather} />}
              <FamilyChip />
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-4 pb-6 pt-2 md:px-6 space-y-5">

        {/* 2. Status sentence + recap pill */}
        <div>
          <p className="flex items-center gap-1.5 text-sm text-th-text-secondary">
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-th-ai-text" />
            <span className="flex-1">{statusSentence}</span>
            <button
              type="button"
              className="text-th-text-muted hover:text-th-text-secondary"
              aria-label="More info"
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <RecapPill actionSummary={actionSummary} insights={insights} open={recapOpen} onToggle={() => setRecapOpen((v) => !v)} />
            <button
              type="button"
              onClick={() => setJournalOpen((v) => !v)}
              className="text-xs font-medium text-th-text-muted hover:text-th-text-secondary hover:underline"
            >
              {journalOpen ? 'Close journal' : 'Open journal'}
            </button>
          </div>
          {journalOpen && (
            <textarea
              value={journal}
              onChange={(e) => handleJournalChange(e.target.value)}
              placeholder="What's on your mind today?"
              className="mt-3 w-full min-h-[100px] rounded-xl border border-th-border bg-th-surface px-4 py-3 text-sm text-th-text leading-relaxed outline-none placeholder-th-text-muted resize-y focus:border-th-accent animate-slide-up"
            />
          )}
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
        <FooterPills resumeText={resumeText} familyAlerts={0} />

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
