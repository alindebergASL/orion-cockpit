import { useCallback, useEffect, useRef, useState } from 'react';
import {
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  MessageSquare,
  X,
  AlertTriangle,
} from 'lucide-react';
import { useOpenClaw } from '../../hooks/useOpenClaw';
import { useChat } from '../../hooks/useChat';
import { MessageList } from '../chat/MessageList';
import { MessageInput } from '../chat/MessageInput';
import { WeekView } from '../calendar/WeekView';
import { MonthView } from '../calendar/MonthView';
import type { CalendarEvent } from '../../types';
import {
  startOfWeek,
  addDays,
  formatShortDate,
  parseEventsFromText,
  getCalendarColor,
  CALENDAR_SYSTEM_PROMPT,
} from '../../lib/calendarUtils';

type ViewMode = 'week' | 'month';

export function CalendarTab() {
  const { client } = useOpenClaw();
  const chat = useChat(client, 'cockpit-calendar-chat');

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewMode>('week');
  const [anchor, setAnchor] = useState(new Date()); // current week/month anchor
  const [chatOpen, setChatOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const hasFetched = useRef(false);

  const weekStart = startOfWeek(anchor);

  // ── Fetch events via OpenClaw chat API ────────────────────
  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);

    const today = new Date().toISOString().split('T')[0];
    try {
      const response = await client.chatOnce(
        [
          { role: 'system', content: CALENDAR_SYSTEM_PROMPT },
          {
            role: 'user',
            content: `List all events from my Google Calendars for the next 30 days starting from ${today}. Include events from all shared calendars.`,
          },
        ],
        'cockpit-calendar-fetch',
      );

      const parsed = parseEventsFromText(response);
      if (parsed.length > 0) {
        setEvents(parsed);
      } else {
        setError(
          'OpenClaw responded but no structured event data was returned. Try asking in the chat below.',
        );
      }
    } catch {
      setError('Could not reach OpenClaw. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchEvents();
    }
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

  // ── Unique calendar names for legend ──────────────────────
  const calendarNames = [...new Set(events.map((e) => e.calendar).filter(Boolean))];

  return (
    <div className="flex h-full flex-col">
      {/* ── Header ──────────────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <h2 className="text-sm font-semibold text-slate-100">Calendar</h2>
          <span className="text-xs text-slate-500">Google Calendars via OpenClaw</span>
        </div>

        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-slate-700 text-xs">
            <button
              onClick={() => setView('week')}
              className={`rounded-l-lg px-2.5 py-1 ${
                view === 'week' ? 'bg-cyan-600/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Week
            </button>
            <button
              onClick={() => setView('month')}
              className={`rounded-r-lg px-2.5 py-1 ${
                view === 'month' ? 'bg-cyan-600/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              Month
            </button>
          </div>

          {/* Chat toggle */}
          <button
            onClick={() => setChatOpen((o) => !o)}
            className={`flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs transition-colors ${
              chatOpen ? 'bg-cyan-600/20 text-cyan-400' : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Chat
          </button>

          {/* Refresh */}
          <button
            onClick={fetchEvents}
            disabled={loading}
            className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* ── Date navigation ─────────────────────────────────── */}
      <div className="flex items-center justify-between border-b border-slate-800/50 px-4 py-1.5">
        <div className="flex items-center gap-1">
          <button onClick={() => navigate(-1)} className="rounded p-1 text-slate-500 hover:text-slate-200">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <button onClick={() => navigate(1)} className="rounded p-1 text-slate-500 hover:text-slate-200">
            <ChevronRight className="h-4 w-4" />
          </button>
          <span className="ml-2 text-sm font-medium text-slate-200">{rangeLabel}</span>
        </div>

        <div className="flex items-center gap-3">
          {/* Calendar legend */}
          {calendarNames.length > 0 && (
            <div className="flex items-center gap-2">
              {calendarNames.slice(0, 5).map((name) => {
                const color = getCalendarColor(name);
                return (
                  <span key={name} className="flex items-center gap-1 text-[10px] text-slate-500">
                    <span className={`inline-block h-2 w-2 rounded-full ${color.dot}`} />
                    {name}
                  </span>
                );
              })}
            </div>
          )}

          <button
            onClick={goToday}
            className="rounded-md border border-slate-700 px-2 py-0.5 text-xs text-slate-400 hover:text-slate-200"
          >
            Today
          </button>
        </div>
      </div>

      {/* ── Main area ───────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Calendar grid */}
        <div className="flex-1 overflow-hidden">
          {loading && events.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
              <RefreshCw className="h-8 w-8 animate-spin" />
              <p className="text-sm">Fetching events from OpenClaw...</p>
            </div>
          ) : error && events.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500">
              <AlertTriangle className="h-8 w-8 text-amber-500" />
              <p className="max-w-sm text-center text-sm">{error}</p>
              <button
                onClick={fetchEvents}
                className="mt-2 rounded-lg bg-cyan-600 px-4 py-2 text-xs text-white hover:bg-cyan-500"
              >
                Retry
              </button>
            </div>
          ) : view === 'week' ? (
            <WeekView events={events} weekStart={weekStart} onEventClick={setSelectedEvent} />
          ) : (
            <MonthView events={events} month={anchor} onEventClick={setSelectedEvent} />
          )}
        </div>

        {/* Chat panel (right side, collapsible) */}
        {chatOpen && (
          <div className="flex w-80 flex-col border-l border-slate-800 bg-slate-900/50">
            <div className="flex items-center justify-between border-b border-slate-800 px-3 py-2">
              <span className="text-xs font-medium text-slate-400">Ask about your calendar</span>
              <button
                onClick={() => setChatOpen(false)}
                className="rounded p-1 text-slate-500 hover:text-slate-300"
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
    </div>
  );
}

function EventDetail({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const start = new Date(event.start);
  const end = new Date(event.end);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border border-slate-700 bg-slate-900 p-5 shadow-2xl"
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
