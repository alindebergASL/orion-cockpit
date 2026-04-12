import { api } from './api';

/**
 * Log a user activity to the backend (fire-and-forget).
 * Used to feed the flywheel loop — OpenClaw learns from these.
 */
export function trackActivity(action: string, details?: Record<string, unknown>): void {
  api.logActivity(action, details).catch(() => {});
}
