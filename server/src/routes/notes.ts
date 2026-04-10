import { Router } from 'express';
import { getDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';

export const notesRouter = Router();

notesRouter.use(authenticate);

notesRouter.get('/', (req, res) => {
  const rows = getDb()
    .prepare('SELECT id, title, content, updated_at FROM notes WHERE user_id = ? ORDER BY updated_at DESC')
    .all(req.user!.id) as { id: number; title: string; content: string; updated_at: string }[];

  res.json(rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    updatedAt: r.updated_at,
  })));
});

notesRouter.post('/', (req, res) => {
  const { title, content } = req.body;
  const result = getDb()
    .prepare('INSERT INTO notes (user_id, title, content) VALUES (?, ?, ?)')
    .run(req.user!.id, title || '', content || '');

  res.status(201).json({
    id: result.lastInsertRowid,
    title: title || '',
    content: content || '',
    updatedAt: new Date().toISOString(),
  });
});

notesRouter.put('/:id', (req, res) => {
  const { title, content } = req.body;
  const result = getDb()
    .prepare("UPDATE notes SET title = ?, content = ?, updated_at = datetime('now') WHERE id = ? AND user_id = ?")
    .run(title ?? '', content ?? '', req.params.id, req.user!.id);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Note not found' });
    return;
  }
  res.json({ ok: true });
});

notesRouter.delete('/:id', (req, res) => {
  const result = getDb()
    .prepare('DELETE FROM notes WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user!.id);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Note not found' });
    return;
  }
  res.json({ ok: true });
});
