import { Router } from 'express';
import { getDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';

export const dailyNotesRouter = Router();

dailyNotesRouter.use(authenticate);

// Get daily note for a specific date
dailyNotesRouter.get('/:date', (req, res) => {
  const userId = req.user!.id;
  const date = req.params.date; // YYYY-MM-DD

  const row = getDb()
    .prepare('SELECT content, updated_at FROM daily_notes WHERE user_id = ? AND date = ?')
    .get(userId, date) as { content: string; updated_at: string } | undefined;

  res.json({
    date,
    content: row?.content ?? '',
    updatedAt: row?.updated_at ?? null,
  });
});

// Save/update daily note for a specific date
dailyNotesRouter.put('/:date', (req, res) => {
  const userId = req.user!.id;
  const date = req.params.date;
  const { content } = req.body as { content: string };

  getDb().prepare(`
    INSERT INTO daily_notes (user_id, date, content) VALUES (?, ?, ?)
    ON CONFLICT(user_id, date) DO UPDATE SET content = excluded.content, updated_at = datetime('now')
  `).run(userId, date, content ?? '');

  res.json({ ok: true });
});
