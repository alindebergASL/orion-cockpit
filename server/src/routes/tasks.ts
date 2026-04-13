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

  // Insert locally first
  const now = new Date().toISOString();
  const result = getDb()
    .prepare('INSERT INTO tasks (user_id, title, status, priority, due_date, description, list_name, synced_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(userId, title, 'open', priority || null, dueDate || null, description || null, list || null, now);

  res.status(201).json({
    id: result.lastInsertRowid,
    title,
    status: 'open',
    priority: priority || null,
    dueDate: dueDate || null,
    description: description || null,
    listName: list || null,
  });

  // Create via direct API in the background
  openclawClient.createTask({
    title,
    list: list || undefined,
    priority: priority || undefined,
    dueDate: dueDate || undefined,
  }).then(() => syncTasks(userId)).catch((err) =>
    console.error('Background task sync failed:', err.message),
  );
});

tasksRouter.put('/:id/status', async (req, res) => {
  const userId = req.user!.id;
  const taskId = parseInt(req.params.id, 10);
  const { status } = req.body as { status: string };

  if (!['open', 'in_progress', 'completed'].includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }

  // Get the task details for OpenClaw
  const task = getDb()
    .prepare('SELECT title, external_id FROM tasks WHERE id = ? AND (user_id = ? OR user_id IS NULL)')
    .get(taskId, userId) as { title: string; external_id: string | null } | undefined;

  if (!task) {
    res.status(404).json({ error: 'Task not found' });
    return;
  }

  // Update locally
  getDb()
    .prepare('UPDATE tasks SET status = ? WHERE id = ?')
    .run(status, taskId);

  // Sync to OpenClaw (wait for it so the next auto-sync won't revert)
  if (task.external_id) {
    try {
      await openclawClient.updateTaskStatus(
        task.external_id,
        status as 'completed' | 'open',
      );
    } catch (err) {
      console.error(`Failed to sync task status to OpenClaw for task ${taskId}:`, (err as Error).message);
      // Local update still succeeded — don't fail the request
    }
  }

  res.json({ ok: true });
});
