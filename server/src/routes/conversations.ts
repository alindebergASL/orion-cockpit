import { Router } from 'express';
import { getDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';

export const conversationsRouter = Router();

conversationsRouter.use(authenticate);

// List recent conversations (newest first, limit 5)
conversationsRouter.get('/', (req, res) => {
  const userId = req.user!.id;
  const tab = (req.query.tab as string) || 'chat';
  const limit = parseInt((req.query.limit as string) || '5', 10);

  const rows = getDb()
    .prepare('SELECT id, title, tab, created_at, updated_at FROM conversations WHERE user_id = ? AND tab = ? ORDER BY updated_at DESC LIMIT ?')
    .all(userId, tab, limit) as { id: number; title: string; tab: string; created_at: string; updated_at: string }[];

  res.json(rows.map((r) => ({
    id: r.id,
    title: r.title,
    tab: r.tab,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })));
});

// Create a new conversation
conversationsRouter.post('/', (req, res) => {
  const userId = req.user!.id;
  const { tab, title } = req.body as { tab?: string; title?: string };

  const result = getDb()
    .prepare('INSERT INTO conversations (user_id, tab, title) VALUES (?, ?, ?)')
    .run(userId, tab || 'chat', title || 'New Chat');

  res.status(201).json({
    id: result.lastInsertRowid,
    title: title || 'New Chat',
    tab: tab || 'chat',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
});

// Get messages for a conversation
conversationsRouter.get('/:id/messages', (req, res) => {
  const userId = req.user!.id;
  const conversationId = parseInt(req.params.id, 10);

  // Verify ownership
  const conv = getDb()
    .prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?')
    .get(conversationId, userId);
  if (!conv) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }

  const rows = getDb()
    .prepare('SELECT role, content, timestamp FROM chat_messages WHERE conversation_id = ? ORDER BY id ASC')
    .all(conversationId) as { role: string; content: string; timestamp: string }[];

  res.json(rows.map((r) => ({
    role: r.role,
    content: r.content,
    timestamp: r.timestamp,
  })));
});

// Delete a conversation
conversationsRouter.delete('/:id', (req, res) => {
  const userId = req.user!.id;
  const conversationId = parseInt(req.params.id, 10);

  const result = getDb()
    .prepare('DELETE FROM conversations WHERE id = ? AND user_id = ?')
    .run(conversationId, userId);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Conversation not found' });
    return;
  }
  res.json({ ok: true });
});
