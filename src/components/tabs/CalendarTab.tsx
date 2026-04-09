import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, CalendarDays, MapPin, Clock } from 'lucide-react';
import { useOpenClaw } from '../../hooks/useOpenClaw';
import { useChat } from '../../hooks/useChat';
import { MessageList } from '../chat/MessageList';
import { MessageInput } from '../chat/MessageInput';
import type { CalendarEvent } from '../../types';

export function CalendarTab() {
  const { client } = useOpenClaw();
  const chat = useChat(client, 'cockpit-calendar');
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await client.invokeTool<{ events?: CalendarEvent[] }>(
        'calendar.list_events',
        { days: 14 },
      );
      setEvents(result.events ?? []);
    } catch {
      setError('Could not fetch calendar events. Use the chat below to ask OpenClaw about your schedule.');
    } finally {
      setLoading(false);
    }
  }, [client]);

  useEffect(() => {
    fetchEvents();
  }, [fetchEvents]);

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Calendar</h2>
          <p className="text-xs text-slate-500">Shared calendars via OpenClaw</p>
        </div>
        <button
          onClick={fetchEvents}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Events list */}
      <div className="flex-1 overflow-y-auto">
        <div className="grid gap-px bg-slate-800/50 lg:grid-cols-2">
          {error && (
            <div className="col-span-full px-4 py-6 text-center text-sm text-slate-500">
              {error}
            </div>
          )}

          {!error && events.length === 0 && !loading && (
            <div className="col-span-full flex flex-col items-center gap-2 px-4 py-12 text-slate-500">
              <CalendarDays className="h-10 w-10" />
              <p className="text-sm">No upcoming events</p>
              <p className="text-xs text-slate-600">
                Ask OpenClaw about your schedule below
              </p>
            </div>
          )}

          {events.map((evt) => (
            <EventCard key={evt.id} event={evt} />
          ))}
        </div>

        {/* Chat for calendar queries */}
        <div className="border-t border-slate-700 bg-slate-950/50">
          <div className="px-4 py-2">
            <p className="text-xs text-slate-500">
              Ask OpenClaw about your calendar
            </p>
          </div>
          <div className="max-h-60 overflow-y-auto">
            <MessageList messages={chat.messages} streaming={chat.streaming} />
          </div>
          <MessageInput
            onSend={chat.send}
            onStop={chat.stop}
            streaming={chat.streaming}
            placeholder="Ask about your schedule..."
          />
        </div>
      </div>
    </div>
  );
}

function EventCard({ event }: { event: CalendarEvent }) {
  const start = new Date(event.start);
  const end = new Date(event.end);

  return (
    <div className="bg-slate-900 p-4">
      <div className="mb-1 text-xs font-medium text-cyan-400">{event.calendar}</div>
      <h3 className="text-sm font-semibold text-slate-100">{event.title}</h3>
      <div className="mt-2 flex flex-col gap-1">
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <Clock className="h-3 w-3" />
          {event.allDay
            ? start.toLocaleDateString()
            : `${start.toLocaleString()} - ${end.toLocaleTimeString()}`}
        </div>
        {event.location && (
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <MapPin className="h-3 w-3" />
            {event.location}
          </div>
        )}
      </div>
    </div>
  );
}
