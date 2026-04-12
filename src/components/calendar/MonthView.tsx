import type { CalendarEvent } from '../../types';
import {
  startOfMonth,
  daysInMonth,
  mondayIndex,
  addDays,
  isToday,
  dayName,
  eventsForDay,
  getCalendarColor,
} from '../../lib/calendarUtils';

interface Props {
  events: CalendarEvent[];
  month: Date; // any date within the target month
  onEventClick?: (event: CalendarEvent) => void;
}

const MAX_VISIBLE = 3;

export function MonthView({ events, month, onEventClick }: Props) {
  const first = startOfMonth(month);
  const total = daysInMonth(month);
  const offset = mondayIndex(first); // blanks before day 1

  // Build 6-row grid (42 cells)
  const cells: (Date | null)[] = [];
  for (let i = 0; i < offset; i++) cells.push(addDays(first, i - offset));
  for (let d = 0; d < total; d++) cells.push(addDays(first, d));
  while (cells.length < 42) cells.push(addDays(first, cells.length - offset));

  const rows = Array.from({ length: 6 }, (_, r) => cells.slice(r * 7, r * 7 + 7));
  const thisMonth = month.getMonth();

  return (
    <div className="flex h-full flex-col overflow-x-auto">
      <div className="min-w-[600px] flex flex-1 flex-col">
      {/* Header */}
      <div className="grid grid-cols-7 border-b border-slate-800">
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="py-1.5 text-center text-[11px] font-medium text-slate-500">
            {dayName(i)}
          </div>
        ))}
      </div>

      {/* Grid */}
      <div className="grid flex-1 grid-rows-6 divide-y divide-slate-800">
        {rows.map((week, ri) => (
          <div key={ri} className="grid grid-cols-7 divide-x divide-slate-800">
            {week.map((date, ci) => {
              if (!date) return <div key={ci} />;

              const inMonth = date.getMonth() === thisMonth;
              const today = isToday(date);
              const dayEvents = eventsForDay(events, date);

              return (
                <div
                  key={ci}
                  className={`flex flex-col overflow-hidden p-1 ${
                    inMonth ? '' : 'bg-slate-900/40'
                  }`}
                >
                  {/* Date number */}
                  <span
                    className={`mb-0.5 flex h-6 w-6 items-center justify-center self-end rounded-full text-xs ${
                      today
                        ? 'bg-cyan-600 font-bold text-white'
                        : inMonth
                          ? 'text-slate-300'
                          : 'text-slate-600'
                    }`}
                  >
                    {date.getDate()}
                  </span>

                  {/* Event chips */}
                  <div className="flex flex-col gap-px">
                    {dayEvents.slice(0, MAX_VISIBLE).map((evt) => {
                      const color = getCalendarColor(evt.calendar || 'default');
                      return (
                        <button
                          key={evt.id ?? `${evt.title}-${evt.start}`}
                          onClick={() => onEventClick?.(evt)}
                          className={`flex items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[10px] transition-colors hover:brightness-125 ${color.bg}`}
                        >
                          <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${color.dot}`} />
                          <span className="truncate text-slate-200">{evt.title}</span>
                        </button>
                      );
                    })}
                    {dayEvents.length > MAX_VISIBLE && (
                      <span className="px-1 text-[10px] text-slate-500">
                        +{dayEvents.length - MAX_VISIBLE} more
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      </div>
    </div>
  );
}
