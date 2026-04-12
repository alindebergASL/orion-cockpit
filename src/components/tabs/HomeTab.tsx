import { useCallback, useEffect, useState } from 'react';
import {
  CalendarDays,
  ListChecks,
  Clock,
  Sun,
  Sunrise,
  Moon,
  CloudSun,
  Circle,
  CheckCircle2,
  X,
  Thermometer,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { api } from '../../lib/api';
import type { CalendarEvent, Task } from '../../types';

function getGreeting(): { text: string; icon: React.FC<{ className?: string }> } {
  const hour = new Date().getHours();
  if (hour < 12) return { text: 'Good morning', icon: Sunrise };
  if (hour < 17) return { text: 'Good afternoon', icon: Sun };
  return { text: 'Good evening', icon: Moon };
}

function formatEventTime(event: CalendarEvent): string {
  if (event.allDay) return 'All day';
  const start = new Date(event.start);
  return start.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

function isToday(dateStr: string): boolean {
  const d = new Date(dateStr);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
}

function isTomorrow(dateStr: string): boolean {
  const d = new Date(dateStr);
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return d.getFullYear() === tomorrow.getFullYear() &&
    d.getMonth() === tomorrow.getMonth() &&
    d.getDate() === tomorrow.getDate();
}

function dayLabel(dateStr: string): string {
  if (isToday(dateStr)) return 'Today';
  if (isTomorrow(dateStr)) return 'Tomorrow';
  return new Date(dateStr).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
}

interface WeatherData {
  current: { tempF: string; description: string; humidity: string; feelsLikeF: string };
  today: { maxTempF: string; minTempF: string; description?: string };
  tomorrow: { maxTempF: string; minTempF: string; description?: string };
  location: string;
}

export function HomeTab() {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);

  useEffect(() => {
    Promise.all([
      api.getCalendarEvents().catch(() => ({ events: [], syncedAt: null })),
      api.getTasks().catch(() => ({ tasks: [], syncedAt: null })),
      api.getWeather().catch(() => null),
    ]).then(([calData, taskData, weatherData]) => {
      setEvents(calData.events);
      setTasks(taskData.tasks);
      setWeather(weatherData);
    }).finally(() => setLoading(false));
  }, []);

  const handleToggleTask = useCallback(async (taskId: number | string, currentStatus: string) => {
    const nextStatus = currentStatus === 'completed' ? 'open' : 'completed';
    setTasks((prev) =>
      prev.map((t) => (t.id === taskId ? { ...t, status: nextStatus as Task['status'] } : t)),
    );
    try {
      await api.updateTaskStatus(Number(taskId), nextStatus);
    } catch {
      setTasks((prev) =>
        prev.map((t) => (t.id === taskId ? { ...t, status: currentStatus as Task['status'] } : t)),
      );
    }
  }, []);

  const greeting = getGreeting();
  const GreetingIcon = greeting.icon;

  const now = new Date();
  const threeDaysOut = new Date();
  threeDaysOut.setDate(threeDaysOut.getDate() + 3);

  const upcomingEvents = events
    .filter((e) => new Date(e.start) >= new Date(now.toDateString()) && new Date(e.start) <= threeDaysOut)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 6);

  const activeTasks = tasks
    .filter((t) => t.status !== 'completed')
    .sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    })
    .slice(0, 5);

  const todayStr = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  const todayEvents = upcomingEvents.filter((e) => isToday(e.start));

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400" />
      </div>
    );
  }

  // Build briefing text — warm, personal assistant tone
  const briefingParts: string[] = [];
  if (weather) {
    const temp = Number(weather.current.tempF);
    const desc = weather.current.description.toLowerCase();
    if (temp >= 80) {
      briefingParts.push(`It's a warm ${temp}\u00B0 with ${desc} skies in Redwood City \u2014 stay hydrated out there!`);
    } else if (temp >= 65) {
      briefingParts.push(`Beautiful day in Redwood City \u2014 ${temp}\u00B0 and ${desc}. Great weather to be outside.`);
    } else if (temp >= 50) {
      briefingParts.push(`It's ${temp}\u00B0 and ${desc} in Redwood City. You might want a light layer if you're heading out.`);
    } else {
      briefingParts.push(`A chilly ${temp}\u00B0 in Redwood City with ${desc} skies. Bundle up if you're going out!`);
    }
  }
  if (todayEvents.length === 0) {
    briefingParts.push('Your calendar is wide open today \u2014 a perfect day to focus on what matters most to you.');
  } else if (todayEvents.length === 1) {
    const next = todayEvents[0];
    if (next && !next.allDay) {
      briefingParts.push(`Just one thing on the calendar: ${next.title} at ${formatEventTime(next)}. Otherwise, the day is yours.`);
    } else {
      briefingParts.push('You have one all-day event today. Plenty of room to maneuver around it.');
    }
  } else if (todayEvents.length <= 3) {
    briefingParts.push(`You've got ${todayEvents.length} events today \u2014 a manageable day.`);
    const next = todayEvents[0];
    if (next && !next.allDay) {
      briefingParts.push(`First up is ${next.title} at ${formatEventTime(next)}.`);
    }
  } else {
    briefingParts.push(`Busy day ahead with ${todayEvents.length} events on the calendar.`);
    const next = todayEvents[0];
    if (next && !next.allDay) {
      briefingParts.push(`Starting with ${next.title} at ${formatEventTime(next)}.`);
    }
    briefingParts.push('Pace yourself!');
  }
  if (activeTasks.length === 0) {
    briefingParts.push('All tasks knocked out \u2014 well done! Enjoy the clean slate.');
  } else if (activeTasks.length <= 3) {
    briefingParts.push(`${activeTasks.length} task${activeTasks.length > 1 ? 's' : ''} left \u2014 you're almost there.`);
  } else {
    briefingParts.push(`${activeTasks.length} tasks on your plate. Take them one at a time.`);
  }

  // Add a daily touch
  const dayOfWeek = now.getDay();
  if (dayOfWeek === 1) briefingParts.push('Happy Monday \u2014 let\'s make it a great week!');
  else if (dayOfWeek === 5) briefingParts.push('It\'s Friday \u2014 finish strong and enjoy the weekend!');
  else if (dayOfWeek === 0 || dayOfWeek === 6) briefingParts.push('Enjoy your weekend!');

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-4 py-6 md:px-6 md:py-8">
        {/* Greeting + briefing */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <GreetingIcon className="h-7 w-7 text-amber-400" />
            <h1 className="text-2xl font-semibold text-th-text">
              {greeting.text}, {user?.displayName?.split(' ')[0]}
            </h1>
          </div>
          <p className="text-sm text-th-text-muted ml-10 mb-3">{todayStr}</p>

          <div className="ml-10 rounded-lg border border-th-border bg-th-surface px-4 py-3 text-sm text-th-text-secondary leading-relaxed">
            {briefingParts.join(' ')}
          </div>
        </div>

        <div className="grid gap-6">
          {/* Weather */}
          {weather && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <CloudSun className="h-4 w-4 text-cyan-400" />
                <h2 className="text-sm font-semibold text-th-text-secondary">Weather</h2>
              </div>
              <div className="grid grid-cols-3 gap-2 md:gap-3">
                {/* Current */}
                <div className="rounded-lg border border-th-border bg-th-surface px-4 py-3 text-center">
                  <p className="text-[11px] text-th-text-muted mb-1">Now</p>
                  <p className="text-2xl font-semibold text-th-text">{weather.current.tempF}&deg;</p>
                  <p className="text-xs text-th-text-secondary mt-1">{weather.current.description}</p>
                  <p className="text-[10px] text-th-text-muted mt-1 flex items-center justify-center gap-1">
                    <Thermometer className="h-3 w-3" />
                    Feels {weather.current.feelsLikeF}&deg;
                  </p>
                </div>
                {/* Today */}
                <div className="rounded-lg border border-th-border bg-th-surface px-4 py-3 text-center">
                  <p className="text-[11px] text-th-text-muted mb-1">Today</p>
                  <p className="text-lg font-semibold text-th-text">{weather.today.maxTempF}&deg; <span className="text-th-text-muted font-normal">/ {weather.today.minTempF}&deg;</span></p>
                  {weather.today.description && (
                    <p className="text-xs text-th-text-secondary mt-1">{weather.today.description}</p>
                  )}
                </div>
                {/* Tomorrow */}
                <div className="rounded-lg border border-th-border bg-th-surface px-4 py-3 text-center">
                  <p className="text-[11px] text-th-text-muted mb-1">Tomorrow</p>
                  <p className="text-lg font-semibold text-th-text">{weather.tomorrow.maxTempF}&deg; <span className="text-th-text-muted font-normal">/ {weather.tomorrow.minTempF}&deg;</span></p>
                  {weather.tomorrow.description && (
                    <p className="text-xs text-th-text-secondary mt-1">{weather.tomorrow.description}</p>
                  )}
                </div>
              </div>
            </section>
          )}

          {/* Upcoming Events */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="h-4 w-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-th-text-secondary">Upcoming</h2>
            </div>

            {upcomingEvents.length === 0 ? (
              <div className="rounded-lg border border-th-border bg-th-surface px-4 py-6 text-center text-sm text-th-text-muted">
                No upcoming events. Hit sync on the Calendar tab to load.
              </div>
            ) : (
              <div className="space-y-1.5">
                {upcomingEvents.map((event, i) => {
                  const prev = upcomingEvents[i - 1];
                  const showDayHeader = i === 0 || (prev && dayLabel(event.start) !== dayLabel(prev.start));
                  return (
                    <div key={`${event.id}-${i}`}>
                      {showDayHeader && (
                        <p className="mt-2 mb-1 text-[11px] font-medium text-th-text-secondary uppercase tracking-wider">
                          {dayLabel(event.start)}
                        </p>
                      )}
                      <button
                        onClick={() => setSelectedEvent(event)}
                        className="flex w-full items-center gap-3 rounded-lg border border-th-border bg-th-surface px-4 py-2.5 text-left transition-colors hover:bg-th-elevated"
                      >
                        <span className="w-16 shrink-0 text-xs text-th-text-secondary">{formatEventTime(event)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-th-text">{event.title}</p>
                          {event.location && (
                            <p className="truncate text-[11px] text-th-text-muted">{event.location}</p>
                          )}
                        </div>
                        <span className="shrink-0 text-[10px] text-th-text-muted">{event.calendar}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* Active Tasks */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <ListChecks className="h-4 w-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-th-text-secondary">Tasks</h2>
              {activeTasks.length > 0 && (
                <span className="rounded-full bg-th-elevated px-2 py-0.5 text-[10px] text-th-text-secondary">
                  {activeTasks.length} open
                </span>
              )}
            </div>

            {activeTasks.length === 0 ? (
              <div className="rounded-lg border border-th-border bg-th-surface px-4 py-6 text-center text-sm text-th-text-muted">
                No open tasks. You're all caught up!
              </div>
            ) : (
              <div className="space-y-1.5">
                {activeTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 rounded-lg border border-th-border bg-th-surface px-4 py-2.5"
                  >
                    <button
                      onClick={() => handleToggleTask(task.id, task.status)}
                      className="shrink-0 text-slate-500 hover:text-cyan-400 transition-colors"
                      title="Mark complete"
                    >
                      {task.status === 'completed' ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <Circle className="h-4 w-4" />
                      )}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm ${task.status === 'completed' ? 'text-th-text-muted line-through' : 'text-th-text'}`}>
                        {task.title}
                      </p>
                    </div>
                    {task.dueDate && (
                      <span className="flex shrink-0 items-center gap-1 text-[11px] text-th-text-muted">
                        <Clock className="h-3 w-3" />
                        {dayLabel(task.dueDate)}
                      </span>
                    )}
                    {task.priority && (
                      <div className={`h-2 w-2 shrink-0 rounded-full ${
                        task.priority === 'high' ? 'bg-red-500' :
                        task.priority === 'medium' ? 'bg-amber-500' : 'bg-slate-600'
                      }`} />
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Event detail popup */}
      {selectedEvent && (
        <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  );
}

function EventDetail({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const start = new Date(event.start);
  const end = new Date(event.end);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-11/12 max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            {event.calendar && (
              <div className="mb-1 text-xs text-cyan-400">{event.calendar}</div>
            )}
            <h3 className="text-lg font-semibold text-slate-100">{event.title}</h3>
          </div>
          <button onClick={onClose} className="rounded p-1 text-slate-500 hover:text-slate-300">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 text-sm text-slate-400">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            {event.allDay
              ? start.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
              : `${start.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
          </div>

          {event.location && (
            <div className="flex items-center gap-2">
              <span className="text-slate-600">Location:</span>
              {event.location}
            </div>
          )}

          {event.description && (
            <p className="mt-3 whitespace-pre-wrap text-slate-400">{event.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}
