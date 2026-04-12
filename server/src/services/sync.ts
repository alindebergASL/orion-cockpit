import { getDb } from '../db.js';
import { openclawClient } from './openclaw.js';

/**
 * Sync calendar events from OpenClaw's direct API into SQLite.
 * Uses GET /api/calendar/events (no LLM, calls gog directly).
 */
export async function syncCalendar(userId: number): Promise<unknown[]> {
  const db = getDb();

  const user = db.prepare('SELECT username, display_name FROM users WHERE id = ?')
    .get(userId) as { username: string; display_name: string } | undefined;

  if (!user) throw new Error('User not found');

  // Fetch next 14 days of events via direct API
  const from = new Date().toISOString();
  const to = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
  const allEvents = await openclawClient.getCalendarEvents(from, to);

  // Filter by user's calendar preferences (if set)
  const prefRow = db.prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'enabled_calendars'")
    .get(userId) as { value: string } | undefined;

  let events = allEvents;
  if (prefRow) {
    try {
      const enabled = JSON.parse(prefRow.value) as string[];
      if (enabled.length > 0) {
        events = allEvents.filter((e) =>
          enabled.some((name) =>
            e.calendar.toLowerCase().includes(name.toLowerCase()) ||
            (e.calendarId && enabled.includes(e.calendarId))
          ),
        );
      }
    } catch { /* use all events if pref parsing fails */ }
  }

  // Clear existing events for this user and re-insert
  const now = new Date().toISOString();
  const deleteStmt = db.prepare('DELETE FROM calendar_events WHERE user_id = ?');
  const insertStmt = db.prepare(`
    INSERT INTO calendar_events (external_id, user_id, title, start, end, calendar, location, description, all_day, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction(() => {
    deleteStmt.run(userId);
    for (const e of events) {
      insertStmt.run(
        e.id || null, userId, e.title, e.start, e.end,
        e.calendar, e.location || null, e.description || null,
        e.allDay ? 1 : 0, now,
      );
    }
  });

  insertMany();

  db.prepare('INSERT INTO sync_log (user_id, data_type, last_synced_at, status) VALUES (?, ?, ?, ?)')
    .run(userId, 'calendar', now, 'success');

  return events;
}

/**
 * Sync tasks from OpenClaw's direct API into SQLite.
 * Uses GET /api/tasks (no LLM, calls remindctl directly).
 */
export async function syncTasks(userId: number): Promise<unknown[]> {
  const db = getDb();

  const user = db.prepare('SELECT username, display_name FROM users WHERE id = ?')
    .get(userId) as { username: string; display_name: string } | undefined;

  if (!user) throw new Error('User not found');

  const allTasks = await openclawClient.getTasks();

  // Filter by user's task list preferences (if set)
  const taskPrefRow = db.prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'enabled_task_lists'")
    .get(userId) as { value: string } | undefined;

  let tasks = allTasks;
  if (taskPrefRow) {
    try {
      const enabled = JSON.parse(taskPrefRow.value) as string[];
      if (enabled.length > 0) {
        tasks = allTasks.filter((t) =>
          t.listName && enabled.some((name) =>
            t.listName!.toLowerCase() === name.toLowerCase() ||
            enabled.includes(t.listName!)
          ),
        );
      }
    } catch { /* use all tasks if pref parsing fails */ }
  }

  const now = new Date().toISOString();
  const deleteStmt = db.prepare('DELETE FROM tasks WHERE user_id = ?');
  const insertStmt = db.prepare(`
    INSERT INTO tasks (external_id, user_id, title, status, priority, due_date, description, list_name, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction(() => {
    deleteStmt.run(userId);
    for (const t of tasks) {
      insertStmt.run(
        t.id || null, userId, t.title, t.status || 'open',
        t.priority || null, t.dueDate || null,
        t.description || null, t.listName || null, now,
      );
    }
  });

  insertMany();

  db.prepare('INSERT INTO sync_log (user_id, data_type, last_synced_at, status) VALUES (?, ?, ?, ?)')
    .run(userId, 'tasks', now, 'success');

  return tasks;
}

/**
 * Sync OpenClaw's SOUL.md into the settings table.
 * Uses GET /api/soul (no LLM, reads file directly).
 */
export async function syncSoulMd(): Promise<string> {
  const db = getDb();

  const content = await openclawClient.getSoul();

  if (!content || content.length < 50) {
    throw new Error('SOUL.md response too short or empty');
  }

  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES ('soul_md', ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
  `).run(content, now);

  db.prepare('INSERT INTO sync_log (user_id, data_type, last_synced_at, status) VALUES (?, ?, ?, ?)')
    .run(null, 'soul_md', now, 'success');

  console.log(`Synced SOUL.md (${content.length} chars)`);
  return content;
}
