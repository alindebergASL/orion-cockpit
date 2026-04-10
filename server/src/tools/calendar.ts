import type { ToolDefinition } from '../services/llm/types.js';
import { syncCalendar } from '../services/sync.js';
import { getDb } from '../db.js';
import { openclawClient } from '../services/openclaw.js';

export const calendarTools: ToolDefinition[] = [
  {
    name: 'refresh_calendar',
    description: 'Refresh calendar events from the source. Call this when the user asks to refresh, or when cached data is stale.',
    parameters: {
      type: 'object',
      properties: {
        days: { type: 'number', description: 'Number of days to fetch (default 14)' },
      },
    },
  },
  {
    name: 'create_calendar_event',
    description: 'Create a new calendar event.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Event title' },
        start: { type: 'string', description: 'Start time in ISO 8601 format' },
        end: { type: 'string', description: 'End time in ISO 8601 format' },
        calendar: { type: 'string', description: 'Calendar name' },
        location: { type: 'string', description: 'Event location' },
        description: { type: 'string', description: 'Event description' },
        allDay: { type: 'boolean', description: 'Whether this is an all-day event' },
      },
      required: ['title', 'start', 'end'],
    },
  },
  {
    name: 'update_calendar_event',
    description: 'Update an existing calendar event.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Event ID to update' },
        title: { type: 'string' },
        start: { type: 'string' },
        end: { type: 'string' },
        location: { type: 'string' },
        description: { type: 'string' },
      },
      required: ['id'],
    },
  },
];

export async function executeCalendarTool(
  name: string,
  args: Record<string, unknown>,
  userId: number,
): Promise<string> {
  switch (name) {
    case 'refresh_calendar': {
      const events = await syncCalendar(userId);
      return JSON.stringify({ success: true, eventCount: events.length, events });
    }
    case 'create_calendar_event': {
      // Get user display name for the OpenClaw request
      const user = getDb().prepare('SELECT display_name FROM users WHERE id = ?')
        .get(userId) as { display_name: string };
      const response = await openclawClient.chatOnce([
        {
          role: 'user',
          content: `Create a calendar event for ${user.display_name}: ${JSON.stringify(args)}. Confirm with the event details.`,
        },
      ]);
      // Re-sync after creation
      await syncCalendar(userId);
      return response;
    }
    case 'update_calendar_event': {
      const user = getDb().prepare('SELECT display_name FROM users WHERE id = ?')
        .get(userId) as { display_name: string };
      const response = await openclawClient.chatOnce([
        {
          role: 'user',
          content: `Update calendar event for ${user.display_name}: ${JSON.stringify(args)}. Confirm with the updated details.`,
        },
      ]);
      await syncCalendar(userId);
      return response;
    }
    default:
      return JSON.stringify({ error: `Unknown calendar tool: ${name}` });
  }
}
