import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    res.status(400).json({ error: 'Username and password required' });
    return;
  }

  const row = getDb()
    .prepare('SELECT id, username, password_hash, display_name, role FROM users WHERE username = ?')
    .get(username) as { id: number; username: string; password_hash: string; display_name: string; role: string } | undefined;

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    res.status(401).json({ error: 'Invalid username or password' });
    return;
  }

  const token = jwt.sign({ userId: row.id }, config.jwtSecret, { expiresIn: '24h' });
  res.json({
    token,
    user: {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
    },
  });
});

authRouter.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});
