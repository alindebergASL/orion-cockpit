import type { User, CalendarEvent, Task, Note } from '../types';

class ApiClient {
  private token: string | null = null;
  private abortController: AbortController | null = null;

  setToken(token: string | null): void {
    this.token = token;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  private async request<T>(path: string, opts?: RequestInit): Promise<T> {
    const res = await fetch(path, {
      ...opts,
      headers: { ...this.headers(), ...(opts?.headers as Record<string, string>) },
    });
    if (!res.ok) {
      const body = await res.text();
      let message: string;
      try {
        message = JSON.parse(body).error || body;
      } catch {
        message = body;
      }
      throw new Error(message);
    }
    return res.json() as Promise<T>;
  }

  // ── Auth ──────────────────────────────────────────────────

  async login(username: string, password: string): Promise<{ token: string; user: User }> {
    return this.request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  }

  async getMe(): Promise<User> {
    const data = await this.request<{ user: User }>('/api/auth/me');
    return data.user;
  }

  // ── Chat (SSE streaming) ─────────────────────────────────

  async streamChat(
    message: string,
    tabContext: string,
    onText: (chunk: string) => void,
  ): Promise<void> {
    this.abortController = new AbortController();

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: this.headers(),
      signal: this.abortController.signal,
      body: JSON.stringify({ message, tabContext }),
    });

    if (!res.ok) {
      throw new Error(`Chat error ${res.status}: ${await res.text()}`);
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
          if (parsed.type === 'text' && parsed.content) {
            onText(parsed.content);
          }
          if (parsed.type === 'error') {
            throw new Error(parsed.error);
          }
        } catch (err) {
          if (err instanceof Error && err.message !== data) throw err;
          // skip malformed chunks
        }
      }
    }
  }

  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
  }

  // ── Calendar ─────────────────────────────────────────────

  async getCalendarEvents(): Promise<{ events: CalendarEvent[]; syncedAt: string | null }> {
    return this.request('/api/calendar/events');
  }

  async syncCalendar(): Promise<{ events: CalendarEvent[]; syncedAt: string }> {
    return this.request('/api/calendar/sync', { method: 'POST' });
  }

  // ── Tasks ────────────────────────────────────────────────

  async getTasks(): Promise<{ tasks: Task[]; syncedAt: string | null }> {
    return this.request('/api/tasks');
  }

  async syncTasks(): Promise<{ tasks: Task[]; syncedAt: string }> {
    return this.request('/api/tasks/sync', { method: 'POST' });
  }

  // ── Notes ────────────────────────────────────────────────

  async getNotes(): Promise<Note[]> {
    return this.request('/api/notes');
  }

  async createNote(title: string, content: string): Promise<Note> {
    return this.request('/api/notes', {
      method: 'POST',
      body: JSON.stringify({ title, content }),
    });
  }

  async updateNote(id: number, title: string, content: string): Promise<void> {
    await this.request(`/api/notes/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ title, content }),
    });
  }

  async deleteNote(id: number): Promise<void> {
    await this.request(`/api/notes/${id}`, { method: 'DELETE' });
  }

  // ── Users (admin) ────────────────────────────────────────

  async getUsers(): Promise<User[]> {
    return this.request('/api/users');
  }

  async createUser(data: {
    username: string;
    password: string;
    displayName: string;
    role: string;
  }): Promise<User> {
    return this.request('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateUser(id: number, data: { displayName?: string; role?: string; password?: string }): Promise<void> {
    await this.request(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteUser(id: number): Promise<void> {
    await this.request(`/api/users/${id}`, { method: 'DELETE' });
  }

  // ── Health ───────────────────────────────────────────────

  async ping(): Promise<boolean> {
    try {
      const res = await fetch('/api/health', {
        headers: this.headers(),
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}

export const api = new ApiClient();
