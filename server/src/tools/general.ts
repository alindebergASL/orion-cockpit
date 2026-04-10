import type { ToolDefinition } from '../services/llm/types.js';
import { openclawClient } from '../services/openclaw.js';
import { getDb } from '../db.js';

export const generalTools: ToolDefinition[] = [
  {
    name: 'ask_openclaw',
    description: 'Send a natural language request to OpenClaw for anything not covered by calendar/task tools (home automation, email, reminders, general knowledge, etc.).',
    parameters: {
      type: 'object',
      properties: {
        request: { type: 'string', description: 'The natural language request to send to OpenClaw' },
      },
      required: ['request'],
    },
  },
];

export async function executeGeneralTool(
  name: string,
  args: Record<string, unknown>,
  userId: number,
): Promise<string> {
  switch (name) {
    case 'ask_openclaw': {
      const user = getDb().prepare('SELECT display_name FROM users WHERE id = ?')
        .get(userId) as { display_name: string };
      const response = await openclawClient.chatOnce([
        {
          role: 'system',
          content: `You are helping ${user.display_name}. Respond concisely.`,
        },
        {
          role: 'user',
          content: args.request as string,
        },
      ]);
      return response;
    }
    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}
