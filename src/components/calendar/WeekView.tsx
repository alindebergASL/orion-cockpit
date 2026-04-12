import type { CalendarEvent } from '../../types';
import {
  isToday,
  dayName,
  formatTime,
  formatShortDate,
  addDays,
  eventsForDay,
  getCalendarColor,
} from '../../lib/calendarUtils';

interface Props {
  events: CalendarEvent[];
  weekStart: Date;
  onEventClick?: (event: CalendarEvent) => void;
}

export function WeekView({ events, weekStart, onEventClick }: Props) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));

  return (
    <div className="h-full overflow-x-auto">
    <div className="grid h-full grid-cols-7 divide-x divide-th-border min-w-[600px]">
      {days.map((date, i) => {
        const dayEvents = eventsForDay(events, date);
        const today = isToday(date);

        return (
          <div key={i} className="flex flex-col overflow-hidden">
            {/* Day header */}
            <div
              className={`flex flex-col items-center border-b px-2 py-2 ${
                today ? 'border-cyan-600 bg-cyan-600/10' : 'border-th-border'
              }`}
            >
              <span className="text-[11px] text-th-text-secondary">{dayName(i)}</span>
              <span
                className={`mt-0.5 flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold ${
                  today
                    ? 'bg-cyan-600 text-white'
                    : 'text-th-text'
                }`}
              >
                {date.getDate()}
              </span>
              <span className="text-[10px] text-th-text-muted">
                {formatShortDate(date)}
              </span>
            </div>

            {/* Events */}
            <div className="flex-1 space-y-1 overflow-y-auto p-1.5">
              {dayEvents.length === 0 && (
                <div className="py-4 text-center text-[10px] text-th-text-muted">
                  No events
                </div>
              )}
              {dayEvents.map((evt) => (
                <EventBlock
                  key={evt.id ?? `${evt.title}-${evt.start}`}
                  event={evt}
                  onClick={onEventClick}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
    </div>
  );
}

function EventBlock({
  event,
  onClick,
}: {
  event: CalendarEvent;
  onClick?: (e: CalendarEvent) => void;
}) {
  const color = getCalendarColor(event.calendar || 'default');
  const start = new Date(event.start);

  return (
    <button
      onClick={() => onClick?.(event)}
      className={`w-full rounded-md border-l-2 px-2 py-1.5 text-left transition-colors hover:brightness-125 ${color.bg} ${color.border}`}
    >
      {!event.allDay && (
        <div className={`text-[10px] font-medium ${color.text}`}>
          {formatTime(start)}
        </div>
      )}
      {event.allDay && (
        <div className={`text-[10px] font-medium ${color.text}`}>All day</div>
      )}
      <div className="truncate text-xs text-th-text">{event.title}</div>
      {event.location && (
        <div className="truncate text-[10px] text-th-text-secondary">{event.location}</div>
      )}
    </button>
  );
}
