import type { CalendarEvent } from '../types';

// ── Color palette for calendar sources ──────────────────────
const COLORS = [
  { bg: 'bg-blue-500/20', border: 'border-blue-500', text: 'text-blue-400', dot: 'bg-blue-500' },
  { bg: 'bg-emerald-500/20', border: 'border-emerald-500', text: 'text-emerald-400', dot: 'bg-emerald-500' },
  { bg: 'bg-amber-500/20', border: 'border-amber-500', text: 'text-amber-400', dot: 'bg-amber-500' },
  { bg: 'bg-violet-500/20', border: 'border-violet-500', text: 'text-violet-400', dot: 'bg-violet-500' },
  { bg: 'bg-pink-500/20', border: 'border-pink-500', text: 'text-pink-400', dot: 'bg-pink-500' },
  { bg: 'bg-cyan-500/20', border: 'border-cyan-500', text: 'text-cyan-400', dot: 'bg-cyan-500' },
  { bg: 'bg-orange-500/20', border: 'border-orange-500', text: 'text-orange-400', dot: 'bg-orange-500' },
  { bg: 'bg-red-500/20', border: 'border-red-500', text: 'text-red-400', dot: 'bg-red-500' },
];

export type CalendarColor = (typeof COLORS)[number];

const colorCache = new Map<string, CalendarColor>();

export function getCalendarColor(calendarName: string): CalendarColor {
  const cached = colorCache.get(calendarName);
  if (cached) return cached;

  let hash = 0;
  for (const ch of calendarName) hash = ((hash << 5) - hash + ch.charCodeAt(0)) | 0;
  const color = COLORS[Math.abs(hash) % COLORS.length]!;
  colorCache.set(calendarName, color);
  return color;
}

// ── Date helpers ────────────────────────────────────────────

export function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() - day + (day === 0 ? -6 : 1)); // Monday start
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, n: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function isToday(d: Date): boolean {
  return isSameDay(d, new Date());
}

export function formatTime(d: Date): string {
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function formatShortDate(d: Date): string {
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
export function dayName(index: number): string {
  return DAY_NAMES[index] ?? '';
}

export function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

export function daysInMonth(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
}

/** Returns the Monday-based day index (0=Mon .. 6=Sun) */
export function mondayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

// ── Event grouping ──────────────────────────────────────────

export function eventsForDay(events: CalendarEvent[], date: Date): CalendarEvent[] {
  return events
    .filter((e) => {
      const start = new Date(e.start);
      if (e.allDay) {
        const end = new Date(e.end);
        return date >= startOfDay(start) && date <= startOfDay(end);
      }
      return isSameDay(start, date);
    })
    .sort((a, b) => {
      if (a.allDay && !b.allDay) return -1;
      if (!a.allDay && b.allDay) return 1;
      return new Date(a.start).getTime() - new Date(b.start).getTime();
    });
}

function startOfDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

// ── Parse events from OpenClaw chat response ────────────────

const CALENDAR_SYSTEM_PROMPT = `You are the calendar assistant for Orion Cockpit. You have access to the user's Google Calendars via OpenClaw.

When the user asks to see events, list them conversationally AND include a JSON code block at the end with ALL events. Use this exact format:

\`\`\`json
[{"id":"unique","title":"Event Name","start":"2026-04-10T09:00:00","end":"2026-04-10T10:00:00","calendar":"Calendar Name","location":"","description":"","allDay":false}]
\`\`\`

Always include the JSON block so the dashboard can render the calendar grid.`;

export { CALENDAR_SYSTEM_PROMPT };

export function parseEventsFromText(text: string): CalendarEvent[] {
  // 1. Try ```json ... ``` blocks (use the last one found)
  const jsonBlockRe = /```json\s*([\s\S]*?)```/g;
  let lastJson: string | null = null;
  let match: RegExpExecArray | null;
  while ((match = jsonBlockRe.exec(text)) !== null) {
    lastJson = match[1]?.trim() ?? null;
  }

  if (lastJson) {
    const parsed = tryParseArray(lastJson);
    if (parsed) return parsed;
  }

  // 2. Try ``` ... ``` blocks (no language tag)
  const codeBlockRe = /```\s*([\s\S]*?)```/g;
  while ((match = codeBlockRe.exec(text)) !== null) {
    const parsed = tryParseArray(match[1]?.trim() ?? '');
    if (parsed) return parsed;
  }

  // 3. Try bare JSON array in the text
  const arrayRe = /\[\s*\{[\s\S]*?\}\s*\]/g;
  while ((match = arrayRe.exec(text)) !== null) {
    const parsed = tryParseArray(match[0] ?? '');
    if (parsed) return parsed;
  }

  return [];
}

function tryParseArray(text: string): CalendarEvent[] | null {
  try {
    const arr = JSON.parse(text);
    if (!Array.isArray(arr)) return null;
    // Validate minimum shape
    return arr.filter(
      (e: Record<string, unknown>) =>
        typeof e === 'object' && e !== null && typeof e.title === 'string' && typeof e.start === 'string',
    ) as CalendarEvent[];
  } catch {
    return null;
  }
}
