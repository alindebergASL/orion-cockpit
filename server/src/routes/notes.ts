import { Router } from 'express';
import { getDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';
import { streamAiText } from '../services/ai-stream.js';
import { openclawClient } from '../services/openclaw.js';

export const notesRouter = Router();

notesRouter.use(authenticate);

notesRouter.get('/', (req, res) => {
  const rows = getDb()
    .prepare('SELECT id, title, content, tags, folder, color, is_pinned, created_at, updated_at FROM notes WHERE user_id = ? ORDER BY is_pinned DESC, updated_at DESC')
    .all(req.user!.id) as Record<string, unknown>[];

  res.json(rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    tags: r.tags ? (r.tags as string).split(',').map((t: string) => t.trim()).filter(Boolean) : [],
    folder: r.folder || null,
    color: r.color || null,
    isPinned: !!(r.is_pinned),
    createdAt: r.created_at || r.updated_at,
    updatedAt: r.updated_at,
  })));
});

notesRouter.get('/folders', (req, res) => {
  const rows = getDb()
    .prepare('SELECT DISTINCT folder FROM notes WHERE user_id = ? AND folder IS NOT NULL AND folder != ?')
    .all(req.user!.id, '') as { folder: string }[];
  res.json(rows.map((r) => r.folder).sort());
});

notesRouter.get('/tags', (req, res) => {
  const rows = getDb()
    .prepare("SELECT tags FROM notes WHERE user_id = ? AND tags != '' AND tags IS NOT NULL")
    .all(req.user!.id) as { tags: string }[];
  const tagSet = new Set<string>();
  for (const r of rows) {
    for (const t of r.tags.split(',')) {
      const trimmed = t.trim();
      if (trimmed) tagSet.add(trimmed);
    }
  }
  res.json([...tagSet].sort());
});

notesRouter.post('/', (req, res) => {
  const { title, content, tags, folder, color } = req.body;
  const tagsStr = Array.isArray(tags) ? tags.join(',') : tags || '';
  const now = new Date().toISOString();
  const result = getDb()
    .prepare('INSERT INTO notes (user_id, title, content, tags, folder, color, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .run(req.user!.id, title || '', content || '', tagsStr, folder || null, color || null, now);

  res.status(201).json({
    id: result.lastInsertRowid,
    title: title || '',
    content: content || '',
    tags: tagsStr ? tagsStr.split(',').map((t: string) => t.trim()).filter(Boolean) : [],
    folder: folder || null,
    color: color || null,
    isPinned: false,
    createdAt: now,
    updatedAt: now,
  });
});

notesRouter.put('/:id', (req, res) => {
  const { title, content, tags, folder, color, isPinned } = req.body;
  const updates: string[] = [];
  const values: unknown[] = [];
  if (title !== undefined) { updates.push('title = ?'); values.push(title); }
  if (content !== undefined) { updates.push('content = ?'); values.push(content); }
  if (tags !== undefined) { updates.push('tags = ?'); values.push(Array.isArray(tags) ? tags.join(',') : tags); }
  if (folder !== undefined) { updates.push('folder = ?'); values.push(folder || null); }
  if (color !== undefined) { updates.push('color = ?'); values.push(color || null); }
  if (isPinned !== undefined) { updates.push('is_pinned = ?'); values.push(isPinned ? 1 : 0); }
  if (updates.length === 0) { res.json({ ok: true }); return; }
  updates.push("updated_at = datetime('now')");
  values.push(req.params.id, req.user!.id);
  const result = getDb()
    .prepare(`UPDATE notes SET ${updates.join(', ')} WHERE id = ? AND user_id = ?`)
    .run(...values);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Note not found' });
    return;
  }
  res.json({ ok: true });
});

notesRouter.delete('/:id', (req, res) => {
  const result = getDb()
    .prepare('DELETE FROM notes WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user!.id);

  if (result.changes === 0) {
    res.status(404).json({ error: 'Note not found' });
    return;
  }
  res.json({ ok: true });
});

notesRouter.post('/:id/ai-summarize', async (req, res) => {
  const note = getDb()
    .prepare('SELECT title, content FROM notes WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user!.id) as { title: string; content: string } | undefined;

  if (!note) { res.status(404).json({ error: 'Note not found' }); return; }

  const userPrompt = note.content.trim()
    ? `Summarize the following note in 2-3 concise sentences. Capture the key points and intent. Return only the summary text with no preamble.

Title: ${note.title || 'Untitled'}
Content:
${note.content}`
    : 'Respond with only the text: "This note is empty."';

  await streamAiText(
    res,
    'You are a concise note summarizer. Respond with only the summary text — no preamble, no JSON, no code fences.',
    userPrompt,
  );
});

notesRouter.post('/:id/ai-expand', async (req, res) => {
  const note = getDb()
    .prepare('SELECT title, content FROM notes WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user!.id) as { title: string; content: string } | undefined;

  if (!note) { res.status(404).json({ error: 'Note not found' }); return; }

  const userPrompt = note.content.trim()
    ? `Expand the following note into well-written paragraphs. If the content has bullet points or an outline, flesh them out with detail. Preserve any existing markdown formatting. Respond with only the expanded markdown — no preamble, no code fences around the whole response.

Title: ${note.title || 'Untitled'}
Content:
${note.content}`
    : 'Respond with only the text: "(empty note — nothing to expand)"';

  await streamAiText(
    res,
    'You are a skilled writer who expands notes into well-structured markdown. Respond with only the expanded content.',
    userPrompt,
  );
});

notesRouter.post('/:id/ai-tags', async (req, res) => {
  const note = getDb()
    .prepare('SELECT title, content, tags FROM notes WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user!.id) as { title: string; content: string; tags: string } | undefined;

  if (!note) { res.status(404).json({ error: 'Note not found' }); return; }
  if (!note.content.trim()) { res.json({ tags: [] }); return; }

  const existingTags = note.tags ? note.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [];

  const prompt = `Suggest 3-5 short tags for this note. Tags should be lowercase, 1-2 words each, and categorize the content.
${existingTags.length > 0 ? `\nExisting tags (don't duplicate): ${existingTags.join(', ')}` : ''}

Title: ${note.title || 'Untitled'}
Content:
${note.content.slice(0, 1000)}

Return ONLY valid JSON (no markdown, no code fences):
{ "tags": ["tag1", "tag2", "tag3"] }`;

  try {
    const raw = await openclawClient.chatOnce([
      { role: 'system', content: 'You are a concise tag suggester. Return only valid JSON.' },
      { role: 'user', content: prompt },
    ]);
    const cleaned = raw.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    res.json(JSON.parse(cleaned));
  } catch (err) {
    res.status(500).json({ error: 'Failed to suggest tags', detail: String(err) });
  }
});
