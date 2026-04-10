import type { ToolDefinition } from '../services/llm/types.js';
import { syncTasks } from '../services/sync.js';
import { getDb } from '../db.js';
import { openclawClient } from '../services/openclaw.js';

export const taskTools: ToolDefinition[] = [
  {
    name: 'refresh_tasks',
    description: 'Refresh tasks from the source. Call this when the user asks to refresh, or when cached data is stale.',
    parameters: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['open', 'in_progress', 'completed'], description: 'Filter by status' },
      },
    },
  },
  {
    name: 'create_task',
    description: 'Create a new task.',
    parameters: {
      type: 'object',
      properties: {
        title: { type: 'string', description: 'Task title' },
        list: { type: 'string', description: 'Task list name' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        dueDate: { type: 'string', description: 'Due date in ISO 8601 format' },
        description: { type: 'string' },
      },
      required: ['title'],
    },
  },
  {
    name: 'update_task',
    description: 'Update an existing task (e.g. mark complete, change priority).',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Task ID' },
        status: { type: 'string', enum: ['open', 'in_progress', 'completed'] },
        title: { type: 'string' },
        priority: { type: 'string', enum: ['low', 'medium', 'high'] },
        dueDate: { type: 'string' },
      },
      required: ['id'],
    },
  },
];

export async function executeTaskTool(
  name: string,
  args: Record<string, unknown>,
  userId: number,
): Promise<string> {
  switch (name) {
    case 'refresh_tasks': {
      const tasks = await syncTasks(userId);
      return JSON.stringify({ success: true, taskCount: tasks.length, tasks });
    }
    case 'create_task': {
      const user = getDb().prepare('SELECT display_name FROM users WHERE id = ?')
        .get(userId) as { display_name: string };
      const response = await openclawClient.chatOnce([
        {
          role: 'user',
          content: `Create a task for ${user.display_name}: ${JSON.stringify(args)}. Confirm with the task details.`,
        },
      ]);
      await syncTasks(userId);
      return response;
    }
    case 'update_task': {
      const user = getDb().prepare('SELECT display_name FROM users WHERE id = ?')
        .get(userId) as { display_name: string };
      const response = await openclawClient.chatOnce([
        {
          role: 'user',
          content: `Update task for ${user.display_name}: ${JSON.stringify(args)}. Confirm with the updated details.`,
        },
      ]);
      await syncTasks(userId);
      return response;
    }
    default:
      return JSON.stringify({ error: `Unknown task tool: ${name}` });
  }
}
