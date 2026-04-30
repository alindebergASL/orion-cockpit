import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { config } from '../config.js';
import { getDb } from '../db.js';
import { getProvider } from '../services/llm/factory.js';
import { openclawClient } from '../services/openclaw.js';
import { allTools, executeTool } from '../tools/index.js';
import type { LLMMessage, LLMContentBlock, StreamChunk } from '../services/llm/types.js';

export const chatRouter = Router();

chatRouter.use(authenticate);

function buildDashboardContext(userId: number): string {
  const db = getDb();
  const today = new Date().toISOString().split('T')[0];
  const sections: string[] = [];

  const projects = db.prepare(`
    SELECT p.id, p.title, p.description, p.status, p.target_date, p.tags,
      (SELECT COUNT(*) FROM project_tasks WHERE project_id = p.id) as task_count,
      (SELECT COUNT(*) FROM project_tasks WHERE project_id = p.id AND status = 'completed') as completed_count
    FROM projects p WHERE p.user_id = ? ORDER BY p.updated_at DESC LIMIT 10
  `).all(userId) as { id: number; title: string; description: string; status: string; target_date: string | null; tags: string; task_count: number; completed_count: number }[];

  if (projects.length > 0) {
    const lines = projects.map((p) => {
      const tags = p.tags ? JSON.parse(p.tags).join(', ') : '';
      const target = p.target_date ? `, target: ${p.target_date}` : '';
      let line = `- "${p.title}" [${p.status}] (${p.completed_count}/${p.task_count} tasks done${target})`;
      if (tags) line += ` — tags: ${tags}`;

      if (p.status === 'active') {
        const openTasks = db.prepare(
          `SELECT title FROM project_tasks WHERE project_id = ? AND status = 'open' ORDER BY sort_order ASC LIMIT 5`
        ).all(p.id) as { title: string }[];
        if (openTasks.length > 0) {
          line += `\n  Open tasks: ${openTasks.map((t) => t.title).join(', ')}`;
        }
      }
      return line;
    });
    sections.push(`Projects:\n${lines.join('\n')}`);
  }

  const notes = db.prepare(`
    SELECT title, substr(content, 1, 200) as excerpt, tags, folder, updated_at
    FROM notes WHERE user_id = ? ORDER BY updated_at DESC LIMIT 10
  `).all(userId) as { title: string; excerpt: string; tags: string | null; folder: string | null; updated_at: string }[];

  if (notes.length > 0) {
    const lines = notes.map((n) => {
      const meta: string[] = [];
      if (n.folder) meta.push(`folder: ${n.folder}`);
      if (n.tags) {
        try { meta.push(`tags: ${JSON.parse(n.tags).join(', ')}`); } catch { /* ignore */ }
      }
      const metaStr = meta.length ? ` (${meta.join(', ')})` : '';
      return `- "${n.title}"${metaStr} — "${n.excerpt}${n.excerpt.length >= 200 ? '…' : ''}"`;
    });
    sections.push(`Recent notes:\n${lines.join('\n')}`);
  }

  const journal = db.prepare(
    `SELECT content FROM daily_notes WHERE user_id = ? AND date = ? LIMIT 1`
  ).get(userId, today) as { content: string } | undefined;

  if (journal?.content?.trim()) {
    sections.push(`Today's journal:\n"${journal.content.trim().slice(0, 500)}"`);
  }

  if (sections.length === 0) return '';

  return `\n--- Dashboard data (projects, notes, journal) ---\n\n${sections.join('\n\n')}\n\nWhen the user asks about projects, notes, or their journal, use this data to answer directly.\nDo not say you don't have access to this information — you do.\nFor full note content, use the search_dashboard tool.`;
}

function buildSystemPrompt(user: { id: number; displayName: string; username: string }): string {
  const db = getDb();

  // Load synced calendar events
  const events = db
    .prepare('SELECT title, start, end, calendar, location, all_day, synced_at FROM calendar_events WHERE user_id = ? OR user_id IS NULL ORDER BY start ASC')
    .all(user.id) as Record<string, unknown>[];

  const calSyncRow = db
    .prepare('SELECT last_synced_at FROM sync_log WHERE user_id = ? AND data_type = ? ORDER BY id DESC LIMIT 1')
    .get(user.id, 'calendar') as { last_synced_at: string } | undefined;

  // Load synced tasks
  const tasks = db
    .prepare('SELECT title, status, priority, due_date, list_name, synced_at FROM tasks WHERE user_id = ? OR user_id IS NULL')
    .all(user.id) as Record<string, unknown>[];

  const taskSyncRow = db
    .prepare('SELECT last_synced_at FROM sync_log WHERE user_id = ? AND data_type = ? ORDER BY id DESC LIMIT 1')
    .get(user.id, 'tasks') as { last_synced_at: string } | undefined;

  // Cap at 50 events and 50 tasks to keep system prompt reasonable
  const cappedEvents = events.slice(0, 50);
  const cappedTasks = tasks.slice(0, 50);
  const calendarJson = cappedEvents.length ? JSON.stringify(cappedEvents, null, 2) : '(no synced calendar data yet — call refresh_calendar to load)';
  const taskJson = cappedTasks.length ? JSON.stringify(cappedTasks, null, 2) : '(no synced task data yet — call refresh_tasks to load)';

  // Load soul.md if synced
  const soulRow = db.prepare("SELECT value FROM settings WHERE key = 'soul_md'")
    .get() as { value: string } | undefined;
  const soulMd = soulRow?.value ?? '';

  const identity = soulMd
    ? `${soulMd}\n\n---\n\nYou are currently talking to ${user.displayName} (${user.username}).`
    : `You are OpenClaw, a personal AI assistant for the ${user.displayName} household.\nYou are currently talking to ${user.displayName} (${user.username}).`;

  return `${identity}

Here is ${user.username}'s calendar data (synced at ${calSyncRow?.last_synced_at ?? 'never'}):
${calendarJson}

Here is ${user.username}'s task data (synced at ${taskSyncRow?.last_synced_at ?? 'never'}):
${taskJson}

When the user asks about their schedule, tasks, projects, notes, or journal, use the data above to answer immediately.
Call tools only when:
- Data needs to be refreshed (user asks to refresh, or data was never synced)
- An action is needed (create/update/delete an event or task)
- You need full note content (use search_dashboard)
- The question is outside dashboard scope (use ask_openclaw)

Keep responses conversational and helpful. You know the user personally.`
  + buildDashboardContext(user.id);
}

function loadConversationHistory(conversationId: number, limit = 50): LLMMessage[] {
  const rows = getDb()
    .prepare('SELECT role, content FROM chat_messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?')
    .all(conversationId, limit) as { role: string; content: string }[];

  return rows.reverse().map((r) => ({
    role: r.role as LLMMessage['role'],
    content: r.content,
  }));
}

function saveChatMessage(userId: number, tab: string, conversationId: number, role: string, content: string): void {
  getDb()
    .prepare('INSERT INTO chat_messages (user_id, tab, conversation_id, role, content) VALUES (?, ?, ?, ?, ?)')
    .run(userId, tab, conversationId, role, content);
}

function updateConversationTitle(conversationId: number, firstMessage: string): void {
  const title = firstMessage.length > 50 ? firstMessage.slice(0, 50) + '...' : firstMessage;
  getDb()
    .prepare("UPDATE conversations SET title = ?, updated_at = datetime('now') WHERE id = ? AND title = 'New Chat'")
    .run(title, conversationId);
}

function touchConversation(conversationId: number): void {
  getDb()
    .prepare("UPDATE conversations SET updated_at = datetime('now') WHERE id = ?")
    .run(conversationId);
}

chatRouter.post('/', async (req, res) => {
  const user = req.user!;
  const { message, tabContext, conversationId } = req.body as {
    message: string;
    tabContext?: string;
    conversationId?: number;
  };

  if (!message) {
    res.status(400).json({ error: 'message is required' });
    return;
  }

  const tab = tabContext || 'chat';

  // Resolve conversation
  let convId = conversationId;
  if (!convId) {
    // Create a new conversation if none provided
    const result = getDb()
      .prepare('INSERT INTO conversations (user_id, tab, title) VALUES (?, ?, ?)')
      .run(user.id, tab, 'New Chat');
    convId = result.lastInsertRowid as number;
  } else {
    // Verify ownership
    const conv = getDb()
      .prepare('SELECT id FROM conversations WHERE id = ? AND user_id = ?')
      .get(convId, user.id);
    if (!conv) {
      res.status(404).json({ error: 'Conversation not found' });
      return;
    }
  }

  // Set up SSE
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const sendSSE = (data: string) => {
    res.write(`data: ${data}\n\n`);
  };

  const sendHeartbeat = () => {
    res.write(': heartbeat\n\n');
  };

  // Send conversation ID so frontend can track it
  sendSSE(JSON.stringify({ type: 'conversation', conversationId: convId }));

  try {
    const systemPrompt = buildSystemPrompt(user);
    const history = loadConversationHistory(convId);

    // Determine chat mode: per-user override or global config
    const userModePref = getDb()
      .prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = 'chat_mode'")
      .get(user.id) as { value: string } | undefined;
    const chatMode = userModePref?.value || config.chatMode;

    // Save user message
    saveChatMessage(user.id, tab, convId, 'user', message);
    updateConversationTitle(convId, message);
    touchConversation(convId);

    let usedOpenClaw = false;

    if (chatMode === 'openclaw') {
      // === OPENCLAW DIRECT MODE (with LLM fallback) ===
      try {
        const openclawMessages = [
          { role: 'system', content: systemPrompt },
          ...history.map((m) => ({ role: m.role, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) })),
          { role: 'user', content: message },
        ];

        let fullResponse = '';
        await openclawClient.streamChat(
          { messages: openclawMessages },
          (chunk) => {
            fullResponse += chunk;
            sendSSE(JSON.stringify({ type: 'text', content: chunk }));
          },
          sendHeartbeat,
        );

        if (fullResponse) {
          saveChatMessage(user.id, tab, convId, 'assistant', fullResponse);
        }

        sendSSE('[DONE]');
        res.end();
        return;
      } catch (openclawErr) {
        // OpenClaw failed — fall through to LLM mode
        console.error('OpenClaw chat failed, falling back to LLM:', (openclawErr as Error).message);
        sendSSE(JSON.stringify({ type: 'text', content: '*(OpenClaw unreachable — using fallback LLM)*\n\n' }));
        usedOpenClaw = false;
      }
    }

    // === LLM MODE (OpenRouter/Anthropic) — primary or fallback ===
    const provider = getProvider('chat', config.llm.tiers);

    // Build message list
    const messages: LLMMessage[] = [
      ...history,
      { role: 'user', content: message },
    ];

    let fullResponse = '';

    // Tool execution loop
    const MAX_TOOL_ROUNDS = 10;
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      let hasToolCalls = false;
      const toolCalls: { id: string; name: string; args: Record<string, unknown> }[] = [];
      let roundText = '';

      for await (const chunk of provider.chat({
        messages,
        system: systemPrompt,
        tools: allTools,
      })) {
        if (chunk.type === 'text_delta') {
          roundText += chunk.text;
          fullResponse += chunk.text;
          sendSSE(JSON.stringify({ type: 'text', content: chunk.text }));
        } else if (chunk.type === 'tool_call') {
          hasToolCalls = true;
          toolCalls.push(chunk);
          sendSSE(JSON.stringify({ type: 'tool_call', name: chunk.name, args: chunk.args }));
        }
      }

      if (!hasToolCalls) break;

      const assistantBlocks: LLMContentBlock[] = [];
      if (roundText) {
        assistantBlocks.push({ type: 'text', text: roundText });
      }
      for (const tc of toolCalls) {
        assistantBlocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.args });
      }
      messages.push({ role: 'assistant', content: assistantBlocks });

      const resultBlocks: LLMContentBlock[] = [];
      for (const tc of toolCalls) {
        sendSSE(JSON.stringify({ type: 'tool_executing', name: tc.name }));
        const result = await executeTool(tc.name, tc.args, user.id);
        resultBlocks.push({ type: 'tool_result', tool_use_id: tc.id, content: result });
        sendSSE(JSON.stringify({ type: 'tool_result', name: tc.name, result }));
      }
      messages.push({ role: 'user', content: resultBlocks });
    }

    // Save assistant response
    if (fullResponse) {
      saveChatMessage(user.id, tab, convId, 'assistant', fullResponse);
    }

    sendSSE('[DONE]');
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Chat error';
    sendSSE(JSON.stringify({ type: 'error', error: message }));
  } finally {
    res.end();
  }
});
