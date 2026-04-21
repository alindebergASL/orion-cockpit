import { Router } from 'express';
import { getDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { syncCalendar } from '../services/sync.js';
import { openclawClient } from '../services/openclaw.js';

export const calendarRouter = Router();

calendarRouter.use(authenticate);

calendarRouter.get('/events', (req, res) => {
  const userId = req.user!.id;
  const rows = getDb()
    .prepare(`
      SELECT id, external_id, user_id, title, start, end, calendar,
             location, description, all_day, synced_at
      FROM calendar_events
      WHERE user_id = ? OR user_id IS NULL
      ORDER BY start ASC
    `)
    .all(userId) as Record<string, unknown>[];

  // Find latest sync time
  const syncRow = getDb()
    .prepare('SELECT last_synced_at FROM sync_log WHERE user_id = ? AND data_type = ? ORDER BY id DESC LIMIT 1')
    .get(userId, 'calendar') as { last_synced_at: string } | undefined;

  res.json({
    events: rows.map((r) => ({
      id: r.id,
      externalId: r.external_id,
      title: r.title,
      start: r.start,
      end: r.end,
      calendar: r.calendar,
      location: r.location,
      description: r.description,
      allDay: !!r.all_day,
    })),
    syncedAt: syncRow?.last_synced_at ?? null,
  });
});

calendarRouter.post('/sync', async (req, res) => {
  try {
    const events = await syncCalendar(req.user!.id);
    res.json({ events, syncedAt: new Date().toISOString() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    res.status(502).json({ error: message });
  }
});

calendarRouter.post('/events', async (req, res) => {
  const userId = req.user!.id;
  const { title, start, end, calendar, location, description, allDay } = req.body;

  if (!title || !start || !end) {
    res.status(400).json({ error: 'title, start, and end are required' });
    return;
  }

  // Ensure timestamps have timezone info (Google API requires it)
  const ensureTz = (ts: string): string => {
    // Already has offset (e.g. -07:00 or Z)
    if (/[+-]\d{2}:\d{2}$/.test(ts) || ts.endsWith('Z')) return ts;
    // Add local timezone offset
    const d = new Date(ts);
    if (isNaN(d.getTime())) throw new Error(`Invalid timestamp: ${ts}`);
    const offset = -d.getTimezoneOffset();
    const sign = offset >= 0 ? '+' : '-';
    const hh = String(Math.floor(Math.abs(offset) / 60)).padStart(2, '0');
    const mm = String(Math.abs(offset) % 60).padStart(2, '0');
    return `${ts}${sign}${hh}:${mm}`;
  };

  const tzStart = ensureTz(start);
  const tzEnd = ensureTz(end);

  // Create on OpenClaw first, then insert locally with the external ID
  try {
    const created = await openclawClient.createCalendarEvent({
      title, start: tzStart, end: tzEnd,
      calendar: calendar || undefined,
      location: location || undefined,
      description: description || undefined,
      allDay: allDay || undefined,
    });

    // Insert with external ID so auto-sync won't orphan it
    const now = new Date().toISOString();
    getDb()
      .prepare(`INSERT INTO calendar_events (external_id, user_id, title, start, end, calendar, location, description, all_day, synced_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run(created.id || null, userId, title, tzStart, tzEnd, calendar || '', location || null, description || null, allDay ? 1 : 0, now);

    const rows = getDb()
      .prepare('SELECT id, external_id, user_id, title, start, end, calendar, location, description, all_day, synced_at FROM calendar_events WHERE user_id = ? OR user_id IS NULL ORDER BY start ASC')
      .all(userId) as Record<string, unknown>[];

    res.status(201).json({
      events: rows.map((r) => ({
        id: r.id, externalId: r.external_id, title: r.title,
        start: r.start, end: r.end, calendar: r.calendar,
        location: r.location, description: r.description, allDay: !!r.all_day,
      })),
      syncedAt: now,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create event';
    res.status(502).json({ error: message });
  }
});

calendarRouter.post('/ai-free-time', async (req, res) => {
  const userId = req.user!.id;
  const rows = getDb()
    .prepare(`
      SELECT title, start, end, all_day
      FROM calendar_events
      WHERE (user_id = ? OR user_id IS NULL) AND start >= date('now') AND start <= date('now', '+7 days')
      ORDER BY start ASC
    `)
    .all(userId) as { title: string; start: string; end: string; all_day: number }[];

  const eventList = rows.length > 0
    ? rows.map((e) => `  - ${e.title}: ${e.start} to ${e.end}${e.all_day ? ' (all day)' : ''}`).join('\n')
    : '  (no events this week)';

  const prompt = `You are a scheduling assistant. Analyze the following calendar events for the next 7 days and identify the best 3-5 free time blocks for focus work or meetings. Consider typical working hours (8 AM - 6 PM).

Events this week:
${eventList}

Return ONLY valid JSON (no markdown, no code fences):
{
  "slots": [
    { "day": "Monday", "start": "10:00 AM", "end": "12:00 PM", "suggestion": "Great 2-hour block for deep work" }
  ]
}
Order from most useful/largest to smallest.`;

  try {
    const raw = await openclawClient.chatOnce([
      { role: 'system', content: 'You are a concise scheduling analyst. Return only valid JSON.' },
      { role: 'user', content: prompt },
    ]);
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    res.json(JSON.parse(cleaned));
  } catch (err) {
    res.status(500).json({ error: 'Failed to find free time', detail: String(err) });
  }
});
