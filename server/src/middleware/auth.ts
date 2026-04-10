import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { getDb } from '../db.js';

export interface AuthUser {
  id: number;
  username: string;
  displayName: string;
  role: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing or invalid authorization header' });
    return;
  }

  const token = header.slice(7);
  try {
    const payload = jwt.verify(token, config.jwtSecret) as { userId: number };
    const row = getDb()
      .prepare('SELECT id, username, display_name, role FROM users WHERE id = ?')
      .get(payload.userId) as { id: number; username: string; display_name: string; role: string } | undefined;

    if (!row) {
      res.status(401).json({ error: 'User not found' });
      return;
    }

    req.user = {
      id: row.id,
      username: row.username,
      displayName: row.display_name,
      role: row.role,
    };
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' });
    return;
  }
  next();
}
