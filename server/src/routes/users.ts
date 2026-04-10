import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { getDb } from '../db.js';
import { authenticate, requireAdmin } from '../middleware/auth.js';

export const usersRouter = Router();

usersRouter.use(authenticate, requireAdmin);

usersRouter.get('/', (_req, res) => {
  const rows = getDb()
    .prepare('SELECT id, username, display_name, role, created_at FROM users ORDER BY id')
    .all() as { id: number; username: string; display_name: string; role: string; created_at: string }[];

  res.json(rows.map((r) => ({
    id: r.id,
    username: r.username,
    displayName: r.display_name,
    role: r.role,
    createdAt: r.created_at,
  })));
});

usersRouter.post('/', (req, res) => {
  const { username, password, displayName, role } = req.body;
  if (!username || !password || !displayName) {
    res.status(400).json({ error: 'username, password, and displayName required' });
    return;
  }

  const hash = bcrypt.hashSync(password, 10);
  try {
    const result = getDb()
      .prepare('INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)')
      .run(username, hash, displayName, role || 'user');

    res.status(201).json({
      id: result.lastInsertRowid,
      username,
      displayName,
      role: role || 'user',
    });
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('UNIQUE')) {
      res.status(409).json({ error: 'Username already exists' });
    } else {
      throw err;
    }
  }
});

usersRouter.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (id === req.user!.id) {
    res.status(400).json({ error: 'Cannot delete yourself' });
    return;
  }

  const result = getDb().prepare('DELETE FROM users WHERE id = ?').run(id);
  if (result.changes === 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ ok: true });
});

usersRouter.put('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { displayName, role, password } = req.body;

  const existing = getDb().prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!existing) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  if (displayName !== undefined || role !== undefined) {
    const updates: string[] = [];
    const values: unknown[] = [];

    if (displayName !== undefined) {
      updates.push('display_name = ?');
      values.push(displayName);
    }
    if (role !== undefined) {
      updates.push('role = ?');
      values.push(role);
    }

    values.push(id);
    getDb().prepare(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`).run(...values);
  }

  if (password) {
    const hash = bcrypt.hashSync(password, 10);
    getDb().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, id);
  }

  res.json({ ok: true });
});
