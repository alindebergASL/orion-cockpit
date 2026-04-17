import { Router } from 'express';
import { getDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';

export const weeklyNotesRouter = Router();

weeklyNotesRouter.use(authenticate);

// Get weekly note for a specific week (YYYY-Www format, e.g. 2026-W16)
weeklyNotesRouter.get('/:week', (req, res) => {
  const userId = req.user!.id;
  const week = req.params.week;

  const row = getDb()
    .prepare('SELECT content, updated_at FROM weekly_notes WHERE user_id = ? AND week = ?')
    .get(userId, week) as { content: string; updated_at: string } | undefined;

  res.json({
    week,
    content: row?.content ?? '',
    updatedAt: row?.updated_at ?? null,
  });
});

// Save/update weekly note
weeklyNotesRouter.put('/:week', (req, res) => {
  const userId = req.user!.id;
  const week = req.params.week;
  const { content } = req.body as { content: string };

  getDb().prepare(`
    INSERT INTO weekly_notes (user_id, week, content) VALUES (?, ?, ?)
    ON CONFLICT(user_id, week) DO UPDATE SET content = excluded.content, updated_at = datetime('now')
  `).run(userId, week, content ?? '');

  res.json({ ok: true });
});
