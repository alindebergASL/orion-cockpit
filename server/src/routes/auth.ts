import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';

export const authRouter = Router();

// Simple rate limiter: max 10 attempts per IP per 15 min window
const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 10;

function checkRateLimit(req: Request, res: Response): boolean {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (entry && now < entry.resetAt) {
    if (entry.count >= RATE_LIMIT_MAX) {
      res.status(429).json({ error: 'Too many login attempts. Try again later.' });
      return false;
    }
    entry.count++;
  } else {
    loginAttempts.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW });
  }
  return true;
}

authRouter.post('/login', (req, res) => {
  if (!checkRateLimit(req, res)) return;
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
