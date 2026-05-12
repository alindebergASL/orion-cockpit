import { Router } from 'express';
import { getDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { openclawClient } from '../services/openclaw.js';
import { syncTasks } from '../services/sync.js';
import { streamAiText } from '../services/ai-stream.js';
import { config } from '../config.js';
import {
  slugify,
  projectFolderName,
  ensureProjectFolder,
  writeProjectMd,
  writeProjectTasksMd,
  writeProjectUpdatesMd,
  writeProjectNoteMd,
  archivePath,
  writeVaultIndex,
  type ProjectVaultData,
} from '../services/vault.js';

function vaultSyncProjectIndex(): void {
  try {
    const rows = getDb()
      .prepare("SELECT id, title, status, slug, vault_path FROM projects WHERE slug IS NOT NULL")
      .all() as { id: number; title: string; status: string; slug: string; vault_path: string }[];
    writeVaultIndex(config.vaultPath, rows.map((r) => ({
      id: r.id, title: r.title, status: r.status, slug: r.slug, vaultPath: r.vault_path,
    })));
  } catch (err) {
    console.error('Vault: failed to write index', err);
  }
}

function vaultSyncTasks(projectId: number | bigint, folderName: string): void {
  try {
    const tasks = getDb()
      .prepare('SELECT title, status, assignee FROM project_tasks WHERE project_id = ? ORDER BY sort_order ASC, id ASC')
      .all(projectId) as { title: string; status: string; assignee: string | null }[];
    writeProjectTasksMd(config.vaultPath, folderName, tasks);
  } catch (err) {
    console.error('Vault: failed to write tasks.md', err);
  }
}

function vaultSyncUpdates(projectId: number | bigint, folderName: string): void {
  try {
    const updates = getDb()
      .prepare('SELECT content, created_at FROM project_updates WHERE project_id = ? ORDER BY created_at DESC')
      .all(projectId) as { content: string; created_at: string }[];
    writeProjectUpdatesMd(config.vaultPath, folderName, updates.map((u) => ({
      content: u.content, createdAt: u.created_at,
    })));
  } catch (err) {
    console.error('Vault: failed to write updates.md', err);
  }
}

function getProjectVaultInfo(projectId: string | number | bigint): { slug: string; vault_path: string } | null {
  return getDb()
    .prepare('SELECT slug, vault_path FROM projects WHERE id = ? AND slug IS NOT NULL')
    .get(projectId) as { slug: string; vault_path: string } | null;
}

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
    .prepare('SELECT id, title, status, assignee, sort_order, created_at, external_id, promoted_at FROM project_tasks WHERE project_id = ? ORDER BY sort_order ASC, id ASC')
    .all(project.id) as Record<string, unknown>[];

  const updates = getDb()
    .prepare('SELECT id, content, created_at FROM project_updates WHERE project_id = ? ORDER BY created_at DESC LIMIT 20')
    .all(project.id) as Record<string, unknown>[];

  const notes = getDb()
    .prepare('SELECT id, title, content, created_at, updated_at FROM project_notes WHERE project_id = ? ORDER BY updated_at DESC')
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
    notes: notes.map((n) => ({
      id: n.id,
      title: n.title,
      content: n.content,
      createdAt: n.created_at,
      updatedAt: n.updated_at,
    })),
  });
});

// Create project
projectsRouter.post('/', (req, res) => {
  const userId = req.user!.id;
  const { title, description, targetDate, tags, icon, color } = req.body;
  const projectTitle = title || 'New Project';

  const result = getDb()
    .prepare('INSERT INTO projects (user_id, title, description, target_date, tags, icon, color) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(userId, projectTitle, description || '', targetDate || null, Array.isArray(tags) ? tags.join(',') : tags || null, icon || null, color || 'slate');

  const projectId = result.lastInsertRowid as number;
  const slug = slugify(projectTitle);
  const folder = projectFolderName(projectId, slug);

  getDb().prepare('UPDATE projects SET slug = ?, vault_path = ? WHERE id = ?').run(slug, folder, projectId);

  try {
    const user = getDb().prepare('SELECT display_name FROM users WHERE id = ?').get(userId) as { display_name: string } | undefined;
    const now = new Date().toISOString();
    ensureProjectFolder(config.vaultPath, folder);
    const vaultData: ProjectVaultData = {
      id: projectId, title: projectTitle, description: description || '',
      status: 'active', targetDate: targetDate || null,
      tags: Array.isArray(tags) ? tags : (tags ? String(tags).split(',').map((t: string) => t.trim()).filter(Boolean) : []),
      icon: icon || null, color: color || 'slate',
      owner: user?.display_name || 'Unknown', createdAt: now, updatedAt: now,
    };
    writeProjectMd(config.vaultPath, folder, vaultData);
    writeProjectTasksMd(config.vaultPath, folder, []);
    writeProjectUpdatesMd(config.vaultPath, folder, []);
    vaultSyncProjectIndex();
  } catch (err) {
    console.error('Vault: failed to scaffold project folder', err);
  }

  res.status(201).json({
    id: projectId,
    title: projectTitle,
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

  try {
    const proj = getDb()
      .prepare('SELECT id, title, description, status, target_date, tags, icon, color, slug, vault_path, created_at, updated_at FROM projects WHERE id = ? AND user_id = ?')
      .get(req.params.id, userId) as Record<string, unknown> | undefined;
    if (proj?.vault_path) {
      const user = getDb().prepare('SELECT display_name FROM users WHERE id = ?').get(userId) as { display_name: string } | undefined;
      const tagList = proj.tags ? (proj.tags as string).split(',').map((t: string) => t.trim()).filter(Boolean) : [];
      writeProjectMd(config.vaultPath, proj.vault_path as string, {
        id: proj.id as number, title: proj.title as string, description: proj.description as string,
        status: proj.status as string, targetDate: (proj.target_date as string) || null,
        tags: tagList, icon: (proj.icon as string) || null, color: (proj.color as string) || null,
        owner: user?.display_name || 'Unknown',
        createdAt: proj.created_at as string, updatedAt: proj.updated_at as string,
      });
      if (title !== undefined || status !== undefined) vaultSyncProjectIndex();
    }
  } catch (err) {
    console.error('Vault: failed to update project.md', err);
  }

  res.json({ ok: true });
});

// Delete project
projectsRouter.delete('/:id', (req, res) => {
  const vaultInfo = getProjectVaultInfo(req.params.id);

  const result = getDb()
    .prepare('DELETE FROM projects WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user!.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Project not found' }); return; }

  if (vaultInfo) {
    try {
      archivePath(config.vaultPath, `Projects/${vaultInfo.vault_path}`);
      vaultSyncProjectIndex();
    } catch (err) {
      console.error('Vault: failed to archive project folder', err);
    }
  }

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

  const vi = getProjectVaultInfo(req.params.id);
  if (vi) vaultSyncTasks(req.params.id as unknown as number, vi.vault_path);

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

  const task = getDb()
    .prepare('SELECT id, external_id FROM project_tasks WHERE id = ? AND project_id = ?')
    .get(req.params.taskId, req.params.id) as { id: number; external_id: string | null } | undefined;

  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

  getDb().prepare('UPDATE project_tasks SET status = ? WHERE id = ?').run(status, task.id);
  getDb().prepare("UPDATE projects SET updated_at = datetime('now') WHERE id = ?").run(req.params.id);

  const vi2 = getProjectVaultInfo(req.params.id);
  if (vi2) vaultSyncTasks(req.params.id as unknown as number, vi2.vault_path);

  res.json({ ok: true });

  if (task.external_id) {
    openclawClient.updateTaskStatus(task.external_id, status as 'completed' | 'open').catch(() => {});
  }
});

// Delete project task
projectsRouter.delete('/:id/tasks/:taskId', (req, res) => {
  const result = getDb()
    .prepare('DELETE FROM project_tasks WHERE id = ? AND project_id = ?')
    .run(req.params.taskId, req.params.id);
  if (result.changes === 0) { res.status(404).json({ error: 'Task not found' }); return; }

  const vi3 = getProjectVaultInfo(req.params.id);
  if (vi3) vaultSyncTasks(req.params.id as unknown as number, vi3.vault_path);

  res.json({ ok: true });
});

// Promote project task to a real reminder via OpenClaw
projectsRouter.post('/:id/tasks/:taskId/promote', async (req, res) => {
  const db = getDb();
  const userId = req.user!.id;
  const { list, dueDate, priority } = req.body as { list?: string; dueDate?: string; priority?: string };

  const project = db.prepare('SELECT id, title FROM projects WHERE id = ? AND user_id = ?')
    .get(req.params.id, userId) as { id: number; title: string } | undefined;
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const task = db.prepare('SELECT id, title, external_id, promoted_at FROM project_tasks WHERE id = ? AND project_id = ?')
    .get(req.params.taskId, project.id) as { id: number; title: string; external_id: string | null; promoted_at: string | null } | undefined;
  if (!task) { res.status(404).json({ error: 'Task not found' }); return; }

  if (task.promoted_at) {
    res.status(409).json({ error: 'Already promoted', externalId: task.external_id, promotedAt: task.promoted_at });
    return;
  }

  try {
    const created = await openclawClient.createTask({
      title: task.title,
      list: list || undefined,
      dueDate: dueDate || undefined,
      priority: priority || undefined,
      notes: `From project: ${project.title}`,
    });

    db.prepare("UPDATE project_tasks SET external_id = ?, promoted_at = datetime('now') WHERE id = ?")
      .run(created.id, task.id);

    await syncTasks(userId);

    res.json({
      ok: true,
      externalId: created.id,
      task: { id: task.id, title: task.title, externalId: created.id },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create reminder';
    res.status(502).json({ error: message });
  }
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

  const viUp = getProjectVaultInfo(req.params.id);
  if (viUp) vaultSyncUpdates(req.params.id as unknown as number, viUp.vault_path);

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

    const viPlan = getProjectVaultInfo(project.id as number);
    if (viPlan) vaultSyncTasks(project.id as number, viPlan.vault_path);

    res.json({ tasks: createdTasks });
  } catch (err) {
    res.status(500).json({ error: 'Failed to generate plan', detail: String(err) });
  }
});

// ── Project Notes CRUD ──────────────────────────────────

projectsRouter.post('/:id/notes', (req, res) => {
  const userId = req.user!.id;
  const project = getDb().prepare('SELECT id, title AS ptitle, vault_path FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, userId) as { id: number; ptitle: string; vault_path: string | null } | undefined;
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const { title, content } = req.body;
  const now = new Date().toISOString();
  const result = getDb()
    .prepare('INSERT INTO project_notes (project_id, title, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
    .run(req.params.id, title || '', content || '', now, now);

  const noteId = result.lastInsertRowid as number;
  const noteSlug = slugify(title || 'untitled');

  getDb().prepare('UPDATE project_notes SET slug = ?, vault_path = ? WHERE id = ?')
    .run(noteSlug, `${noteSlug}.md`, noteId);

  if (project.vault_path) {
    try {
      writeProjectNoteMd(config.vaultPath, project.vault_path, noteSlug, {
        id: noteId, projectId: project.id, projectTitle: project.ptitle,
        title: title || '', content: content || '', createdAt: now, updatedAt: now,
      });
    } catch (err) {
      console.error('Vault: failed to write project note', err);
    }
  }

  res.status(201).json({
    id: noteId,
    title: title || '',
    content: content || '',
    createdAt: now,
    updatedAt: now,
  });
});

projectsRouter.put('/:id/notes/:noteId', (req, res) => {
  const userId = req.user!.id;
  const project = getDb().prepare('SELECT id, title AS ptitle, vault_path FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, userId) as { id: number; ptitle: string; vault_path: string | null } | undefined;
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const { title, content } = req.body;
  const updates: string[] = [];
  const values: unknown[] = [];
  if (title !== undefined) { updates.push('title = ?'); values.push(title); }
  if (content !== undefined) { updates.push('content = ?'); values.push(content); }
  if (updates.length === 0) { res.json({ ok: true }); return; }
  updates.push("updated_at = datetime('now')");
  values.push(req.params.noteId, req.params.id);

  const result = getDb()
    .prepare(`UPDATE project_notes SET ${updates.join(', ')} WHERE id = ? AND project_id = ?`)
    .run(...values);

  if (result.changes === 0) { res.status(404).json({ error: 'Note not found' }); return; }

  if (project.vault_path) {
    try {
      const note = getDb()
        .prepare('SELECT id, title, content, slug, created_at, updated_at FROM project_notes WHERE id = ? AND project_id = ?')
        .get(req.params.noteId, req.params.id) as { id: number; title: string; content: string; slug: string; created_at: string; updated_at: string } | undefined;
      if (note?.slug) {
        writeProjectNoteMd(config.vaultPath, project.vault_path, note.slug, {
          id: note.id, projectId: project.id, projectTitle: project.ptitle,
          title: note.title, content: note.content,
          createdAt: note.created_at, updatedAt: note.updated_at,
        });
      }
    } catch (err) {
      console.error('Vault: failed to update project note', err);
    }
  }

  res.json({ ok: true });
});

projectsRouter.delete('/:id/notes/:noteId', (req, res) => {
  const userId = req.user!.id;
  const project = getDb().prepare('SELECT id, vault_path FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, userId) as { id: number; vault_path: string | null } | undefined;
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const note = getDb()
    .prepare('SELECT slug FROM project_notes WHERE id = ? AND project_id = ?')
    .get(req.params.noteId, req.params.id) as { slug: string | null } | undefined;

  const result = getDb()
    .prepare('DELETE FROM project_notes WHERE id = ? AND project_id = ?')
    .run(req.params.noteId, req.params.id);

  if (result.changes === 0) { res.status(404).json({ error: 'Note not found' }); return; }

  if (project.vault_path && note?.slug) {
    try {
      archivePath(config.vaultPath, `Projects/${project.vault_path}/notes/${note.slug}.md`);
    } catch (err) {
      console.error('Vault: failed to archive project note', err);
    }
  }

  res.json({ ok: true });
});

// AI: Summarize a project note
projectsRouter.post('/:id/notes/:noteId/ai-summarize', async (req, res) => {
  const userId = req.user!.id;
  const project = getDb().prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').get(req.params.id, userId);
  if (!project) { res.status(404).json({ error: 'Project not found' }); return; }

  const note = getDb()
    .prepare('SELECT title, content FROM project_notes WHERE id = ? AND project_id = ?')
    .get(req.params.noteId, req.params.id) as { title: string; content: string } | undefined;

  if (!note) { res.status(404).json({ error: 'Note not found' }); return; }

  await streamAiText(
    res,
    'You are a concise note summarizer. Respond with only the summary text.',
    note.content.trim()
      ? `Summarize in 2-3 sentences:\n\nTitle: ${note.title || 'Untitled'}\n\n${note.content}`
      : 'Respond with: "This note is empty."',
  );
});
