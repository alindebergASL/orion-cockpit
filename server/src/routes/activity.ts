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

// Only user-facing actions count. No background syncs, no view tracking.
const ACTION_LABELS: Record<string, string> = {
  task_completed: 'completed %n task%s',
  task_created: 'created %n task%s',
  note_created: 'created %n note%s',
  project_created: 'set up %n project%s',
  project_plan_generated: 'generated %n project plan%s',
  project_update_posted: 'posted %n update%s',
  ai_tasks_prioritized: 'prioritized tasks',
  ai_task_suggested: 'suggested %n task%s',
};

activityRouter.get('/summary', (req, res) => {
  const userId = req.user!.id;
  const rows = getDb()
    .prepare(
      `SELECT action, COUNT(*) as count FROM activity_log
       WHERE user_id = ? AND created_at >= datetime('now', '-24 hours')
       GROUP BY action ORDER BY count DESC`,
    )
    .all(userId) as { action: string; count: number }[];

  const parts: string[] = [];
  for (const row of rows) {
    const tpl = ACTION_LABELS[row.action];
    if (!tpl) continue;
    const text = tpl
      .replace('%n', String(row.count))
      .replace('%s', row.count === 1 ? '' : 's');
    parts.push(text);
  }

  const total = parts.length;
  const summary = parts.slice(0, 3).join(' · ') || null;
  res.json({ summary, total });
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
