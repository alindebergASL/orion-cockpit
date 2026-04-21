import { Router } from 'express';
import { getDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { streamAiText } from '../services/ai-stream.js';

export const weeklyNotesRouter = Router();

weeklyNotesRouter.use(authenticate);

// Get weekly note for a specific week (YYYY-Www format, e.g. 2026-W16)
weeklyNotesRouter.get('/:week', (req, res) => {
  const userId = req.user!.id;
  const week = req.params.week;

  const row = getDb()
    .prepare('SELECT content, updated_at FROM weekly_notes WHERE user_id = ? AND week = ?')
    .get(userId, week) as { content: string; updated_at: string } | undefined;

  res.json({
    week,
    content: row?.content ?? '',
    updatedAt: row?.updated_at ?? null,
  });
});

// Save/update weekly note
weeklyNotesRouter.put('/:week', (req, res) => {
  const userId = req.user!.id;
  const week = req.params.week;
  const { content } = req.body as { content: string };

  getDb().prepare(`
    INSERT INTO weekly_notes (user_id, week, content) VALUES (?, ?, ?)
    ON CONFLICT(user_id, week) DO UPDATE SET content = excluded.content, updated_at = datetime('now')
  `).run(userId, week, content ?? '');

  res.json({ ok: true });
});

// AI summary: recap the week from events, completed tasks, and the existing note
weeklyNotesRouter.post('/:week/ai-summary', async (req, res) => {
  const userId = req.user!.id;
  const week = req.params.week;

  const noteRow = getDb()
    .prepare('SELECT content FROM weekly_notes WHERE user_id = ? AND week = ?')
    .get(userId, week) as { content: string } | undefined;

  const { events = [], completedTasks = [] } = req.body as {
    events?: { title: string; day: string }[];
    completedTasks?: string[];
  };

  const eventsCtx = events.length > 0
    ? events.map((e) => `  - ${e.day}: ${e.title}`).join('\n')
    : '  (no events)';

  const tasksCtx = completedTasks.length > 0
    ? completedTasks.map((t) => `  - ${t}`).join('\n')
    : '  (none completed)';

  const noteCtx = noteRow?.content?.trim()
    ? `\nExisting weekly note:\n${noteRow.content}`
    : '';

  const userPrompt = `Summarize this week in 3-5 sentences. Cover what happened, what got done, and any themes. Be reflective and encouraging.

Events this week:
${eventsCtx}

Completed tasks:
${tasksCtx}${noteCtx}

Respond with only the summary — no preamble, no JSON, no code fences.`;

  await streamAiText(
    res,
    'You are a thoughtful weekly reflection writer. Respond with only the summary text.',
    userPrompt,
  );
});
