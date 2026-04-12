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

  // Gather context
  const events = db
    .prepare("SELECT title, start, end, calendar, location FROM calendar_events WHERE (user_id = ? OR user_id IS NULL) AND start >= datetime('now') ORDER BY start ASC LIMIT 30")
    .all(userId) as Record<string, unknown>[];

  const tasks = db
    .prepare("SELECT title, status, priority, due_date, list_name FROM tasks WHERE (user_id = ? OR user_id IS NULL) AND status != 'completed' ORDER BY due_date ASC NULLS LAST")
    .all(userId) as Record<string, unknown>[];

  const recentActivity = db
    .prepare("SELECT action, details, created_at FROM activity_log WHERE user_id = ? AND created_at > datetime('now', '-24 hours') ORDER BY id DESC LIMIT 20")
    .all(userId) as { action: string; details: string | null; created_at: string }[];

  const existingInsights = db
    .prepare("SELECT title FROM insights WHERE user_id = ? AND created_at > datetime('now', '-24 hours')")
    .all(userId) as { title: string }[];

  // Don't generate if no data yet
  if (events.length === 0 && tasks.length === 0) return;

  const existingTitles = existingInsights.map((i) => i.title);

  const prompt = `You are analyzing ${displayName}'s dashboard data to generate helpful, actionable insights.

Today is ${new Date().toISOString().split('T')[0]}.

Calendar events (next 2 weeks):
${JSON.stringify(events, null, 2)}

Open tasks:
${JSON.stringify(tasks, null, 2)}

Recent activity (last 24h):
${recentActivity.map((a) => `${a.action}: ${a.details || ''} (${a.created_at})`).join('\n') || 'No recent activity'}

Already generated insights (don't duplicate):
${existingTitles.join(', ') || 'None'}

Generate 0-3 NEW insights. Only generate an insight if it's genuinely useful — don't force it. Look for:
- Calendar conflicts (overlapping events)
- Overdue or at-risk tasks (due soon, not started)
- Patterns (busy days, scheduling gaps, productivity trends)
- Proactive suggestions (prep for upcoming events, group errands)

Return a JSON array (or empty array if nothing noteworthy):
[{ "type": "calendar_conflict|overdue_task|suggestion|pattern", "title": "short title", "body": "2-3 sentence explanation", "priority": "high|normal|low" }]

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
    }>;

    const insertStmt = db.prepare(`
      INSERT INTO insights (user_id, type, title, body, priority, expires_at)
      VALUES (?, ?, ?, ?, ?, datetime('now', '+48 hours'))
    `);

    for (const insight of insights) {
      // Skip duplicates
      if (existingTitles.some((t) => t.toLowerCase() === insight.title.toLowerCase())) continue;

      insertStmt.run(
        userId,
        insight.type || 'suggestion',
        insight.title,
        insight.body,
        insight.priority || 'normal',
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

      const digest = `Daily activity digest for ${user.display_name} (${new Date().toISOString().split('T')[0]}):

Activity summary: ${summary}
Total actions: ${activities.length}

${insightActions.length > 0 ? `Insight responses: ${insightActions.join(', ')}` : ''}

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
