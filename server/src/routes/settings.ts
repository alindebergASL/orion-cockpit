import { Router } from 'express';
import { getDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { openclawClient } from '../services/openclaw.js';

export const settingsRouter = Router();

settingsRouter.use(authenticate);

// Get all user settings
settingsRouter.get('/', (req, res) => {
  const rows = getDb()
    .prepare('SELECT key, value FROM user_settings WHERE user_id = ?')
    .all(req.user!.id) as { key: string; value: string }[];

  const settings: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      settings[row.key] = JSON.parse(row.value);
    } catch {
      settings[row.key] = row.value;
    }
  }
  res.json(settings);
});

// Update a setting
settingsRouter.put('/:key', (req, res) => {
  const userId = req.user!.id;
  const key = req.params.key;
  const { value } = req.body;

  const serialized = typeof value === 'string' ? value : JSON.stringify(value);

  getDb().prepare(`
    INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
    ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `).run(userId, key, serialized);

  res.json({ ok: true });
});

// Get available calendars from OpenClaw
settingsRouter.get('/calendars', async (_req, res) => {
  try {
    const calendars = await openclawClient.getCalendarList();
    console.log(`Calendar list fetched: ${calendars.length} calendars`);
    res.json(calendars);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch calendars';
    console.error('Calendar list fetch failed:', message);
    res.status(502).json({ error: message });
  }
});

// Get available task lists from OpenClaw
settingsRouter.get('/task-lists', async (_req, res) => {
  try {
    const lists = await openclawClient.getTaskLists();
    res.json(lists);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch task lists';
    res.status(502).json({ error: message });
  }
});
