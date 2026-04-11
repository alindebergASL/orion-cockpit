import { useEffect, useState } from 'react';
import { CalendarDays, ListChecks, Clock, Sun, Sunrise, Moon } from 'lucide-react';
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

export function HomeTab() {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.getCalendarEvents().catch(() => ({ events: [], syncedAt: null })),
      api.getTasks().catch(() => ({ tasks: [], syncedAt: null })),
    ]).then(([calData, taskData]) => {
      setEvents(calData.events);
      setTasks(taskData.tasks);
    }).finally(() => setLoading(false));
  }, []);

  const greeting = getGreeting();
  const GreetingIcon = greeting.icon;

  // Upcoming events (today and next 3 days)
  const now = new Date();
  const threeDaysOut = new Date();
  threeDaysOut.setDate(threeDaysOut.getDate() + 3);

  const upcomingEvents = events
    .filter((e) => new Date(e.start) >= new Date(now.toDateString()) && new Date(e.start) <= threeDaysOut)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 6);

  // Open/in-progress tasks, sorted by due date
  const activeTasks = tasks
    .filter((t) => t.status !== 'completed')
    .sort((a, b) => {
      if (!a.dueDate) return 1;
      if (!b.dueDate) return -1;
      return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
    })
    .slice(0, 5);

  const todayStr = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl px-6 py-8">
        {/* Greeting */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <GreetingIcon className="h-7 w-7 text-amber-400" />
            <h1 className="text-2xl font-semibold text-slate-100">
              {greeting.text}, {user?.displayName?.split(' ')[0]}
            </h1>
          </div>
          <p className="text-sm text-slate-500 ml-10">{todayStr}</p>
        </div>

        <div className="grid gap-6">
          {/* Upcoming Events */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <CalendarDays className="h-4 w-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-slate-300">Upcoming</h2>
            </div>

            {upcomingEvents.length === 0 ? (
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-6 text-center text-sm text-slate-600">
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
                        <p className="mt-2 mb-1 text-[11px] font-medium text-slate-500 uppercase tracking-wider">
                          {dayLabel(event.start)}
                        </p>
                      )}
                      <div className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-2.5">
                        <span className="w-16 shrink-0 text-xs text-slate-500">{formatEventTime(event)}</span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm text-slate-200">{event.title}</p>
                          {event.location && (
                            <p className="truncate text-[11px] text-slate-600">{event.location}</p>
                          )}
                        </div>
                        <span className="shrink-0 text-[10px] text-slate-600">{event.calendar}</span>
                      </div>
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
              <h2 className="text-sm font-semibold text-slate-300">Tasks</h2>
              {activeTasks.length > 0 && (
                <span className="rounded-full bg-slate-800 px-2 py-0.5 text-[10px] text-slate-400">
                  {activeTasks.length} open
                </span>
              )}
            </div>

            {activeTasks.length === 0 ? (
              <div className="rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-6 text-center text-sm text-slate-600">
                No open tasks. You're all caught up!
              </div>
            ) : (
              <div className="space-y-1.5">
                {activeTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center gap-3 rounded-lg border border-slate-800 bg-slate-900/50 px-4 py-2.5"
                  >
                    <div className={`h-2 w-2 shrink-0 rounded-full ${
                      task.priority === 'high' ? 'bg-red-500' :
                      task.priority === 'medium' ? 'bg-amber-500' : 'bg-slate-600'
                    }`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-slate-200">{task.title}</p>
                    </div>
                    {task.dueDate && (
                      <span className="flex shrink-0 items-center gap-1 text-[11px] text-slate-600">
                        <Clock className="h-3 w-3" />
                        {dayLabel(task.dueDate)}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
