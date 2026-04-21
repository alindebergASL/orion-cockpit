import { Router } from 'express';
import { getDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { syncTasks } from '../services/sync.js';
import { openclawClient } from '../services/openclaw.js';

export const tasksRouter = Router();

tasksRouter.use(authenticate);

tasksRouter.get('/', (req, res) => {
  const userId = req.user!.id;
  const rows = getDb()
    .prepare(`
      SELECT id, external_id, user_id, title, status, priority,
             due_date, description, list_name, synced_at
      FROM tasks
      WHERE user_id = ? OR user_id IS NULL
      ORDER BY due_date ASC NULLS LAST
    `)
    .all(userId) as Record<string, unknown>[];

  const syncRow = getDb()
    .prepare('SELECT last_synced_at FROM sync_log WHERE user_id = ? AND data_type = ? ORDER BY id DESC LIMIT 1')
    .get(userId, 'tasks') as { last_synced_at: string } | undefined;

  res.json({
    tasks: rows.map((r) => ({
      id: r.id,
      externalId: r.external_id,
      title: r.title,
      status: r.status,
      priority: r.priority,
      dueDate: r.due_date,
      description: r.description,
      listName: r.list_name,
    })),
    syncedAt: syncRow?.last_synced_at ?? null,
  });
});

tasksRouter.post('/sync', async (req, res) => {
  try {
    const tasks = await syncTasks(req.user!.id);
    res.json({ tasks, syncedAt: new Date().toISOString() });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Sync failed';
    res.status(502).json({ error: message });
  }
});

tasksRouter.post('/', async (req, res) => {
  const userId = req.user!.id;
  const { title, list, priority, dueDate, description } = req.body;

  if (!title) {
    res.status(400).json({ error: 'title is required' });
    return;
  }

  try {
    // Create on OpenClaw first so auto-sync won't orphan it
    const created = await openclawClient.createTask({
      title,
      list: list || undefined,
      priority: priority || undefined,
      dueDate: dueDate || undefined,
    });

    const now = new Date().toISOString();
    const result = getDb()
      .prepare('INSERT INTO tasks (external_id, user_id, title, status, priority, due_date, description, list_name, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(created.id || null, userId, title, 'open', priority || null, dueDate || null, description || null, list || null, now);

    res.status(201).json({
      id: result.lastInsertRowid,
      title,
      status: 'open',
      priority: priority || null,
      dueDate: dueDate || null,
      description: description || null,
      listName: list || null,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to create task';
    res.status(502).json({ error: message });
  }
});

// Update task fields (local-only; sync will overwrite from OpenClaw)
tasksRouter.put('/:id', (req, res) => {
  const userId = req.user!.id;
  const { title, description, priority, dueDate } = req.body;

  const task = getDb()
    .prepare('SELECT id, external_id FROM tasks WHERE (id = ? OR external_id = ?) AND (user_id = ? OR user_id IS NULL)')
    .get(parseInt(req.params.id, 10), String(req.params.id), userId) as { id: number; external_id: string | null } | undefined;

  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

  const updates: string[] = [];
  const values: unknown[] = [];
  if (title !== undefined) { updates.push('title = ?'); values.push(title); }
  if (description !== undefined) { updates.push('description = ?'); values.push(description || null); }
  if (priority !== undefined) { updates.push('priority = ?'); values.push(priority || null); }
  if (dueDate !== undefined) { updates.push('due_date = ?'); values.push(dueDate || null); }

  if (updates.length === 0) { res.json({ ok: true }); return; }
  values.push(task.id);

  getDb().prepare(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`).run(...values);

  const updated = getDb().prepare('SELECT id, external_id, title, status, priority, due_date, description, list_name FROM tasks WHERE id = ?').get(task.id) as Record<string, unknown>;
  res.json({
    id: updated.id,
    externalId: updated.external_id,
    title: updated.title,
    status: updated.status,
    priority: updated.priority,
    dueDate: updated.due_date,
    description: updated.description,
    listName: updated.list_name,
  });
});

tasksRouter.put('/:id/status', async (req, res) => {
  const userId = req.user!.id;
  const taskId = parseInt(req.params.id, 10);
  const { status } = req.body as { status: string };

  if (!['open', 'in_progress', 'completed'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  // Look up by SQLite id OR external_id (frontend may send either)
  const task = getDb()
    .prepare('SELECT id, title, external_id FROM tasks WHERE (id = ? OR external_id = ?) AND (user_id = ? OR user_id IS NULL)')
    .get(taskId, String(req.params.id), userId) as { id: number; title: string; external_id: string | null } | undefined;

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  // Update locally (use the resolved row id, not the request param)
  getDb()
    .prepare('UPDATE tasks SET status = ? WHERE id = ?')
    .run(status, task.id);

  // Sync to OpenClaw (wait for it so the next auto-sync won't revert)
  // OpenClaw only supports 'completed' and 'open'; map 'in_progress' to 'open'
  if (task.external_id) {
    const openclawStatus = status === 'completed' ? 'completed' : 'open';
    try {
      await openclawClient.updateTaskStatus(
        task.external_id,
        openclawStatus,
      );
    } catch (err) {
      console.error(`Failed to sync task status to OpenClaw for task ${taskId}:`, (err as Error).message);
      // Local update still succeeded — don't fail the request
    }
  }

  res.json({ ok: true });
});

// ── AI-powered endpoints ─────────────────────────────────

tasksRouter.post('/ai-prioritize', async (req, res) => {
  const userId = req.user!.id;
  const rows = getDb()
    .prepare("SELECT id, title, priority, due_date, list_name FROM tasks WHERE (user_id = ? OR user_id IS NULL) AND status != 'completed'")
    .all(userId) as { id: number; title: string; priority: string | null; due_date: string | null; list_name: string | null }[];

  if (rows.length === 0) { res.json({ prioritized: [] }); return; }

  const taskList = rows.map((t, i) => `  ${i + 1}. [id=${t.id}] ${t.title} (priority: ${t.priority || 'none'}, due: ${t.due_date || 'none'}, list: ${t.list_name || 'none'})`).join('\n');

  const prompt = `You are a family task prioritizer for a personal dashboard. Given these open tasks, suggest priority for each one.
Consider due dates (overdue items are urgent), current priorities, and task context.

Tasks:
${taskList}

Return ONLY valid JSON (no markdown, no code fences):
{
  "prioritized": [
    { "id": <number>, "title": "...", "suggestedPriority": "high" or "medium" or "low", "reasoning": "brief 5-10 word reason" }
  ]
}
Order from most urgent/important to least.`;

  try {
    const raw = await openclawClient.chatOnce([
      { role: 'system', content: 'You are a concise task prioritizer. Return only valid JSON.' },
      { role: 'user', content: prompt },
    ]);
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const result = JSON.parse(cleaned);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to prioritize tasks', detail: String(err) });
  }
});

tasksRouter.post('/ai-suggest', async (req, res) => {
  const userId = req.user!.id;
  const rows = getDb()
    .prepare("SELECT id, title, priority, due_date, description, list_name FROM tasks WHERE (user_id = ? OR user_id IS NULL) AND status != 'completed'")
    .all(userId) as { id: number; title: string; priority: string | null; due_date: string | null; description: string | null; list_name: string | null }[];

  if (rows.length === 0) { res.json({ taskId: null, title: null, reasoning: 'No open tasks.' }); return; }

  const taskList = rows.map((t, i) => `  ${i + 1}. [id=${t.id}] ${t.title} (priority: ${t.priority || 'none'}, due: ${t.due_date || 'none'}, list: ${t.list_name || 'none'}${t.description ? ', desc: ' + t.description.slice(0, 60) : ''})`).join('\n');

  const prompt = `You are a helpful family assistant. Look at these open tasks and recommend the single most impactful one to do next.
Consider urgency (due dates, overdue), importance (priority level), and practical momentum.

Tasks:
${taskList}

Return ONLY valid JSON (no markdown, no code fences):
{
  "taskId": <number>,
  "title": "the task title",
  "reasoning": "2-3 sentence explanation of why this task is the best next step"
}`;

  try {
    const raw = await openclawClient.chatOnce([
      { role: 'system', content: 'You are a concise task advisor. Return only valid JSON.' },
      { role: 'user', content: prompt },
    ]);
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const result = JSON.parse(cleaned);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Failed to suggest next task', detail: String(err) });
  }
});
