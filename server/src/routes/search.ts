import { Router } from 'express';
import { getDb } from '../db.js';
import { authenticate } from '../middleware/auth.js';

export const searchRouter = Router();

searchRouter.use(authenticate);

interface SearchResult {
  type: 'event' | 'task' | 'note' | 'journal' | 'chat' | 'insight';
  id: number | string;
  title: string;
  snippet: string;
  date?: string;
  meta?: Record<string, unknown>;
}

// Global search across all content types
searchRouter.get('/', (req, res) => {
  const userId = req.user!.id;
  const query = (req.query.q as string || '').trim();
  const tag = (req.query.tag as string || '').trim();
  const mention = (req.query.mention as string || '').trim();

  if (!query && !tag && !mention) {
    res.json({ results: [] });
    return;
  }

  const results: SearchResult[] = [];
  const db = getDb();

  // Build the search pattern
  const searchPattern = query ? `%${query}%` : null;
  const tagPattern = tag ? `%#${tag}%` : null;
  const mentionPattern = mention ? `%@${mention}%` : null;
  const pattern = searchPattern || tagPattern || mentionPattern || '';

  // Search calendar events
  const events = db.prepare(`
    SELECT id, title, start, end, calendar, location, description
    FROM calendar_events
    WHERE (user_id = ? OR user_id IS NULL)
      AND (title LIKE ? OR description LIKE ? OR location LIKE ? OR calendar LIKE ?)
    ORDER BY start DESC LIMIT 10
  `).all(userId, pattern, pattern, pattern, pattern) as Record<string, unknown>[];

  for (const e of events) {
    const parts: string[] = [];
    if (e.calendar) parts.push(String(e.calendar));
    if (e.location) parts.push(String(e.location));
    results.push({
      type: 'event',
      id: e.id as number,
      title: String(e.title),
      snippet: parts.join(' · ') || new Date(String(e.start)).toLocaleDateString(),
      date: String(e.start),
    });
  }

  // Search tasks
  const tasks = db.prepare(`
    SELECT id, external_id, title, status, priority, due_date, description, list_name
    FROM tasks
    WHERE (user_id = ? OR user_id IS NULL)
      AND (title LIKE ? OR description LIKE ? OR list_name LIKE ?)
    ORDER BY id DESC LIMIT 10
  `).all(userId, pattern, pattern, pattern) as Record<string, unknown>[];

  for (const t of tasks) {
    const parts: string[] = [];
    if (t.list_name) parts.push(String(t.list_name));
    if (t.status) parts.push(String(t.status));
    if (t.priority) parts.push(`${t.priority} priority`);
    results.push({
      type: 'task',
      id: t.external_id as string || t.id as number,
      title: String(t.title),
      snippet: parts.join(' · '),
      date: t.due_date ? String(t.due_date) : undefined,
    });
  }

  // Search notes
  const notes = db.prepare(`
    SELECT id, title, content, updated_at
    FROM notes
    WHERE user_id = ? AND (title LIKE ? OR content LIKE ?)
    ORDER BY updated_at DESC LIMIT 10
  `).all(userId, pattern, pattern) as Record<string, unknown>[];

  for (const n of notes) {
    const content = String(n.content || '');
    const idx = content.toLowerCase().indexOf(query.toLowerCase());
    const snippet = idx >= 0
      ? content.slice(Math.max(0, idx - 30), idx + 70).trim()
      : content.slice(0, 80);
    results.push({
      type: 'note',
      id: n.id as number,
      title: String(n.title || 'Untitled'),
      snippet: snippet || 'Empty note',
      date: String(n.updated_at),
    });
  }

  // Search daily journal entries
  const journals = db.prepare(`
    SELECT id, date, content
    FROM daily_notes
    WHERE user_id = ? AND content LIKE ?
    ORDER BY date DESC LIMIT 10
  `).all(userId, pattern) as Record<string, unknown>[];

  for (const j of journals) {
    const content = String(j.content || '');
    const idx = content.toLowerCase().indexOf(query.toLowerCase());
    const snippet = idx >= 0
      ? content.slice(Math.max(0, idx - 30), idx + 70).trim()
      : content.slice(0, 80);
    results.push({
      type: 'journal',
      id: j.id as number,
      title: `Journal — ${j.date}`,
      snippet,
      date: String(j.date),
      meta: { date: j.date },
    });
  }

  // Search projects
  const projectRows = db.prepare(`
    SELECT id, title, description, status, tags
    FROM projects
    WHERE user_id = ? AND (title LIKE ? OR description LIKE ? OR tags LIKE ?)
    ORDER BY updated_at DESC LIMIT 10
  `).all(userId, pattern, pattern, pattern) as Record<string, unknown>[];

  for (const p of projectRows) {
    results.push({
      type: 'note' as const,
      id: p.id as number,
      title: `Project: ${p.title}`,
      snippet: String(p.description || '').slice(0, 80) || `${p.status} project`,
      meta: { isProject: true },
    });
  }

  // Search project tasks
  const projectTaskRows = db.prepare(`
    SELECT pt.id, pt.title, pt.status, p.title as project_title, p.id as project_id
    FROM project_tasks pt
    JOIN projects p ON pt.project_id = p.id
    WHERE p.user_id = ? AND pt.title LIKE ?
    ORDER BY pt.id DESC LIMIT 10
  `).all(userId, pattern) as Record<string, unknown>[];

  for (const pt of projectTaskRows) {
    results.push({
      type: 'task' as const,
      id: pt.id as number,
      title: String(pt.title),
      snippet: `Project: ${pt.project_title} · ${pt.status}`,
      meta: { isProjectTask: true, projectId: pt.project_id },
    });
  }

  // Search chat messages
  const chats = db.prepare(`
    SELECT m.id, m.content, m.role, m.timestamp, c.title as conv_title, c.id as conv_id
    FROM chat_messages m
    LEFT JOIN conversations c ON m.conversation_id = c.id
    WHERE m.user_id = ? AND m.content LIKE ?
    ORDER BY m.id DESC LIMIT 10
  `).all(userId, pattern) as Record<string, unknown>[];

  for (const c of chats) {
    const content = String(c.content || '');
    const idx = content.toLowerCase().indexOf(query.toLowerCase());
    const snippet = idx >= 0
      ? content.slice(Math.max(0, idx - 30), idx + 70).trim()
      : content.slice(0, 80);
    results.push({
      type: 'chat',
      id: c.conv_id as number || c.id as number,
      title: String(c.conv_title || 'Chat'),
      snippet: `${c.role === 'user' ? 'You' : 'OpenClaw'}: ${snippet}`,
      date: String(c.timestamp),
      meta: { conversationId: c.conv_id, role: c.role },
    });
  }

  // Search insights
  const insightRows = db.prepare(`
    SELECT id, type, title, body, created_at
    FROM insights
    WHERE user_id = ? AND (title LIKE ? OR body LIKE ?)
    ORDER BY created_at DESC LIMIT 5
  `).all(userId, pattern, pattern) as Record<string, unknown>[];

  for (const i of insightRows) {
    results.push({
      type: 'insight',
      id: i.id as number,
      title: String(i.title),
      snippet: String(i.body).slice(0, 80),
      date: String(i.created_at),
    });
  }

  // Extract unique tags and mentions from results
  const allTags = new Set<string>();
  const allMentions = new Set<string>();
  const tagRegex = /#(\w[\w-]*)/g;
  const mentionRegex = /@(\w[\w-]*)/g;

  for (const r of results) {
    const text = `${r.title} ${r.snippet}`;
    for (const m of text.matchAll(tagRegex)) allTags.add(m[1]);
    for (const m of text.matchAll(mentionRegex)) allMentions.add(m[1]);
  }

  res.json({
    results,
    tags: [...allTags],
    mentions: [...allMentions],
  });
});
