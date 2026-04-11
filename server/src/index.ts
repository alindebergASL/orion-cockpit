import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from './config.js';
import { initDb, getDb } from './db.js';
import { syncCalendar, syncTasks, syncSoulMd } from './services/sync.js';
import { authRouter } from './routes/auth.js';
import { usersRouter } from './routes/users.js';
import { chatRouter } from './routes/chat.js';
import { calendarRouter } from './routes/calendar.js';
import { tasksRouter } from './routes/tasks.js';
import { notesRouter } from './routes/notes.js';
import { conversationsRouter } from './routes/conversations.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = express();

app.use(cors());
app.use(express.json());

// API routes
app.use('/api/auth', authRouter);
app.use('/api/users', usersRouter);
app.use('/api/chat', chatRouter);
app.use('/api/conversations', conversationsRouter);
app.use('/api/calendar', calendarRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/notes', notesRouter);

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Serve frontend in production
const distPath = path.resolve(__dirname, '../../dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Initialize DB and start
initDb();

// Auto-sync calendar and tasks for all users every 15 minutes
const SYNC_INTERVAL = 15 * 60 * 1000;
const SOUL_SYNC_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

function autoSync() {
  try {
    const users = getDb()
      .prepare('SELECT id, display_name FROM users')
      .all() as { id: number; display_name: string }[];

    for (const user of users) {
      syncCalendar(user.id).catch((err) =>
        console.error(`Auto-sync calendar failed for user ${user.id}:`, err.message),
      );
      syncTasks(user.id).catch((err) =>
        console.error(`Auto-sync tasks failed for user ${user.id}:`, err.message),
      );
    }
    console.log(`Auto-sync triggered for ${users.length} user(s)`);
  } catch (err) {
    console.error('Auto-sync error:', err);
  }
}

app.listen(config.port, () => {
  console.log(`Orion Cockpit server listening on port ${config.port}`);
  // Initial sync after 30s, then every 15 minutes
  setTimeout(autoSync, 30_000);
  setInterval(autoSync, SYNC_INTERVAL);

  // Sync soul.md on startup (after 30s), then every 24 hours
  setTimeout(() => {
    syncSoulMd().catch((err) => console.error('Soul.md sync failed:', err.message));
  }, 30_000);
  setInterval(() => {
    syncSoulMd().catch((err) => console.error('Soul.md sync failed:', err.message));
  }, SOUL_SYNC_INTERVAL);
});
