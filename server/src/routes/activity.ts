import { Router } from 'express';
import { getDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';

export const activityRouter = Router();

activityRouter.use(authenticate);

// Log a user activity
activityRouter.post('/', (req, res) => {
  const userId = req.user!.id;
  const { action, details } = req.body as { action: string; details?: Record<string, unknown> };

  if (!action) {
    res.status(400).json({ error: 'action is required' });
    return;
  }

  getDb()
    .prepare('INSERT INTO activity_log (user_id, action, details) VALUES (?, ?, ?)')
    .run(userId, action, details ? JSON.stringify(details) : null);

  res.json({ ok: true });
});

// Get recent activity (for admin/debugging)
activityRouter.get('/', (req, res) => {
  const userId = req.user!.id;
  const limit = parseInt((req.query.limit as string) || '50', 10);

  const rows = getDb()
    .prepare('SELECT id, action, details, created_at FROM activity_log WHERE user_id = ? ORDER BY id DESC LIMIT ?')
    .all(userId, limit) as { id: number; action: string; details: string | null; created_at: string }[];

  res.json(rows.map((r) => ({
    id: r.id,
    action: r.action,
    details: r.details ? JSON.parse(r.details) : null,
    createdAt: r.created_at,
  })));
});
