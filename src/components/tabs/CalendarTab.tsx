import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  MessageSquare,
  X,
  AlertTriangle,
  Clock,
  Plus,
  Sparkles,
} from 'lucide-react';
import { useChat } from '../../hooks/useChat';
import { MessageList } from '../chat/MessageList';
import { MessageInput } from '../chat/MessageInput';
import { WeekView } from '../calendar/WeekView';
import { MonthView } from '../calendar/MonthView';
import type { CalendarEvent } from '../../types';
import { api } from '../../lib/api';
import { showToast } from '../Toast';
import {
  startOfWeek,
  addDays,
  formatShortDate,
  getCalendarColor,
} from '../../lib/calendarUtils';

type ViewMode = 'week' | 'month';

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

export function CalendarTab() {
  const chat = useChat('calendar');

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncedAt, setSyncedAt] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('week');
  const [anchor, setAnchor] = useState(new Date());
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [freeTimeLoading, setFreeTimeLoading] = useState(false);
  const [freeTimeSlots, setFreeTimeSlots] = useState<{ day: string; start: string; end: string; suggestion: string }[] | null>(null);
  const hasFetched = useRef(false);

  const weekStart = startOfWeek(anchor);

  // ── Load events from backend (SQLite) ────────────────────
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.getCalendarEvents();
      setEvents(result.events);
      setSyncedAt(result.syncedAt);
    } catch {
      setError('Could not load calendar data. Check your connection.');
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Trigger sync from OpenClaw ───────────────────────────
  const handleSync = useCallback(async () => {
    setSyncing(true);
    setError(null);
    try {
      const result = await api.syncCalendar();
      setEvents(result.events);
      setSyncedAt(result.syncedAt);
      showToast(`Synced ${result.events.length} events`, 'success');
    } catch {
      setError('Sync failed. OpenClaw may be unreachable.');
      showToast('Calendar sync failed', 'error');
    } finally {
      setSyncing(false);
    }
  }, []);

  const handleCreateEvent = useCallback(async (data: {
    title: string; start: string; end: string;
    calendar?: string; location?: string; description?: string; allDay?: boolean;
  }) => {
    try {
      const result = await api.createCalendarEvent(data);
      setEvents(result.events);
      setSyncedAt(result.syncedAt);
      setShowCreateForm(false);
    } catch {
      throw new Error('Failed to create event');
    }
  }, []);

  const handleFreeTime = useCallback(async () => {
    setFreeTimeLoading(true);
    try {
      const result = await api.aiFreeTime();
      setFreeTimeSlots(result.slots);
    } catch {
      showToast('Failed to find free time', 'error');
    } finally {
      setFreeTimeLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchEvents();
    }
  }, [fetchEvents]);

  // Auto-refresh when chat tool calls modify data
  useEffect(() => {
    const handler = () => fetchEvents();
    window.addEventListener('orion-data-changed', handler);
    return () => window.removeEventListener('orion-data-changed', handler);
  }, [fetchEvents]);

  // ── Navigation ────────────────────────────────────────────
  const navigate = (dir: -1 | 1) => {
    setAnchor((prev) =>
      view === 'week'
        ? addDays(prev, dir * 7)
        : new Date(prev.getFullYear(), prev.getMonth() + dir, 1),
    );
  };

  const goToday = () => setAnchor(new Date());

  const rangeLabel =
    view === 'week'
      ? `${formatShortDate(weekStart)} - ${formatShortDate(addDays(weekStart, 6))}`
      : anchor.toLocaleDateString([], { month: 'long', year: 'numeric' });

  const calendarNames = [...new Set(events.map((e) => e.calendar).filter(Boolean))];

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-th-border px-4 py-2.5">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-th-text">Calendar</h2>
          {syncedAt && (
            <span className="flex items-center gap-1 text-[10px] text-th-text-muted">
              <Clock className="h-3 w-3" />
              Synced {timeAgo(syncedAt)}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-th-border-strong text-xs">
            <button
              onClick={() => setView('week')}
              className={`rounded-l-lg px-2.5 py-1 ${
                view === 'week' ? 'bg-cyan-600/20 text-cyan-400' : 'text-th-text-secondary hover:text-th-text-secondary'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setView('month')}
              className={`rounded-r-lg px-2.5 py-1 ${
                view === 'month' ? 'bg-cyan-600/20 text-cyan-400' : 'text-th-text-secondary hover:text-th-text-secondary'
              }`}
            >
              Month
            </button>
          </div>

          {/* Chat toggle */}
          <button
            onClick={() => setChatOpen((o) => !o)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs transition-colors ${
              chatOpen ? 'bg-cyan-600/20 text-cyan-400' : 'text-th-text-secondary hover:text-th-text-secondary'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Chat
          </button>

          {/* AI Free Time */}
          <button
            onClick={handleFreeTime}
            disabled={freeTimeLoading}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs transition-colors ${
              freeTimeLoading ? 'text-cyan-400 animate-pulse' : 'text-th-text-secondary hover:bg-th-elevated hover:text-cyan-400'
            }`}
            title="Find free time"
          >
            <Sparkles className={`h-3.5 w-3.5 ${freeTimeLoading ? 'animate-spin' : ''}`} />
            Free Time
          </button>

          {/* Add event */}
          <button
            onClick={() => setShowCreateForm(true)}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs text-th-text-secondary hover:bg-th-elevated hover:text-cyan-400"
          >
            <Plus className="h-3.5 w-3.5" />
            Add
          </button>

          {/* Sync */}
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-th-text-secondary hover:bg-th-elevated hover:text-th-text disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncing ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Date navigation ─────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-th-border px-4 py-1.5">
        <div className="flex items-center gap-1">
          <button onClick={() => navigate(-1)} className="rounded p-1 text-th-text-secondary hover:text-th-text">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => navigate(1)} className="rounded p-1 text-th-text-secondary hover:text-th-text">
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-2 text-sm font-medium text-th-text">{rangeLabel}</span>
        </div>

        <div className="flex items-center gap-3">
          {calendarNames.length > 0 && (
            <div className="flex items-center gap-2">
              {calendarNames.slice(0, 5).map((name) => {
                const color = getCalendarColor(name);
                return (
                  <span key={name} className="flex items-center gap-1 text-[10px] text-th-text-secondary">
                    <span className={`inline-block h-2 w-2 rounded-full ${color.dot}`} />
                    {name}
                  </span>
                );
              })}
            </div>
          )}

          <button
            onClick={goToday}
            className="rounded-md border border-th-border-strong px-2 py-0.5 text-xs text-th-text-secondary hover:text-th-text"
          >
            Today
          </button>
        </div>
      </div>

      {/* ── Free Time Results ───────────────────────────────── */}
      {freeTimeSlots && (
        <div className="border-b border-cyan-600/30 bg-cyan-600/5 px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="flex items-center gap-1.5 text-xs font-medium text-cyan-400">
              <Sparkles className="h-3 w-3" />
              Free Time This Week
            </span>
            <button onClick={() => setFreeTimeSlots(null)} className="rounded p-0.5 text-th-text-muted hover:text-th-text-secondary">
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
            {freeTimeSlots.map((slot, i) => (
              <div key={i} className="rounded-md border border-th-border bg-th-surface px-3 py-2">
                <p className="text-xs font-medium text-th-text">{slot.day}: {slot.start} – {slot.end}</p>
                <p className="text-[11px] text-th-text-muted mt-0.5">{slot.suggestion}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main area ───────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 overflow-hidden">
          {loading && events.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-th-text-secondary">
              <RefreshCw className="h-8 w-8 animate-spin" />
              <p className="text-sm">Loading calendar...</p>
            </div>
          ) : error && events.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-th-text-secondary">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <p className="max-w-sm text-center text-sm">{error}</p>
              <button
                onClick={handleSync}
                className="mt-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs text-white hover:bg-cyan-500"
              >
                Sync Now
              </button>
            </div>
          ) : view === 'week' ? (
            <WeekView events={events} weekStart={weekStart} onEventClick={setSelectedEvent} />
          ) : (
            <MonthView events={events} month={anchor} onEventClick={setSelectedEvent} />
          )}
        </div>

        {/* Chat panel */}
        {chatOpen && (
          <div className="hidden sm:flex w-80 flex-col border-l border-th-border bg-th-surface">
            <div className="flex items-center justify-between border-b border-th-border px-3 py-2">
              <span className="text-xs font-medium text-th-text-secondary">Ask about your calendar</span>
              <button
                onClick={() => setChatOpen(false)}
                className="rounded p-1 text-th-text-secondary hover:text-th-text-secondary"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <MessageList messages={chat.messages} streaming={chat.streaming} />
            <MessageInput
              onSend={chat.send}
              onStop={chat.stop}
              streaming={chat.streaming}
              placeholder="Ask about your schedule..."
            />
          </div>
        )}
      </div>

      {/* ── Event detail popover ────────────────────────────── */}
      {selectedEvent && (
        <EventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}

      {/* ── Create event modal ──────────────────────────────── */}
      {showCreateForm && (
        <CreateEventForm
          calendarNames={calendarNames}
          onClose={() => setShowCreateForm(false)}
          onCreate={handleCreateEvent}
        />
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
        className="w-11/12 max-w-md rounded-xl border border-th-border-strong bg-th-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between">
          <div>
            {event.calendar && (
              <div className="mb-1 text-xs text-cyan-400">{event.calendar}</div>
            )}
            <h3 className="text-lg font-semibold text-th-text">{event.title}</h3>
          </div>
          <button onClick={onClose} className="rounded p-1 text-th-text-secondary hover:text-th-text-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2 text-sm text-th-text-secondary">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4" />
            {event.allDay
              ? start.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })
              : `${start.toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} - ${end.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
          </div>

          {event.location && (
            <div className="flex items-center gap-2">
              <span className="text-th-text-muted">Location:</span>
              {event.location}
            </div>
          )}

          {event.description && (
            <p className="mt-3 whitespace-pre-wrap text-th-text-secondary">{event.description}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateEventForm({
  calendarNames,
  onClose,
  onCreate,
}: {
  calendarNames: string[];
  onClose: () => void;
  onCreate: (data: {
    title: string; start: string; end: string;
    calendar?: string; location?: string; description?: string; allDay?: boolean;
  }) => Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [calendar, setCalendar] = useState(calendarNames[0] || '');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [allDay, setAllDay] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;

    setSaving(true);
    setError('');
    try {
      const start = allDay ? `${date}T00:00:00` : `${date}T${startTime}:00`;
      const end = allDay ? `${date}T23:59:59` : `${date}T${endTime}:00`;
      await onCreate({
        title,
        start,
        end,
        calendar: calendar || undefined,
        location: location || undefined,
        description: description || undefined,
        allDay,
      });
    } catch {
      setError('Failed to create event. Try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-11/12 max-w-md rounded-xl border border-th-border-strong bg-th-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-th-border px-5 py-4">
          <h3 className="text-sm font-semibold text-th-text">New Event</h3>
          <button onClick={onClose} className="rounded p-1 text-th-text-secondary hover:text-th-text-secondary">
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div>
            <label className="mb-1 block text-[11px] text-th-text-secondary">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-md border border-th-border-strong bg-th-input px-3 py-2 text-sm text-th-text outline-none focus:border-cyan-600"
              placeholder="Event title"
              autoFocus
              required
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] text-th-text-secondary">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-md border border-th-border-strong bg-th-input px-3 py-2 text-sm text-th-text outline-none focus:border-cyan-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] text-th-text-secondary">Calendar</label>
              <select
                value={calendar}
                onChange={(e) => setCalendar(e.target.value)}
                className="w-full rounded-md border border-th-border-strong bg-th-input px-3 py-2 text-sm text-th-text outline-none focus:border-cyan-600"
              >
                {calendarNames.map((n) => (
                  <option key={n} value={n}>{n}</option>
                ))}
                <option value="">Default</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-th-text-secondary">
              <input
                type="checkbox"
                checked={allDay}
                onChange={(e) => setAllDay(e.target.checked)}
                className="rounded border-slate-600"
              />
              All day
            </label>
          </div>

          {!allDay && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[11px] text-th-text-secondary">Start Time</label>
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="w-full rounded-md border border-th-border-strong bg-th-input px-3 py-2 text-sm text-th-text outline-none focus:border-cyan-600"
                />
              </div>
              <div>
                <label className="mb-1 block text-[11px] text-th-text-secondary">End Time</label>
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="w-full rounded-md border border-th-border-strong bg-th-input px-3 py-2 text-sm text-th-text outline-none focus:border-cyan-600"
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1 block text-[11px] text-th-text-secondary">Location</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-md border border-th-border-strong bg-th-input px-3 py-2 text-sm text-th-text outline-none focus:border-cyan-600"
              placeholder="Optional"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] text-th-text-secondary">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full resize-none rounded-md border border-th-border-strong bg-th-input px-3 py-2 text-sm text-th-text outline-none focus:border-cyan-600"
              placeholder="Optional"
            />
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-xs text-th-text-secondary hover:text-th-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving || !title}
              className="rounded-md bg-cyan-600 px-4 py-2 text-xs text-white hover:bg-cyan-500 disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Event'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
