import { getDb } from '../db.js';
import { openclawClient } from './openclaw.js';

/**
 * Background agent loop. Runs periodically to generate insights
 * by asking OpenClaw to analyze each user's data.
 */
export async function runAgentLoop(): Promise<void> {
  const db = getDb();
  const users = db.prepare('SELECT id, display_name FROM users').all() as { id: number; display_name: string }[];

  for (const user of users) {
    try {
      await generateInsightsForUser(user.id, user.display_name);
    } catch (err) {
      console.error(`Agent loop failed for user ${user.id}:`, (err as Error).message);
    }
  }
}

async function generateInsightsForUser(userId: number, displayName: string): Promise<void> {
  const db = getDb();

  // Gather context from ALL data sources
  const events = db
    .prepare("SELECT title, start, end, calendar, location, description FROM calendar_events WHERE (user_id = ? OR user_id IS NULL) AND start >= datetime('now') ORDER BY start ASC LIMIT 30")
    .all(userId) as Record<string, unknown>[];

  const tasks = db
    .prepare("SELECT title, status, priority, due_date, list_name, description FROM tasks WHERE (user_id = ? OR user_id IS NULL) AND status != 'completed' ORDER BY due_date ASC NULLS LAST")
    .all(userId) as Record<string, unknown>[];

  const projects = db
    .prepare("SELECT p.title, p.status, p.target_date, (SELECT COUNT(*) FROM project_tasks pt WHERE pt.project_id = p.id AND pt.status = 'open') as open_tasks, (SELECT COUNT(*) FROM project_tasks pt WHERE pt.project_id = p.id) as total_tasks FROM projects p WHERE p.user_id = ? AND p.status = 'active'")
    .all(userId) as Record<string, unknown>[];

  const todayKey = new Date().toISOString().split('T')[0];
  const dailyNote = db
    .prepare('SELECT content FROM daily_notes WHERE user_id = ? AND date = ?')
    .get(userId, todayKey) as { content: string } | undefined;

  const recentNotes = db
    .prepare("SELECT title, tags FROM notes WHERE user_id = ? AND updated_at > datetime('now', '-7 days') ORDER BY updated_at DESC LIMIT 10")
    .all(userId) as { title: string; tags: string }[];

  const recentActivity = db
    .prepare("SELECT action, details, created_at FROM activity_log WHERE user_id = ? AND created_at > datetime('now', '-24 hours') ORDER BY id DESC LIMIT 20")
    .all(userId) as { action: string; details: string | null; created_at: string }[];

  const existingInsights = db
    .prepare("SELECT title FROM insights WHERE user_id = ? AND created_at > datetime('now', '-24 hours')")
    .all(userId) as { title: string }[];

  if (events.length === 0 && tasks.length === 0 && projects.length === 0) return;

  const existingTitles = existingInsights.map((i) => i.title);

  const projectsSummary = projects.length > 0
    ? `Active projects:\n${projects.map((p) => `  - ${p.title}: ${p.open_tasks}/${p.total_tasks} tasks open${p.target_date ? `, due ${p.target_date}` : ''}`).join('\n')}`
    : 'No active projects.';

  const notesSummary = recentNotes.length > 0
    ? `Recent notes (past 7 days): ${recentNotes.map((n) => `"${n.title}"${n.tags ? ` [${n.tags}]` : ''}`).join(', ')}`
    : '';

  const journalSection = dailyNote?.content?.trim()
    ? `Today's journal entry: "${dailyNote.content.trim().slice(0, 300)}"`
    : '';

  const prompt = `You are ${displayName}'s proactive AI assistant. Analyze their complete dashboard to surface insights that connect dots across calendar, tasks, projects, and notes.

Today is ${new Date().toISOString().split('T')[0]}.

Calendar events (next 2 weeks):
${JSON.stringify(events, null, 2)}

Open tasks:
${JSON.stringify(tasks, null, 2)}

${projectsSummary}

${notesSummary}

${journalSection}

Recent activity (last 24h):
${recentActivity.map((a) => `${a.action}: ${a.details || ''} (${a.created_at})`).join('\n') || 'No recent activity'}

Already generated insights (don't duplicate):
${existingTitles.join(', ') || 'None'}

Generate 0-3 NEW insights. Only generate if genuinely useful — something the user should act on today.

Insights should sound like notes a person makes to themselves, not like a system status report. Short. Active. Sentence case. No marketing copy.

Voice rules:
- Titles: sentence case, imperative or active voice, under 8 words. "Add return flight details" not "Return Flight Details Are Weaker Than Outbound."
- Body: 1 sentence, max 2. Use contractions. Second person ("you") or no subject. No referring to the user by name in third person.
- Examples: "Add the return flight info — only the outbound is tracked." / "Drop a follow-up note after UCR — it's the main work item today."

Do NOT generate insights about the user's dashboard usage patterns, browsing behavior, or session activity. Only surface insights about their actual work, calendar, tasks, and projects.

Look for:
- Cross-entity connections: a task that relates to an upcoming meeting, a project deadline with incomplete tasks
- Calendar conflicts or overscheduled days
- Deadline risks: overdue tasks, approaching target dates
- Stalled projects with no recent activity
- Meetings in the next 2h that need preparation
- Journal priorities not reflected in tasks/calendar

Return a JSON array (or empty array if nothing noteworthy):
[{ "type": "cross_tab|calendar_conflict|deadline_risk|momentum|preparation|suggestion", "title": "short imperative title in sentence case", "body": "1-2 conversational sentences, use contractions", "priority": "high|normal|low", "action_type": "navigate|null", "action_data": "{\\"tab\\": \\"tasks\\"}" }]

Return ONLY the JSON array, no other text.`;

  try {
    const response = await openclawClient.chatOnce([
      { role: 'user', content: prompt },
    ]);

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return;

    const insights = JSON.parse(jsonMatch[0]) as Array<{
      type: string;
      title: string;
      body: string;
      priority?: string;
      action_type?: string;
      action_data?: string;
    }>;

    const insertStmt = db.prepare(`
      INSERT INTO insights (user_id, type, title, body, priority, action_type, action_data, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', '+48 hours'))
    `);

    for (const insight of insights) {
      if (existingTitles.some((t) => t.toLowerCase() === insight.title.toLowerCase())) continue;

      insertStmt.run(
        userId,
        insight.type || 'suggestion',
        insight.title,
        insight.body,
        insight.priority || 'normal',
        insight.action_type || null,
        insight.action_data || null,
      );
    }

    if (insights.length > 0) {
      console.log(`Agent generated ${insights.length} insight(s) for user ${userId}`);
    }
  } catch (err) {
    console.error(`Agent insight generation failed for user ${userId}:`, (err as Error).message);
  }
}

/**
 * Push a daily activity digest to OpenClaw so it can learn patterns.
 * This closes the flywheel loop.
 */
export async function pushActivityDigest(): Promise<void> {
  const db = getDb();
  const users = db.prepare('SELECT id, display_name FROM users').all() as { id: number; display_name: string }[];

  for (const user of users) {
    try {
      const activities = db
        .prepare("SELECT action, details, created_at FROM activity_log WHERE user_id = ? AND created_at > datetime('now', '-24 hours') ORDER BY id ASC")
        .all(user.id) as { action: string; details: string | null; created_at: string }[];

      if (activities.length === 0) continue;

      // Load yesterday's daily journal note
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const dateKey = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
      const dailyNote = db
        .prepare('SELECT content FROM daily_notes WHERE user_id = ? AND date = ?')
        .get(user.id, dateKey) as { content: string } | undefined;

      // Summarize activity
      const actionCounts: Record<string, number> = {};
      for (const a of activities) {
        actionCounts[a.action] = (actionCounts[a.action] || 0) + 1;
      }

      const summary = Object.entries(actionCounts)
        .map(([action, count]) => `${action}: ${count} time${count > 1 ? 's' : ''}`)
        .join(', ');

      const insightActions = activities
        .filter((a) => a.action === 'insight_acted_on' || a.action === 'insight_dismissed')
        .map((a) => {
          const details = a.details ? JSON.parse(a.details) : {};
          return `${a.action}: "${details.title || 'unknown'}"`;
        });

      const journalSection = dailyNote?.content?.trim()
        ? `\n\n${user.display_name}'s journal entry for ${dateKey}:\n"${dailyNote.content.trim()}"\n\nPlease remember what they wrote — it reflects their priorities, thoughts, and state of mind.`
        : '';

      const digest = `Daily activity digest for ${user.display_name} (${new Date().toISOString().split('T')[0]}):

Activity summary: ${summary}
Total actions: ${activities.length}

${insightActions.length > 0 ? `Insight responses: ${insightActions.join(', ')}` : ''}${journalSection}

Please note these patterns for future reference and personalization.`;

      await openclawClient.chatOnce([
        { role: 'user', content: digest },
      ]);

      console.log(`Pushed activity digest to OpenClaw for user ${user.id} (${activities.length} activities)`);
    } catch (err) {
      console.error(`Activity digest push failed for user ${user.id}:`, (err as Error).message);
    }
  }
}
