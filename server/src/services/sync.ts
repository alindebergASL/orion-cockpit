import { getDb } from '../db.js';
import { openclawClient } from './openclaw.js';

// Per-user sync mutex to prevent concurrent syncs from corrupting data
const syncLocks = new Map<string, Promise<unknown>>();

async function withSyncLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  // Wait for any existing sync to finish
  while (syncLocks.has(key)) {
    await syncLocks.get(key);
  }
  const promise = fn();
  syncLocks.set(key, promise);
  try {
    return await promise;
  } finally {
    syncLocks.delete(key);
  }
}

/**
 * Sync calendar events from OpenClaw's direct API into SQLite.
 * Uses GET /api/calendar/events (no LLM, calls gog directly).
 */
export async function syncCalendar(userId: number): Promise<unknown[]> {
  return withSyncLock(`calendar-${userId}`, () => syncCalendarInner(userId));
}

async function syncCalendarInner(userId: number): Promise<unknown[]> {
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
  return withSyncLock(`tasks-${userId}`, () => syncTasksInner(userId));
}

async function syncTasksInner(userId: number): Promise<unknown[]> {
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

  // Manual upsert (check existence, then UPDATE or INSERT).
  // This preserves SQLite row IDs across syncs so frontend references stay valid.
  const findStmt = db.prepare('SELECT id FROM tasks WHERE external_id = ? AND user_id = ?');
  const updateStmt = db.prepare(`
    UPDATE tasks SET title = ?, status = ?, priority = ?, due_date = ?,
      description = ?, list_name = ?, synced_at = ?
    WHERE id = ?
  `);
  const insertStmt = db.prepare(`
    INSERT INTO tasks (external_id, user_id, title, status, priority, due_date, description, list_name, synced_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  // Get current external_ids to detect deletions
  const existingIds = new Set(
    (db.prepare('SELECT external_id FROM tasks WHERE user_id = ? AND external_id IS NOT NULL').all(userId) as { external_id: string }[])
      .map((r) => r.external_id)
  );

  const incomingIds = new Set(tasks.filter((t) => t.id).map((t) => t.id!));

  const syncAll = db.transaction(() => {
    for (const t of tasks) {
      if (!t.id) continue;
      const existing = findStmt.get(t.id, userId) as { id: number } | undefined;
      if (existing) {
        updateStmt.run(
          t.title, t.status || 'open', t.priority || null, t.dueDate || null,
          t.description || null, t.listName || null, now, existing.id,
        );
      } else {
        insertStmt.run(
          t.id, userId, t.title, t.status || 'open',
          t.priority || null, t.dueDate || null,
          t.description || null, t.listName || null, now,
        );
      }
    }
    // Only delete tasks that exist in OpenClaw's data snapshot.
    // If OpenClaw returned empty (error or no tasks), skip deletion to avoid wiping local data.
    if (tasks.length > 0) {
      for (const oldId of existingIds) {
        if (!incomingIds.has(oldId)) {
          db.prepare('DELETE FROM tasks WHERE external_id = ? AND user_id = ?').run(oldId, userId);
        }
      }
    }
  });

  syncAll();

  // Reconcile promoted project tasks with their linked reminders.
  // If a reminder's status changed in Apple Reminders, update the project task to match.
  const promotedTasks = db.prepare(`
    SELECT pt.id, pt.status as pt_status, pt.external_id, pt.project_id
    FROM project_tasks pt
    JOIN projects p ON pt.project_id = p.id
    WHERE p.user_id = ? AND pt.external_id IS NOT NULL
  `).all(userId) as { id: number; pt_status: string; external_id: string; project_id: number }[];

  if (promotedTasks.length > 0) {
    const updatePt = db.prepare('UPDATE project_tasks SET status = ? WHERE id = ?');
    const touchProject = db.prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?");
    const touchedProjects = new Set<number>();

    for (const pt of promotedTasks) {
      const synced = db.prepare('SELECT status FROM tasks WHERE external_id = ? AND user_id = ?')
        .get(pt.external_id, userId) as { status: string } | undefined;
      if (synced && synced.status !== pt.pt_status) {
        updatePt.run(synced.status, pt.id);
        touchedProjects.add(pt.project_id);
      }
    }

    for (const pid of touchedProjects) {
      touchProject.run(pid);
    }
  }

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
