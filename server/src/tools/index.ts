import type { ToolDefinition } from '../services/llm/types.js';
import { calendarTools, executeCalendarTool } from './calendar.js';
import { taskTools, executeTaskTool } from './tasks.js';
import { generalTools, executeGeneralTool } from './general.js';
import { dashboardTools, executeDashboardTool } from './dashboard.js';

export const allTools: ToolDefinition[] = [
  ...calendarTools,
  ...taskTools,
  ...generalTools,
  ...dashboardTools,
];

const calendarToolNames = new Set(calendarTools.map((t) => t.name));
const taskToolNames = new Set(taskTools.map((t) => t.name));
const dashboardToolNames = new Set(dashboardTools.map((t) => t.name));

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  userId: number,
): Promise<string> {
  if (calendarToolNames.has(name)) {
    return executeCalendarTool(name, args, userId);
  }
  if (taskToolNames.has(name)) {
    return executeTaskTool(name, args, userId);
  }
  if (dashboardToolNames.has(name)) {
    return executeDashboardTool(name, args, userId);
  }
  return executeGeneralTool(name, args, userId);
}
