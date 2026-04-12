import { config } from '../config.js';

interface OpenClawStreamOptions {
  messages: { role: string; content: string }[];
  sessionKey?: string;
}

export class OpenClawClient {
  private baseUrl: string;
  private token: string;

  constructor() {
    this.baseUrl = config.openclaw.url;
    this.token = config.openclaw.token;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  /** Send a one-shot chat and collect full response. */
  async chatOnce(
    messages: { role: string; content: string }[],
    sessionKey?: string,
  ): Promise<string> {
    let result = '';
    await this.streamChat({ messages, sessionKey }, (chunk) => { result += chunk; });
    return result;
  }

  /** Stream a chat via OpenClaw's Responses API. */
  async streamChat(
    opts: OpenClawStreamOptions,
    onText: (chunk: string) => void,
  ): Promise<void> {
    // Build input items for Responses API format
    const input = opts.messages.map((m) => ({
      role: m.role === 'system' ? 'developer' : m.role,
      content: m.content,
    }));

    const res = await fetch(`${this.baseUrl}/v1/responses`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: 'openclaw/default',
        input,
        stream: true,
        ...(opts.sessionKey && { session_key: opts.sessionKey }),
      }),
    });

    if (!res.ok) {
      throw new Error(`OpenClaw error ${res.status}: ${await res.text()}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          // Responses API: output_text.delta events
          if (parsed.type === 'response.output_text.delta' && parsed.delta) {
            onText(parsed.delta);
          }
          // Also handle chat completions format as fallback
          const delta = parsed.choices?.[0]?.delta;
          if (delta?.content) onText(delta.content);
        } catch {
          // skip malformed chunks
        }
      }
    }
  }

  /** Invoke an OpenClaw tool directly. */
  async invokeTool<T = unknown>(
    tool: string,
    params: Record<string, unknown> = {},
  ): Promise<T> {
    const res = await fetch(`${this.baseUrl}/tools/invoke`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({ tool, params }),
    });
    if (!res.ok) {
      throw new Error(`Tool invocation error ${res.status}: ${await res.text()}`);
    }
    return res.json() as Promise<T>;
  }

  /** Health check. */
  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
        method: 'OPTIONS',
        headers: this.headers(),
        signal: AbortSignal.timeout(5000),
      });
      return res.ok || res.status === 405 || res.status === 204;
    } catch {
      return false;
    }
  }

  // ── Direct API endpoints (no LLM in the loop) ──────────

  /** Fetch soul.md contents directly. */
  async getSoul(): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/soul`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Soul fetch error ${res.status}: ${await res.text()}`);
    return res.text();
  }

  /** Fetch available calendars list. */
  async getCalendarList(): Promise<{ id: string; name: string }[]> {
    const res = await fetch(`${this.baseUrl}/api/calendar/calendars`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Calendar list error ${res.status}: ${await res.text()}`);
    return res.json() as Promise<{ id: string; name: string }[]>;
  }

  /** Fetch calendar events directly via gog. */
  async getCalendarEvents(from: string, to: string): Promise<CalendarEventRaw[]> {
    const res = await fetch(`${this.baseUrl}/api/calendar/events?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Calendar fetch error ${res.status}: ${await res.text()}`);
    return res.json() as Promise<CalendarEventRaw[]>;
  }

  /** Create a calendar event directly via gog. */
  async createCalendarEvent(data: {
    title: string; start: string; end: string;
    calendar?: string; location?: string; description?: string; allDay?: boolean;
  }): Promise<CalendarEventRaw> {
    const res = await fetch(`${this.baseUrl}/api/calendar/events`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Calendar create error ${res.status}: ${await res.text()}`);
    return res.json() as Promise<CalendarEventRaw>;
  }

  /** Fetch available task lists. */
  async getTaskLists(): Promise<{ id: string; name: string }[]> {
    const res = await fetch(`${this.baseUrl}/api/tasks/lists`, {
      headers: this.headers(),
    });
    if (!res.ok) throw new Error(`Task lists error ${res.status}: ${await res.text()}`);
    return res.json() as Promise<{ id: string; name: string }[]>;
  }

  /** Fetch tasks directly via remindctl. */
  async getTasks(list?: string): Promise<TaskRaw[]> {
    const url = list
      ? `${this.baseUrl}/api/tasks?list=${encodeURIComponent(list)}`
      : `${this.baseUrl}/api/tasks`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`Tasks fetch error ${res.status}: ${await res.text()}`);
    return res.json() as Promise<TaskRaw[]>;
  }

  /** Create a task directly via remindctl. */
  async createTask(data: {
    title: string; list?: string; priority?: string; dueDate?: string; notes?: string;
  }): Promise<TaskRaw> {
    const res = await fetch(`${this.baseUrl}/api/tasks`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error(`Task create error ${res.status}: ${await res.text()}`);
    return res.json() as Promise<TaskRaw>;
  }

  /** Update task status directly via remindctl. */
  async updateTaskStatus(id: string, status: 'completed' | 'open'): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/tasks/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: this.headers(),
      body: JSON.stringify({ status }),
    });
    if (!res.ok) throw new Error(`Task update error ${res.status}: ${await res.text()}`);
  }
}

export interface CalendarEventRaw {
  id: string;
  title: string;
  start: string;
  end: string;
  calendar: string;
  calendarId?: string;
  location?: string | null;
  description?: string | null;
  allDay: boolean;
}

export interface TaskRaw {
  id: string;
  title: string;
  status: string;
  priority?: string | null;
  dueDate?: string | null;
  description?: string | null;
  listName?: string | null;
}

export const openclawClient = new OpenClawClient();
