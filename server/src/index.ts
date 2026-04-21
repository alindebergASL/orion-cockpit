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
import { settingsRouter } from './routes/settings.js';
import { insightsRouter } from './routes/insights.js';
import { activityRouter } from './routes/activity.js';
import { dailyNotesRouter } from './routes/daily-notes.js';
import { searchRouter } from './routes/search.js';
import { projectsRouter } from './routes/projects.js';
import { templatesRouter } from './routes/templates.js';
import { weeklyNotesRouter } from './routes/weekly-notes.js';
import { briefingRouter } from './routes/briefing.js';
import { runAgentLoop, pushActivityDigest } from './services/agent.js';
import { addClient } from './services/sse.js';
import { authenticate } from './middleware/auth.js';

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
app.use('/api/settings', settingsRouter);
app.use('/api/insights', insightsRouter);
app.use('/api/activity', activityRouter);
app.use('/api/daily-notes', dailyNotesRouter);
app.use('/api/search', searchRouter);
app.use('/api/projects', projectsRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/weekly-notes', weeklyNotesRouter);
app.use('/api/briefing', briefingRouter);

// SSE notification stream
app.get('/api/notifications/stream', authenticate, (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  addClient(req.user!.id, res);

  // Heartbeat every 30s
  const heartbeat = setInterval(() => {
    res.write(':heartbeat\n\n');
  }, 30_000);

  res.on('close', () => clearInterval(heartbeat));
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Weather (cached for 30 minutes)
let weatherCache: { data: unknown; fetchedAt: number; location: string } | null = null;
const WEATHER_TTL = 30 * 60 * 1000;
const DEFAULT_WEATHER_LOCATION = 'Redwood+City,CA';

app.get('/api/weather', async (req, res) => {
  try {
    // Per-user location from settings (requires auth header, optional)
    let location = DEFAULT_WEATHER_LOCATION;
    const authHeader = req.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      try {
        const jwt = await import('jsonwebtoken');
        const payload = jwt.default.verify(authHeader.slice(7), config.jwtSecret) as { userId: number };
        const pref = getDb().prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'weather_location'")
          .get(payload.userId) as { value: string } | undefined;
        if (pref?.value) location = pref.value.replace(/ /g, '+');
      } catch { /* use default */ }
    }

    if (weatherCache && Date.now() - weatherCache.fetchedAt < WEATHER_TTL && weatherCache.location === location) {
      res.json(weatherCache.data);
      return;
    }

    const wttr = await fetch(`https://wttr.in/${location}?format=j1`);
    if (!wttr.ok) throw new Error('Weather fetch failed');
    const raw = await wttr.json() as Record<string, unknown>;

    const current = (raw.current_condition as Record<string, unknown>[])?.[0];
    const todayForecast = (raw.weather as Record<string, unknown>[])?.[0];
    const tomorrowForecast = (raw.weather as Record<string, unknown>[])?.[1];

    const data = {
      current: {
        tempF: (current as Record<string, unknown>)?.temp_F,
        tempC: (current as Record<string, unknown>)?.temp_C,
        description: ((current as Record<string, unknown>)?.weatherDesc as Record<string, unknown>[])?.[0]?.value,
        humidity: (current as Record<string, unknown>)?.humidity,
        feelsLikeF: (current as Record<string, unknown>)?.FeelsLikeF,
      },
      today: {
        maxTempF: (todayForecast as Record<string, unknown>)?.maxtempF,
        minTempF: (todayForecast as Record<string, unknown>)?.mintempF,
        description: ((todayForecast as Record<string, unknown>)?.hourly as Record<string, unknown>[])?.[4]?.weatherDesc
          ? (((todayForecast as Record<string, unknown>)?.hourly as Record<string, unknown>[])?.[4]?.weatherDesc as Record<string, unknown>[])?.[0]?.value
          : undefined,
      },
      tomorrow: {
        maxTempF: (tomorrowForecast as Record<string, unknown>)?.maxtempF,
        minTempF: (tomorrowForecast as Record<string, unknown>)?.mintempF,
        description: ((tomorrowForecast as Record<string, unknown>)?.hourly as Record<string, unknown>[])?.[4]?.weatherDesc
          ? (((tomorrowForecast as Record<string, unknown>)?.hourly as Record<string, unknown>[])?.[4]?.weatherDesc as Record<string, unknown>[])?.[0]?.value
          : undefined,
      },
      location: location.replace(/\+/g, ' '),
    };

    weatherCache = { data, fetchedAt: Date.now(), location };
    res.json(data);
  } catch {
    res.status(502).json({ error: 'Weather unavailable' });
  }
});

// Serve frontend in production
const distPath = path.resolve(__dirname, '../../dist');
app.use(express.static(distPath));
app.get('*', (_req, res) => {
  res.sendFile(path.join(distPath, 'index.html'));
});

// Initialize DB and start
initDb();

// Scheduling intervals
const SYNC_INTERVAL = 15 * 60 * 1000;        // 15 min: calendar/tasks sync
const SOUL_SYNC_INTERVAL = 24 * 60 * 60 * 1000; // 24h: soul.md sync
const AGENT_INTERVAL = 30 * 60 * 1000;       // 30 min: background agent insights
const DIGEST_INTERVAL = 24 * 60 * 60 * 1000; // 24h: activity digest push to OpenClaw

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

  // Background agent: generate insights every 30 min (first run after 2 min)
  setTimeout(() => {
    runAgentLoop().catch((err) => console.error('Agent loop failed:', err.message));
  }, 2 * 60 * 1000);
  setInterval(() => {
    runAgentLoop().catch((err) => console.error('Agent loop failed:', err.message));
  }, AGENT_INTERVAL);

  // Push activity digest to OpenClaw daily (first run after 1 hour)
  setTimeout(() => {
    pushActivityDigest().catch((err) => console.error('Activity digest failed:', err.message));
  }, 60 * 60 * 1000);
  setInterval(() => {
    pushActivityDigest().catch((err) => console.error('Activity digest failed:', err.message));
  }, DIGEST_INTERVAL);
});
