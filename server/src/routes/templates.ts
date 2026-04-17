import { Router } from 'express';
import { getDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';

export const templatesRouter = Router();

templatesRouter.use(authenticate);

// List all templates
templatesRouter.get('/', (req, res) => {
  const rows = getDb()
    .prepare('SELECT id, name, type, content, created_at, updated_at FROM templates WHERE user_id = ? ORDER BY name ASC')
    .all(req.user!.id) as Record<string, unknown>[];

  res.json(rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    content: r.content,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  })));
});

// Create template
templatesRouter.post('/', (req, res) => {
  const { name, type, content } = req.body;
  const result = getDb()
    .prepare('INSERT INTO templates (user_id, name, type, content) VALUES (?, ?, ?, ?)')
    .run(req.user!.id, name || 'Untitled Template', type || 'daily', content || '');

  res.status(201).json({
    id: result.lastInsertRowid,
    name: name || 'Untitled Template',
    type: type || 'daily',
    content: content || '',
  });
});

// Update template
templatesRouter.put('/:id', (req, res) => {
  const { name, type, content } = req.body;
  const updates: string[] = [];
  const values: unknown[] = [];
  if (name !== undefined) { updates.push('name = ?'); values.push(name); }
  if (type !== undefined) { updates.push('type = ?'); values.push(type); }
  if (content !== undefined) { updates.push('content = ?'); values.push(content); }
  if (updates.length === 0) { res.json({ ok: true }); return; }
  updates.push("updated_at = datetime('now')");
  values.push(req.params.id, req.user!.id);

  const result = getDb()
    .prepare(`UPDATE templates SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`)
    .run(...values);
  if (result.changes === 0) { res.status(404).json({ error: 'Template not found' }); return; }
  res.json({ ok: true });
});

// Delete template
templatesRouter.delete('/:id', (req, res) => {
  const result = getDb()
    .prepare('DELETE FROM templates WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user!.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Template not found' }); return; }
  res.json({ ok: true });
});
