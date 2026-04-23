import { useCallback, useEffect, useRef, useState } from 'react';
import {
  CalendarDays,
  ListChecks,
  Clock,
  Sun,
  Sunrise,
  Moon,
  Circle,
  CheckCircle2,
  Plus,
  MessageSquare,
  StickyNote,
  Lightbulb,
  ChevronLeft,
  ChevronRight,
  BookOpen,
  Sparkles,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';
import { trackActivity } from '../../lib/activity';
import type { CalendarEvent, Task, Insight } from '../../types';

// ── Helpers ──────────────────────────────────────────────

function getGreeting(): { text: string; icon: React.FC<{ className?: string }> } {
  const hour = new Date().getHours();
  if (hour < 12) return { text: 'Good morning', icon: Sunrise };
  if (hour < 17) return { text: 'Good afternoon', icon: Sun };
  return { text: 'Good evening', icon: Moon };
}

function formatEventTime(event: CalendarEvent): string {
  if (event.allDay) return 'All day';
  return new Date(event.start).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function formatEndTime(event: CalendarEvent): string {
  return new Date(event.end).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function isSameDay(dateStr: string, target: Date): boolean {
  const d = new Date(dateStr);
  return d.getFullYear() === target.getFullYear() && d.getMonth() === target.getMonth() && d.getDate() === target.getDate();
}

function formatDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateLabel(d: Date): string {
  const today = new Date();
  if (formatDateKey(d) === formatDateKey(today)) return 'Today';
  const yesterday = new Date(today); yesterday.setDate(today.getDate() - 1);
  if (formatDateKey(d) === formatDateKey(yesterday)) return 'Yesterday';
  const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);
  if (formatDateKey(d) === formatDateKey(tomorrow)) return 'Tomorrow';
  return d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
}

interface WeatherData {
  current: { tempF: string; description: string; humidity: string; feelsLikeF: string };
  today: { maxTempF: string; minTempF: string; description?: string };
  tomorrow: { maxTempF: string; minTempF: string; description?: string };
  location: string;
}

// ── Timeline Component ──────────────────────────────────

function Timeline({ events, date }: { events: CalendarEvent[]; date: Date }) {
  const dayEvents = events
    .filter((e) => !e.allDay && isSameDay(e.start, date))
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const allDayEvents = events.filter((e) => e.allDay && isSameDay(e.start, date));

  const startHour = 7;
  const endHour = 20;
  const hours = Array.from({ length: endHour - startHour }, (_, i) => startHour + i);

  return (
    <div className="rounded-xl border border-th-border bg-th-surface overflow-hidden">
      {/* All-day events */}
      {allDayEvents.length > 0 && (
        <div className="border-b border-th-border px-3 py-2 space-y-1">
          {allDayEvents.map((e) => (
            <div key={e.id} className="text-xs text-cyan-400 bg-cyan-600/10 rounded px-2 py-1">
              {e.title}
            </div>
          ))}
        </div>
      )}

      {/* Hour grid */}
      <div className="relative">
        {hours.map((hour) => {
          const eventsThisHour = dayEvents.filter((e) => {
            const startH = new Date(e.start).getHours();
            return startH === hour;
          });

          return (
            <div key={hour} className="flex border-b border-th-border/50 min-h-[44px]">
              <div className="w-14 shrink-0 px-2 py-1 text-xs text-th-text-muted text-right pr-3 pt-1.5">
                {hour === 0 ? '12 AM' : hour < 12 ? `${hour} AM` : hour === 12 ? '12 PM' : `${hour - 12} PM`}
              </div>
              <div className="flex-1 py-0.5 px-1 space-y-0.5">
                {eventsThisHour.map((e) => (
                  <div
                    key={e.id}
                    className="rounded bg-cyan-600/15 border-l-2 border-cyan-500 px-2 py-1"
                  >
                    <p className="text-xs font-medium text-th-text truncate">{e.title}</p>
                    <p className="text-[11px] text-th-text-muted">
                      {formatEventTime(e)} – {formatEndTime(e)}
                      {e.location && ` · ${e.location}`}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────

import type { Template } from '../../types';

type ViewMode = 'day' | 'week';

function getWeekKey(d: Date): string {
  const jan1 = new Date(d.getFullYear(), 0, 1);
  const dayOfYear = Math.ceil((d.getTime() - jan1.getTime()) / 86400000);
  const weekNum = Math.ceil((dayOfYear + jan1.getDay()) / 7);
  return `${d.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}

function getWeekRange(d: Date): string {
  const day = d.getDay();
  const start = new Date(d);
  start.setDate(d.getDate() - day);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return `${start.toLocaleDateString([], { month: 'short', day: 'numeric' })} – ${end.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

export function TodayTab() {
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<ViewMode>('day');
  const [date, setDate] = useState(new Date());
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [dailyNote, setDailyNote] = useState('');
  const [weeklyNote, setWeeklyNote] = useState('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const weeklyDebounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  const dateKey = formatDateKey(date);
  const weekKey = getWeekKey(date);
  const isViewingToday = formatDateKey(date) === formatDateKey(new Date());

  // Load all data
  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getCalendarEvents().catch(() => ({ events: [], syncedAt: null })),
      api.getTasks().catch(() => ({ tasks: [], syncedAt: null })),
      isViewingToday ? api.getWeather().catch(() => null) : Promise.resolve(null),
      api.getInsights().catch(() => ({ insights: [], unreadCount: 0 })),
      api.getDailyNote(dateKey).catch(() => ({ date: dateKey, content: '', updatedAt: null })),
      api.getWeeklyNote(weekKey).catch(() => ({ week: weekKey, content: '', updatedAt: null })),
      api.getTemplates().catch(() => []),
    ]).then(([calData, taskData, weatherData, insightData, noteData, weeklyData, templateData]) => {
      setEvents(calData.events);
      setTasks(taskData.tasks);
      setWeather(weatherData);
      setInsights(insightData.insights.filter((i: Insight) => !i.read).slice(0, 3));
      setDailyNote(noteData.content);
      setWeeklyNote((weeklyData as { content: string }).content);
      setTemplates(templateData as Template[]);
    }).finally(() => setLoading(false));
  }, [dateKey, weekKey, isViewingToday]);

  // Auto-save daily note (debounced)
  const handleNoteChange = useCallback((value: string) => {
    setDailyNote(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      api.saveDailyNote(dateKey, value).catch(() => {});
    }, 500);
  }, [dateKey]);

  // Auto-save weekly note (debounced)
  const handleWeeklyNoteChange = useCallback((value: string) => {
    setWeeklyNote(value);
    if (weeklyDebounceRef.current) clearTimeout(weeklyDebounceRef.current);
    weeklyDebounceRef.current = setTimeout(() => {
      api.saveWeeklyNote(weekKey, value).catch(() => {});
    }, 500);
  }, [weekKey]);

  // Apply template to daily note
  const applyTemplate = useCallback((template: Template) => {
    const newContent = dailyNote ? `${dailyNote}\n\n${template.content}` : template.content;
    handleNoteChange(newContent);
    setShowTemplates(false);
  }, [dailyNote, handleNoteChange]);

  const handleToggleTask = useCallback(async (taskId: number | string, currentStatus: string) => {
    const nextStatus = currentStatus === 'completed' ? 'open' : 'completed';
    const matchTask = (t: Task) => t.externalId === taskId || t.id === taskId || String(t.id) === String(taskId);
    setTasks((prev) => prev.map((t) => (matchTask(t) ? { ...t, status: nextStatus as Task['status'] } : t)));
    try {
      await api.updateTaskStatus(taskId, nextStatus);
      trackActivity(nextStatus === 'completed' ? 'task_completed' : 'task_reopened', { taskId });
    } catch { /* don't revert */ }
  }, []);

  const navigateDate = (dir: number) => {
    setDate((prev) => { const d = new Date(prev); d.setDate(d.getDate() + dir); return d; });
  };

  const goToday = () => setDate(new Date());
  const navigateTab = (tab: string) => window.dispatchEvent(new CustomEvent('orion-navigate', { detail: { tab } }));

  const [aiBriefing, setAiBriefing] = useState<string | null>(null);
  const [aiBriefingLoading, setAiBriefingLoading] = useState(false);
  const [weeklySummary, setWeeklySummary] = useState<string | null>(null);
  const [weeklySummaryLoading, setWeeklySummaryLoading] = useState(false);
  const autoBriefingTriggered = useRef(false);

  const handleAiBriefing = useCallback(async () => {
    setAiBriefingLoading(true);
    setAiBriefing('');
    try {
      const eventList = events
        .filter((e) => !e.allDay && isSameDay(e.start, date))
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
        .map((e) => ({ title: e.title, time: formatEventTime(e) }));

      await api.aiGenerateBriefing(
        {
          weather: weather ? {
            tempF: weather.current.tempF,
            description: weather.current.description,
            feelsLikeF: weather.current.feelsLikeF,
          } : undefined,
          events: eventList,
          taskCount: tasks.filter((t) => t.status !== 'completed').length,
          displayName: user?.displayName?.split(' ')[0],
          dayOfWeek: date.toLocaleDateString([], { weekday: 'long' }),
        },
        (chunk) => setAiBriefing((prev) => (prev ?? '') + chunk),
      );
    } catch {
      setAiBriefing(null);
    } finally {
      setAiBriefingLoading(false);
    }
  }, [events, weather, tasks, date, user]);

  // Auto-generate briefing on first load when viewing today and weather is ready
  useEffect(() => {
    if (autoBriefingTriggered.current) return;
    if (!isViewingToday || loading || !weather) return;
    autoBriefingTriggered.current = true;
    handleAiBriefing();
  }, [isViewingToday, loading, weather, handleAiBriefing]);

  const handleWeeklySummary = useCallback(async () => {
    setWeeklySummaryLoading(true);
    setWeeklySummary('');
    try {
      // Build week range (Sun-Sat around current date)
      const start = new Date(date); start.setDate(date.getDate() - date.getDay());
      const end = new Date(start); end.setDate(start.getDate() + 7);
      const weekEvents = events
        .filter((e) => {
          const d = new Date(e.start);
          return d >= start && d < end;
        })
        .map((e) => ({
          title: e.title,
          day: new Date(e.start).toLocaleDateString([], { weekday: 'short' }),
        }));
      const weekCompletedTasks = tasks
        .filter((t) => t.status === 'completed')
        .map((t) => t.title)
        .slice(0, 20);

      await api.aiWeeklySummary(
        weekKey,
        { events: weekEvents, completedTasks: weekCompletedTasks },
        (chunk) => setWeeklySummary((prev) => (prev ?? '') + chunk),
      );
    } catch {
      setWeeklySummary(null);
    } finally {
      setWeeklySummaryLoading(false);
    }
  }, [date, events, tasks, weekKey]);

  const greeting = getGreeting();
  const GreetingIcon = greeting.icon;
  const todayEvents = events.filter((e) => isSameDay(e.start, date));
  const activeTasks = tasks.filter((t) => t.status !== 'completed');
  const dateLabel = formatDateLabel(date);
  const fullDateStr = date.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // Build briefing (only for today)
  const briefing = isViewingToday ? buildBriefing(weather, todayEvents, activeTasks, date) : null;

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-th-border-strong border-t-cyan-400" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-x-hidden overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 py-6 md:px-6 md:py-8">

        {/* Date header + navigation */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            {isViewingToday && (
              <div className="flex items-center gap-2 mb-1">
                <GreetingIcon className="h-6 w-6 text-amber-400" />
                <h1 className="text-xl font-semibold text-th-text">
                  {greeting.text}, {user?.displayName?.split(' ')[0]}
                </h1>
              </div>
            )}
            <div className="flex items-center gap-2">
              <h2 className={`font-semibold text-th-text ${isViewingToday ? 'text-sm' : 'text-xl'}`}>{dateLabel}</h2>
              <span className="text-xs text-th-text-muted">{fullDateStr}</span>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {/* Day/Week toggle */}
            <div className="flex rounded-lg border border-th-border text-xs mr-1">
              <button
                onClick={() => setViewMode('day')}
                className={`rounded-l-lg px-2 py-1 ${viewMode === 'day' ? 'bg-th-accent-soft text-th-accent-text' : 'text-th-text-secondary'}`}
              >Day</button>
              <button
                onClick={() => setViewMode('week')}
                className={`rounded-r-lg px-2 py-1 ${viewMode === 'week' ? 'bg-th-accent-soft text-th-accent-text' : 'text-th-text-secondary'}`}
              >Week</button>
            </div>
            <button onClick={() => navigateDate(viewMode === 'week' ? -7 : -1)} className="rounded-lg p-2 text-th-text-secondary hover:bg-th-elevated">
              <ChevronLeft className="h-4 w-4" />
            </button>
            {!isViewingToday && (
              <button onClick={goToday} className="rounded-lg px-2 py-1 text-xs text-th-accent-text hover:bg-th-elevated">
                Today
              </button>
            )}
            <button onClick={() => navigateDate(viewMode === 'week' ? 7 : 1)} className="rounded-lg p-2 text-th-text-secondary hover:bg-th-elevated">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Briefing (today only) */}
        {briefing && (
          <div className="mb-5 rounded-xl border border-cyan-600/20 bg-gradient-to-br from-cyan-600/5 to-transparent px-4 py-3.5">
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-th-text leading-relaxed flex-1">
                {aiBriefing || briefing}
              </p>
              <button
                onClick={handleAiBriefing}
                disabled={aiBriefingLoading}
                className={`shrink-0 rounded p-1 ${aiBriefingLoading ? 'text-th-ai-text animate-pulse' : 'text-th-text-muted hover:text-th-ai-text'}`}
                title="AI Briefing"
              >
                <Sparkles className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Weather (today only) */}
        {isViewingToday && weather && (
          <div className="mb-5 grid grid-cols-3 gap-1.5 md:gap-3">
            <div className="rounded-xl border border-th-border bg-th-surface px-2 py-2.5 md:px-3 md:py-3 text-center">
              <p className="text-xs text-th-text-muted">Now</p>
              <p className="text-lg md:text-xl font-semibold text-th-text">{weather.current.tempF}&deg;</p>
              <p className="text-xs text-th-text-secondary">{weather.current.description}</p>
            </div>
            <div className="rounded-xl border border-th-border bg-th-surface px-2 py-2.5 md:px-3 md:py-3 text-center">
              <p className="text-xs text-th-text-muted">Today</p>
              <p className="text-sm md:text-base font-semibold text-th-text">{weather.today.maxTempF}&deg; / {weather.today.minTempF}&deg;</p>
            </div>
            <div className="rounded-xl border border-th-border bg-th-surface px-2 py-2.5 md:px-3 md:py-3 text-center">
              <p className="text-xs text-th-text-muted">Tomorrow</p>
              <p className="text-sm md:text-base font-semibold text-th-text">{weather.tomorrow.maxTempF}&deg; / {weather.tomorrow.minTempF}&deg;</p>
            </div>
          </div>
        )}

        {/* Insights (today only) */}
        {isViewingToday && insights.length > 0 && (
          <div className="mb-5 space-y-1.5">
            {insights.map((insight) => (
              <button
                key={insight.id}
                onClick={() => {
                  if (insight.actionType === 'navigate' && insight.actionData) {
                    try {
                      const data = typeof insight.actionData === 'string' ? JSON.parse(insight.actionData) : insight.actionData;
                      if (data.tab) navigateTab(data.tab);
                    } catch { /* ignore */ }
                  }
                  api.markInsightRead(insight.id).catch(() => {});
                }}
                className="flex w-full items-start gap-2.5 rounded-xl border border-th-border bg-th-surface px-4 py-3 text-left hover:bg-th-elevated/50 transition-colors animate-slide-up border-l-2 border-l-cyan-500"
              >
                <Lightbulb className="h-4 w-4 mt-0.5 shrink-0 text-cyan-400" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-th-text">{insight.title}</p>
                  <p className="text-xs text-th-text-muted">{insight.body}</p>
                </div>
                {insight.actionType === 'navigate' && (
                  <ChevronRight className="h-4 w-4 mt-0.5 shrink-0 text-th-text-muted" />
                )}
              </button>
            ))}
          </div>
        )}

        {/* My Plan + Journal (day view) or Weekly Note (week view) */}
        {viewMode === 'day' ? (
          <section className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-th-text-secondary">My Plan + Journal</h3>
              </div>
              {templates.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => setShowTemplates(!showTemplates)}
                    className="rounded-md border border-th-border px-2 py-1 text-[11px] text-th-text-secondary hover:bg-th-elevated"
                  >
                    Templates
                  </button>
                  {showTemplates && (
                    <div className="absolute right-0 top-8 z-10 w-48 rounded-lg border border-th-border bg-th-surface shadow-lg">
                      {templates.map((t) => (
                        <button
                          key={t.id}
                          onClick={() => applyTemplate(t)}
                          className="block w-full px-3 py-2 text-left text-xs text-th-text hover:bg-th-elevated"
                        >
                          {t.name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
            <textarea
              value={dailyNote}
              onChange={(e) => handleNoteChange(e.target.value)}
              placeholder={isViewingToday
                ? "What's your focus today? Priorities, intentions, thoughts..."
                : "Notes for this day..."}
              className="w-full min-h-[100px] rounded-xl border border-th-border bg-th-surface px-4 py-3 text-base md:text-sm text-th-text leading-relaxed outline-none placeholder-th-text-muted resize-y focus:border-th-accent"
            />
          </section>
        ) : (
          <section className="mb-5">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <BookOpen className="h-4 w-4 text-cyan-400" />
                <h3 className="text-sm font-semibold text-th-text-secondary">
                  Weekly Note <span className="font-normal text-th-text-muted">{getWeekRange(date)}</span>
                </h3>
              </div>
              <button
                onClick={handleWeeklySummary}
                disabled={weeklySummaryLoading}
                className={`flex items-center gap-1 rounded-md border border-th-border px-2 py-1 text-xs ${
                  weeklySummaryLoading ? 'text-th-ai-text animate-pulse' : 'text-th-text-secondary hover:bg-th-elevated hover:text-th-ai-text'
                }`}
                title="AI weekly recap"
              >
                <Sparkles className="h-3 w-3" />
                AI Recap
              </button>
            </div>
            {weeklySummary !== null && (
              <div className="mb-2 rounded-xl border border-th-ai/20 bg-th-ai-soft px-4 py-3">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-th-ai-text">
                    <Sparkles className={`h-3 w-3 ${weeklySummaryLoading ? 'animate-pulse' : ''}`} />
                    Weekly Recap
                    {weeklySummaryLoading && <span className="text-th-text-muted font-normal">· streaming</span>}
                  </span>
                  <button
                    onClick={() => setWeeklySummary(null)}
                    className="rounded px-1 text-xs text-th-text-muted hover:text-th-text-secondary"
                  >
                    ×
                  </button>
                </div>
                <p className="text-sm text-th-text-secondary leading-relaxed whitespace-pre-wrap">
                  {weeklySummary || <span className="text-th-text-muted italic">waiting for response...</span>}
                </p>
              </div>
            )}
            <textarea
              value={weeklyNote}
              onChange={(e) => handleWeeklyNoteChange(e.target.value)}
              placeholder="What went well this week? What's blocked? What's the plan for next week?"
              className="w-full min-h-[150px] rounded-xl border border-th-border bg-th-surface px-4 py-3 text-base md:text-sm text-th-text leading-relaxed outline-none placeholder-th-text-muted resize-y focus:border-th-accent"
            />
          </section>
        )}

        {/* Timeline */}
        <section className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <CalendarDays className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-th-text-secondary">
              Schedule {todayEvents.length > 0 && <span className="font-normal text-th-text-muted">({todayEvents.length} events)</span>}
            </h3>
          </div>
          {todayEvents.length === 0 ? (
            <div className="rounded-xl border border-th-border bg-th-surface px-4 py-6 text-center text-sm text-th-text-muted">
              No events scheduled.
            </div>
          ) : (
            <Timeline events={events} date={date} />
          )}
        </section>

        {/* Tasks */}
        <section className="mb-5">
          <div className="flex items-center gap-2 mb-2">
            <ListChecks className="h-4 w-4 text-cyan-400" />
            <h3 className="text-sm font-semibold text-th-text-secondary">
              Tasks {activeTasks.length > 0 && <span className="font-normal text-th-text-muted">({activeTasks.length} open)</span>}
            </h3>
          </div>
          {activeTasks.length === 0 ? (
            <div className="rounded-xl border border-th-border bg-th-surface px-4 py-6 text-center text-sm text-th-text-muted">
              All clear!
            </div>
          ) : (
            <div className="rounded-xl border border-th-border bg-th-surface divide-y divide-th-border">
              {activeTasks.slice(0, 8).map((task) => (
                <div key={task.id} className="flex items-center gap-3 px-4 py-2.5">
                  <button
                    onClick={() => handleToggleTask(task.externalId || task.id, task.status)}
                    className="shrink-0 p-2 -m-2 text-th-text-secondary hover:text-cyan-400 transition-colors"
                  >
                    {task.status === 'completed' ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    ) : (
                      <Circle className="h-4 w-4" />
                    )}
                  </button>
                  <p className={`flex-1 truncate text-sm ${task.status === 'completed' ? 'text-th-text-muted line-through' : 'text-th-text'}`}>
                    {task.title}
                  </p>
                  {task.dueDate && (
                    <span className="text-xs text-th-text-muted flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(task.dueDate).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <button onClick={() => navigateTab('calendar')} className="flex items-center gap-2 rounded-xl border border-th-border bg-th-surface px-3 py-2.5 text-xs text-th-text-secondary hover:bg-th-elevated transition-colors">
            <Plus className="h-3.5 w-3.5 text-th-accent-text" /> New Event
          </button>
          <button onClick={() => navigateTab('tasks')} className="flex items-center gap-2 rounded-xl border border-th-border bg-th-surface px-3 py-2.5 text-xs text-th-text-secondary hover:bg-th-elevated transition-colors">
            <ListChecks className="h-3.5 w-3.5 text-th-accent-text" /> Add Task
          </button>
          <button onClick={() => navigateTab('notes')} className="flex items-center gap-2 rounded-xl border border-th-border bg-th-surface px-3 py-2.5 text-xs text-th-text-secondary hover:bg-th-elevated transition-colors">
            <StickyNote className="h-3.5 w-3.5 text-th-accent-text" /> New Note
          </button>
          <button onClick={() => navigateTab('chat')} className="flex items-center gap-2 rounded-xl border border-th-border bg-th-surface px-3 py-2.5 text-xs text-th-text-secondary hover:bg-th-elevated transition-colors">
            <MessageSquare className="h-3.5 w-3.5 text-th-accent-text" /> Ask OpenClaw
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Briefing Builder ────────────────────────────────────

function buildBriefing(
  weather: WeatherData | null,
  todayEvents: CalendarEvent[],
  activeTasks: Task[],
  now: Date,
): string {
  const parts: string[] = [];

  if (weather) {
    const temp = Number(weather.current.tempF);
    const desc = weather.current.description.toLowerCase();
    if (temp >= 80) parts.push(`It's a warm ${temp}\u00B0 with ${desc} skies \u2014 stay hydrated!`);
    else if (temp >= 65) parts.push(`Beautiful day \u2014 ${temp}\u00B0 and ${desc}.`);
    else if (temp >= 50) parts.push(`${temp}\u00B0 and ${desc}. Light layer weather.`);
    else parts.push(`A chilly ${temp}\u00B0 with ${desc} skies. Bundle up!`);
  }

  if (todayEvents.length === 0) {
    parts.push('Calendar is wide open \u2014 focus on what matters most.');
  } else if (todayEvents.length === 1) {
    const next = todayEvents[0];
    if (next && !next.allDay) parts.push(`One event: ${next.title} at ${formatEventTime(next)}.`);
    else parts.push('One all-day event on the books.');
  } else if (todayEvents.length <= 3) {
    parts.push(`${todayEvents.length} events today.`);
    const next = todayEvents.find((e) => !e.allDay);
    if (next) parts.push(`First up: ${next.title} at ${formatEventTime(next)}.`);
  } else {
    parts.push(`Busy day \u2014 ${todayEvents.length} events.`);
    const next = todayEvents.find((e) => !e.allDay);
    if (next) parts.push(`Starting with ${next.title} at ${formatEventTime(next)}.`);
  }

  if (activeTasks.length === 0) parts.push('All tasks done!');
  else if (activeTasks.length <= 3) parts.push(`${activeTasks.length} task${activeTasks.length > 1 ? 's' : ''} left.`);
  else parts.push(`${activeTasks.length} tasks on your plate.`);

  const day = now.getDay();
  if (day === 1) parts.push('Happy Monday!');
  else if (day === 5) parts.push('It\'s Friday \u2014 finish strong!');
  else if (day === 0 || day === 6) parts.push('Enjoy your weekend!');

  return parts.join(' ');
}
