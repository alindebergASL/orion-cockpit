import { Router } from 'express';
import { getDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { openclawClient } from '../services/openclaw.js';

export const projectsRouter = Router();

projectsRouter.use(authenticate);

// List all projects for user
projectsRouter.get('/', (req, res) => {
  const userId = req.user!.id;
  const rows = getDb()
    .prepare('SELECT id, title, description, status, target_date, tags, icon, color, created_at, updated_at FROM projects WHERE user_id = ? ORDER BY updated_at DESC')
    .all(userId) as Record<string, unknown>[];

  const projects = rows.map((r) => {
    // Count tasks per project
    const taskCounts = getDb()
      .prepare("SELECT status, COUNT(*) as count FROM project_tasks WHERE project_id = ? GROUP BY status")
      .all(r.id) as { status: string; count: number }[];

    const total = taskCounts.reduce((sum, tc) => sum + tc.count, 0);
    const completed = taskCounts.find((tc) => tc.status === 'completed')?.count || 0;

    return {
      id: r.id,
      title: r.title,
      description: r.description,
      status: r.status,
      targetDate: r.target_date,
      tags: r.tags ? (r.tags as string).split(',').map((t: string) => t.trim()).filter(Boolean) : [],
      icon: r.icon || null,
      color: r.color || 'slate',
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      taskCount: total,
      completedTaskCount: completed,
    };
  });

  res.json(projects);
});

// Get single project with tasks and updates
projectsRouter.get('/:id', (req, res) => {
  const userId = req.user!.id;
  const project = getDb()
    .prepare('SELECT id, title, description, status, target_date, tags, icon, color, created_at, updated_at FROM projects WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId) as Record<string, unknown> | undefined;

  if (!project) {
    res.status(404).json({ error: 'Project not found' });
    return;
  }

  const tasks = getDb()
    .prepare('SELECT id, title, status, assignee, sort_order, created_at FROM project_tasks WHERE project_id = ? ORDER BY sort_order ASC, id ASC')
    .all(project.id) as Record<string, unknown>[];

  const updates = getDb()
    .prepare('SELECT id, content, created_at FROM project_updates WHERE project_id = ? ORDER BY created_at DESC LIMIT 20')
    .all(project.id) as Record<string, unknown>[];

  res.json({
    id: project.id,
    title: project.title,
    description: project.description,
    status: project.status,
    targetDate: project.target_date,
    tags: project.tags ? (project.tags as string).split(',').map((t: string) => t.trim()).filter(Boolean) : [],
    icon: project.icon || null,
    color: project.color || 'slate',
    createdAt: project.created_at,
    updatedAt: project.updated_at,
    tasks: tasks.map((t) => ({
      id: t.id,
      title: t.title,
      status: t.status,
      assignee: t.assignee,
      sortOrder: t.sort_order,
      createdAt: t.created_at,
    })),
    updates: updates.map((u) => ({
      id: u.id,
      content: u.content,
      createdAt: u.created_at,
    })),
  });
});

// Create project
projectsRouter.post('/', (req, res) => {
  const userId = req.user!.id;
  const { title, description, targetDate, tags, icon, color } = req.body;

  const result = getDb()
    .prepare('INSERT INTO projects (user_id, title, description, target_date, tags, icon, color) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(userId, title || 'New Project', description || '', targetDate || null, Array.isArray(tags) ? tags.join(',') : tags || null, icon || null, color || 'slate');

  res.status(201).json({
    id: result.lastInsertRowid,
    title: title || 'New Project',
    description: description || '',
    status: 'active',
    targetDate: targetDate || null,
    tags: tags || [],
    icon: icon || null,
    color: color || 'slate',
    taskCount: 0,
    completedTaskCount: 0,
  });
});

// Update project
projectsRouter.put('/:id', (req, res) => {
  const userId = req.user!.id;
  const { title, description, status, targetDate, tags, icon, color } = req.body;

  const updates: string[] = [];
  const values: unknown[] = [];

  if (title !== undefined) { updates.push('title = ?'); values.push(title); }
  if (description !== undefined) { updates.push('description = ?'); values.push(description); }
  if (status !== undefined) { updates.push('status = ?'); values.push(status); }
  if (targetDate !== undefined) { updates.push('target_date = ?'); values.push(targetDate || null); }
  if (tags !== undefined) { updates.push('tags = ?'); values.push(Array.isArray(tags) ? tags.join(',') : tags); }
  if (icon !== undefined) { updates.push('icon = ?'); values.push(icon); }
  if (color !== undefined) { updates.push('color = ?'); values.push(color); }
  if (updates.length === 0) { res.json({ ok: true }); return; }

  updates.push("updated_at = datetime('now')");
  values.push(req.params.id, userId);

  const result = getDb()
    .prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`)
    .run(...values);

  if (result.changes === 0) { res.status(404).json({ error: 'Project not found' }); return; }
  res.json({ ok: true });
});

// Delete project
projectsRouter.delete('/:id', (req, res) => {
  const result = getDb()
    .prepare('DELETE FROM projects WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user!.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Project not found' }); return; }
  res.json({ ok: true });
});

// ── Project Tasks ────────────────────────────────────────

// Add task to project
projectsRouter.post('/:id/tasks', (req, res) => {
  const { title, assignee } = req.body;
  if (!title) { res.status(400).json({ error: 'title required' }); return; }

  // Verify project ownership
  const project = getDb().prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const maxOrder = getDb().prepare('SELECT MAX(sort_order) as mx FROM project_tasks WHERE project_id = ?').get(req.params.id) as { mx: number | null };
  const sortOrder = (maxOrder.mx ?? -1) + 1;

  const result = getDb()
    .prepare('INSERT INTO project_tasks (project_id, title, assignee, sort_order) VALUES (?, ?, ?, ?)')
    .run(req.params.id, title, assignee || null, sortOrder);

  getDb().prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);

  res.status(201).json({
    id: result.lastInsertRowid,
    title,
    status: 'open',
    assignee: assignee || null,
    sortOrder,
  });
});

// Toggle project task status
projectsRouter.put('/:id/tasks/:taskId/status', (req, res) => {
  const { status } = req.body;
  if (!['open', 'completed'].includes(status)) { res.status(400).json({ error: 'Invalid status' }); return; }

  const result = getDb()
    .prepare('UPDATE project_tasks SET status = ? WHERE id = ? AND project_id = ?')
    .run(status, req.params.taskId, req.params.id);

  if (result.changes === 0) { res.status(404).json({ error: 'Task not found' }); return; }

  getDb().prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);
  res.json({ ok: true });
});

// Delete project task
projectsRouter.delete('/:id/tasks/:taskId', (req, res) => {
  const result = getDb()
    .prepare('DELETE FROM project_tasks WHERE id = ? AND project_id = ?')
    .run(req.params.taskId, req.params.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Task not found' }); return; }
  res.json({ ok: true });
});

// ── Project Updates (progress log) ──────────────────────

projectsRouter.post('/:id/updates', (req, res) => {
  const { content } = req.body;
  if (!content) { res.status(400).json({ error: 'content required' }); return; }

  const project = getDb().prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, req.user!.id);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const result = getDb()
    .prepare('INSERT INTO project_updates (project_id, content) VALUES (?, ?)')
    .run(req.params.id, content);

  getDb().prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);

  res.status(201).json({
    id: result.lastInsertRowid,
    content,
    createdAt: new Date().toISOString(),
  });
});

// ── AI-powered endpoints ─────────────────────────────────

// AI project digest: health analysis + next action
projectsRouter.post('/:id/ai-digest', async (req, res) => {
  const userId = req.user!.id;
  const project = getDb()
    .prepare('SELECT id, title, description, status, target_date, tags FROM projects WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId) as Record<string, unknown> | undefined;

  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const tasks = getDb()
    .prepare('SELECT title, status FROM project_tasks WHERE project_id = ? ORDER BY sort_order ASC')
    .all(project.id) as { title: string; status: string }[];

  const updates = getDb()
    .prepare('SELECT content, created_at FROM project_updates WHERE project_id = ? ORDER BY created_at DESC LIMIT 5')
    .all(project.id) as { content: string; created_at: string }[];

  const completed = tasks.filter((t) => t.status === 'completed').length;
  const taskList = tasks.map((t) => `  ${t.status === 'completed' ? '[x]' : '[ ]'} ${t.title}`).join('\n');
  const updateList = updates.map((u) => `  - ${u.created_at}: ${u.content}`).join('\n');

  const prompt = `You are analyzing a personal project for a family dashboard. Be concise and actionable.

Project: ${project.title}
Status: ${project.status}
Target date: ${project.target_date || 'none set'}
Description: ${project.description || 'none'}
Tags: ${project.tags || 'none'}
Tasks: ${completed}/${tasks.length} completed
${taskList || '  (no tasks)'}
Recent updates:
${updateList || '  (no updates yet)'}

Respond with ONLY valid JSON (no markdown, no code fences):
{
  "health": "on_track" or "at_risk" or "needs_attention",
  "summary": "1-2 sentence status narrative",
  "nextAction": "single most impactful next step",
  "blockers": []
}`;

  try {
    const raw = await openclawClient.chatOnce([
      { role: 'system', content: 'You are a concise project analyst. Return only valid JSON.' },
      { role: 'user', content: prompt },
    ]);

    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const digest = JSON.parse(cleaned);
    res.json(digest);
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate digest', detail: String(err) });
  }
});

// AI plan generation: generate tasks from project goal
projectsRouter.post('/:id/ai-plan', async (req, res) => {
  const userId = req.user!.id;
  const project = getDb()
    .prepare('SELECT id, title, description FROM projects WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId) as Record<string, unknown> | undefined;

  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const existingTasks = getDb()
    .prepare('SELECT title FROM project_tasks WHERE project_id = ?')
    .all(project.id) as { title: string }[];

  const existingList = existingTasks.length > 0
    ? `\nExisting tasks (don't duplicate):\n${existingTasks.map((t) => `  - ${t.title}`).join('\n')}`
    : '';

  const prompt = `Break down this personal project into actionable tasks.

Project: ${project.title}
Description: ${project.description || 'none'}
${existingList}

Generate 5-8 concrete, actionable tasks. Return ONLY valid JSON (no markdown, no code fences):
{
  "tasks": [
    { "title": "Task description" }
  ]
}

Make tasks specific and ordered logically. Keep language casual and practical for a family household.`;

  try {
    const raw = await openclawClient.chatOnce([
      { role: 'system', content: 'You are a helpful project planner. Return only valid JSON.' },
      { role: 'user', content: prompt },
    ]);

    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const plan = JSON.parse(cleaned);

    // Insert tasks into DB
    const maxOrder = getDb().prepare('SELECT MAX(sort_order) as mx FROM project_tasks WHERE project_id = ?').get(project.id) as { mx: number | null };
    let sortOrder = (maxOrder.mx ?? -1) + 1;

    const insertStmt = getDb().prepare('INSERT INTO project_tasks (project_id, title, sort_order) VALUES (?, ?, ?)');
    const createdTasks = [];

    for (const task of plan.tasks) {
      const result = insertStmt.run(project.id, task.title, sortOrder);
      createdTasks.push({
        id: result.lastInsertRowid,
        title: task.title,
        status: 'open',
        assignee: null,
        sortOrder,
      });
      sortOrder++;
    }

    getDb().prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(project.id);

    res.json({ tasks: createdTasks });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate plan', detail: String(err) });
  }
});
