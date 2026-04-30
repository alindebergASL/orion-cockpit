import type { ToolDefinition } from '../services/llm/types.js';
import { getDb } from '../db.js';

export const dashboardTools: ToolDefinition[] = [
  {
    name: 'search_dashboard',
    description: 'Search across projects, notes, and journal entries on the dashboard. Use when you need full note content, specific project details, or to find something the user is asking about.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search term to match against titles, content, and descriptions' },
        scope: {
          type: 'string',
          enum: ['projects', 'notes', 'journal', 'all'],
          description: 'Which data to search. Defaults to all.',
        },
      },
      required: ['query'],
    },
  },
];

interface SearchResult {
  type: string;
  title: string;
  content: string;
  meta?: Record<string, unknown>;
}

export function executeDashboardTool(
  name: string,
  args: Record<string, unknown>,
  userId: number,
): string {
  if (name !== 'search_dashboard') {
    return JSON.stringify({ error: `Unknown tool: ${name}` });
  }

  const query = (args.query as string || '').trim();
  const scope = (args.scope as string) || 'all';
  if (!query) return JSON.stringify({ error: 'query is required' });

  const db = getDb();
  const pattern = `%${query}%`;
  const results: SearchResult[] = [];

  if (scope === 'all' || scope === 'projects') {
    const projects = db.prepare(`
      SELECT p.id, p.title, p.description, p.status, p.target_date, p.tags
      FROM projects p
      WHERE p.user_id = ? AND (p.title LIKE ? OR p.description LIKE ? OR p.tags LIKE ?)
      ORDER BY p.updated_at DESC LIMIT 5
    `).all(userId, pattern, pattern, pattern) as { id: number; title: string; description: string; status: string; target_date: string | null; tags: string }[];

    for (const p of projects) {
      const tasks = db.prepare(
        `SELECT title, status FROM project_tasks WHERE project_id = ? ORDER BY sort_order ASC`
      ).all(p.id) as { title: string; status: string }[];

      results.push({
        type: 'project',
        title: p.title,
        content: p.description || '(no description)',
        meta: {
          status: p.status,
          targetDate: p.target_date,
          tags: p.tags ? JSON.parse(p.tags) : [],
          tasks: tasks.map((t) => ({ title: t.title, status: t.status })),
        },
      });
    }
  }

  if (scope === 'all' || scope === 'notes') {
    const notes = db.prepare(`
      SELECT title, content, tags, folder, updated_at
      FROM notes WHERE user_id = ? AND (title LIKE ? OR content LIKE ?)
      ORDER BY updated_at DESC LIMIT 5
    `).all(userId, pattern, pattern) as { title: string; content: string; tags: string | null; folder: string | null; updated_at: string }[];

    for (const n of notes) {
      results.push({
        type: 'note',
        title: n.title,
        content: n.content,
        meta: {
          folder: n.folder,
          tags: n.tags ? JSON.parse(n.tags) : [],
          updatedAt: n.updated_at,
        },
      });
    }
  }

  if (scope === 'all' || scope === 'journal') {
    const journals = db.prepare(`
      SELECT date, content FROM daily_notes
      WHERE user_id = ? AND content LIKE ?
      ORDER BY date DESC LIMIT 5
    `).all(userId, pattern) as { date: string; content: string }[];

    for (const j of journals) {
      results.push({
        type: 'journal',
        title: `Journal — ${j.date}`,
        content: j.content,
      });
    }
  }

  if (results.length === 0) {
    return JSON.stringify({ results: [], message: `No results found for "${query}" in ${scope}.` });
  }

  return JSON.stringify({ results });
}
