import { Router } from 'express';
import { getDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';

export const insightsRouter = Router();

insightsRouter.use(authenticate);

// Get unread + recent insights for current user
insightsRouter.get('/', (req, res) => {
  const userId = req.user!.id;
  const rows = getDb()
    .prepare(`
      SELECT id, type, title, body, action_type, action_data, priority, read, acted_on, created_at, expires_at
      FROM insights
      WHERE user_id = ? AND (expires_at IS NULL OR expires_at > datetime('now'))
      ORDER BY created_at DESC
      LIMIT 20
    `)
    .all(userId) as Record<string, unknown>[];

  const unreadCount = getDb()
    .prepare("SELECT COUNT(*) as count FROM insights WHERE user_id = ? AND read = 0 AND (expires_at IS NULL OR expires_at > datetime('now'))")
    .get(userId) as { count: number };

  res.json({
    insights: rows.map((r) => ({
      id: r.id,
      type: r.type,
      title: r.title,
      body: r.body,
      actionType: r.action_type,
      actionData: r.action_data ? JSON.parse(r.action_data as string) : null,
      priority: r.priority,
      read: !!r.read,
      actedOn: !!r.acted_on,
      createdAt: r.created_at,
      expiresAt: r.expires_at,
    })),
    unreadCount: unreadCount.count,
  });
});

// Mark insight as read
insightsRouter.post('/:id/read', (req, res) => {
  const userId = req.user!.id;
  getDb()
    .prepare('UPDATE insights SET read = 1 WHERE id = ? AND user_id = ?')
    .run(req.params.id, userId);
  res.json({ ok: true });
});

// Mark all as read
insightsRouter.post('/read-all', (req, res) => {
  const userId = req.user!.id;
  getDb()
    .prepare('UPDATE insights SET read = 1 WHERE user_id = ? AND read = 0')
    .run(userId);
  res.json({ ok: true });
});

// Mark insight as acted on
insightsRouter.post('/:id/act', (req, res) => {
  const userId = req.user!.id;
  getDb()
    .prepare('UPDATE insights SET acted_on = 1, read = 1 WHERE id = ? AND user_id = ?')
    .run(req.params.id, userId);
  res.json({ ok: true });
});

// Dismiss an insight
insightsRouter.delete('/:id', (req, res) => {
  const userId = req.user!.id;
  getDb()
    .prepare('DELETE FROM insights WHERE id = ? AND user_id = ?')
    .run(req.params.id, userId);
  res.json({ ok: true });
});
