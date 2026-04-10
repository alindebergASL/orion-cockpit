import { getDb } from '../db.js';
import { openclawClient } from './openclaw.js';

/**
 * Sync calendar events from OpenClaw into SQLite for a given user.
 * Asks OpenClaw for the user's upcoming events, then upserts them.
 */
export async function syncCalendar(userId: number): Promise<unknown[]> {
  const db = getDb();

  // Get user info for the OpenClaw request
  const user = db.prepare('SELECT username, display_name FROM users WHERE id = ?')
    .get(userId) as { username: string; display_name: string } | undefined;

  if (!user) throw new Error('User not found');

  // Ask OpenClaw to fetch calendar events
  const response = await openclawClient.chatOnce([
    {
      role: 'user',
      content: `Return ${user.display_name}'s calendar events for the next 14 days as JSON array. Each event should have: id, title, start (ISO), end (ISO), calendar, location, description, allDay (boolean). Return ONLY the JSON array, no other text.`,
    },
  ]);

  let events: Array<{
    id?: string;
    title: string;
    start: string;
    end: string;
    calendar: string;
    location?: string;
    description?: string;
    allDay?: boolean;
  }>;

  try {
    // Extract JSON from response (may be wrapped in markdown code blocks)
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    events = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    throw new Error('Failed to parse calendar data from OpenClaw');
  }

  // Clear existing events for this user and re-insert
  const now = new Date().toISOString();
  const deleteStmt = db.prepare('DELETE FROM calendar_events WHERE user_id = ?');
  const insertStmt = db.prepare(`
    INSERT INTO calendar_events (external_id, user_id, title, start, end, calendar, location, description, all_day, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((evts: typeof events) => {
    deleteStmt.run(userId);
    for (const e of evts) {
      insertStmt.run(
        e.id || null, userId, e.title, e.start, e.end,
        e.calendar, e.location || null, e.description || null,
        e.allDay ? 1 : 0, now,
      );
    }
  });

  insertMany(events);

  // Log the sync
  db.prepare('INSERT INTO sync_log (user_id, data_type, last_synced_at, status) VALUES (?, ?, ?, ?)')
    .run(userId, 'calendar', now, 'success');

  return events;
}

/**
 * Sync tasks from OpenClaw into SQLite for a given user.
 */
export async function syncTasks(userId: number): Promise<unknown[]> {
  const db = getDb();

  const user = db.prepare('SELECT username, display_name FROM users WHERE id = ?')
    .get(userId) as { username: string; display_name: string } | undefined;

  if (!user) throw new Error('User not found');

  const response = await openclawClient.chatOnce([
    {
      role: 'user',
      content: `Return ${user.display_name}'s tasks as JSON array. Each task should have: id, title, status (open/in_progress/completed), priority (low/medium/high), dueDate (ISO or null), description, listName. Return ONLY the JSON array, no other text.`,
    },
  ]);

  let tasks: Array<{
    id?: string;
    title: string;
    status: string;
    priority?: string;
    dueDate?: string;
    description?: string;
    listName?: string;
  }>;

  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    tasks = jsonMatch ? JSON.parse(jsonMatch[0]) : [];
  } catch {
    throw new Error('Failed to parse task data from OpenClaw');
  }

  const now = new Date().toISOString();
  const deleteStmt = db.prepare('DELETE FROM tasks WHERE user_id = ?');
  const insertStmt = db.prepare(`
    INSERT INTO tasks (external_id, user_id, title, status, priority, due_date, description, list_name, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((tks: typeof tasks) => {
    deleteStmt.run(userId);
    for (const t of tks) {
      insertStmt.run(
        t.id || null, userId, t.title, t.status || 'open',
        t.priority || null, t.dueDate || null,
        t.description || null, t.listName || null, now,
      );
    }
  });

  insertMany(tasks);

  db.prepare('INSERT INTO sync_log (user_id, data_type, last_synced_at, status) VALUES (?, ?, ?, ?)')
    .run(userId, 'tasks', now, 'success');

  return tasks;
}
