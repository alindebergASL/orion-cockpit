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

  // Insert into SQLite immediately so it shows up in the UI
  const now = new Date().toISOString();
  getDb()
    .prepare(`INSERT INTO calendar_events (user_id, title, start, end, calendar, location, description, all_day, synced_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(userId, title, start, end, calendar || '', location || null, description || null, allDay ? 1 : 0, now);

  // Return immediately with updated events
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

  // Create via direct API in the background (don't await)
  openclawClient.createCalendarEvent({
    title, start, end,
    calendar: calendar || undefined,
    location: location || undefined,
    description: description || undefined,
    allDay: allDay || undefined,
  }).then(() => syncCalendar(userId)).catch((err) =>
    console.error('Background calendar sync failed:', err.message),
  );
});
