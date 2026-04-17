import type { User, CalendarEvent, Task, Note, Conversation, Insight, SearchResult } from '../types';

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
    conversationId?: number,
    onConversationId?: (id: number) => void,
  ): Promise<void> {
    this.abortController = new AbortController();

    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: this.headers(),
      signal: this.abortController.signal,
      body: JSON.stringify({ message, tabContext, conversationId }),
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
          if (parsed.type === 'conversation' && parsed.conversationId && onConversationId) {
            onConversationId(parsed.conversationId);
          }
          if (parsed.type === 'text' && parsed.content) {
            onText(parsed.content);
          }
          if (parsed.type === 'tool_result') {
            window.dispatchEvent(new CustomEvent('orion-data-changed'));
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

  async createCalendarEvent(data: {
    title: string;
    start: string;
    end: string;
    calendar?: string;
    location?: string;
    description?: string;
    allDay?: boolean;
  }): Promise<{ events: CalendarEvent[]; syncedAt: string }> {
    return this.request('/api/calendar/events', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  // ── Tasks ────────────────────────────────────────────────

  async getTasks(): Promise<{ tasks: Task[]; syncedAt: string | null }> {
    return this.request('/api/tasks');
  }

  async syncTasks(): Promise<{ tasks: Task[]; syncedAt: string }> {
    return this.request('/api/tasks/sync', { method: 'POST' });
  }

  async createTask(title: string): Promise<Task> {
    return this.request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({ title }),
    });
  }

  async updateTaskStatus(id: number | string, status: string): Promise<void> {
    await this.request(`/api/tasks/${encodeURIComponent(id)}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
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

  // ── Settings ──────────────────────────────────────────────

  async getSettings(): Promise<Record<string, unknown>> {
    return this.request('/api/settings');
  }

  async updateSetting(key: string, value: unknown): Promise<void> {
    await this.request(`/api/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ value }),
    });
  }

  async getAvailableCalendars(): Promise<{ id: string; name: string }[]> {
    return this.request('/api/settings/calendars');
  }

  async getAvailableTaskLists(): Promise<{ id: string; name: string }[]> {
    return this.request('/api/settings/task-lists');
  }

  // ── Conversations ────────────────────────────────────────

  async getConversations(tab = 'chat', limit = 5): Promise<Conversation[]> {
    return this.request(`/api/conversations?tab=${tab}&limit=${limit}`);
  }

  async createConversation(tab = 'chat'): Promise<Conversation> {
    return this.request('/api/conversations', {
      method: 'POST',
      body: JSON.stringify({ tab }),
    });
  }

  async getConversationMessages(id: number): Promise<{ role: string; content: string; timestamp: string }[]> {
    return this.request(`/api/conversations/${id}/messages`);
  }

  async searchConversations(query: string): Promise<Conversation[]> {
    return this.request(`/api/conversations/search?q=${encodeURIComponent(query)}`);
  }

  async deleteConversation(id: number): Promise<void> {
    await this.request(`/api/conversations/${id}`, { method: 'DELETE' });
  }

  // ── Search ────────────────────────────────────────────────

  async globalSearch(query: string): Promise<{
    results: SearchResult[];
    tags: string[];
    mentions: string[];
  }> {
    return this.request(`/api/search?q=${encodeURIComponent(query)}`);
  }

  async searchByTag(tag: string): Promise<{ results: SearchResult[]; tags: string[]; mentions: string[] }> {
    return this.request(`/api/search?tag=${encodeURIComponent(tag)}`);
  }

  async searchByMention(mention: string): Promise<{ results: SearchResult[]; tags: string[]; mentions: string[] }> {
    return this.request(`/api/search?mention=${encodeURIComponent(mention)}`);
  }

  // ── Daily Notes ──────────────────────────────────────────

  async getDailyNote(date: string): Promise<{ date: string; content: string; updatedAt: string | null }> {
    return this.request(`/api/daily-notes/${date}`);
  }

  async saveDailyNote(date: string, content: string): Promise<void> {
    await this.request(`/api/daily-notes/${date}`, {
      method: 'PUT',
      body: JSON.stringify({ content }),
    });
  }

  // ── Insights ──────────────────────────────────────────────

  async getInsights(): Promise<{ insights: Insight[]; unreadCount: number }> {
    return this.request('/api/insights');
  }

  async markInsightRead(id: number): Promise<void> {
    await this.request(`/api/insights/${id}/read`, { method: 'POST' });
  }

  async markAllInsightsRead(): Promise<void> {
    await this.request('/api/insights/read-all', { method: 'POST' });
  }

  async actOnInsight(id: number): Promise<void> {
    await this.request(`/api/insights/${id}/act`, { method: 'POST' });
  }

  async dismissInsight(id: number): Promise<void> {
    await this.request(`/api/insights/${id}`, { method: 'DELETE' });
  }

  // ── Activity ─────────────────────────────────────────────

  async logActivity(action: string, details?: Record<string, unknown>): Promise<void> {
    await this.request('/api/activity', {
      method: 'POST',
      body: JSON.stringify({ action, details }),
    });
  }

  // ── Weather ───────────────────────────────────────────────

  async getWeather(): Promise<{
    current: { tempF: string; description: string; humidity: string; feelsLikeF: string };
    today: { maxTempF: string; minTempF: string; description?: string };
    tomorrow: { maxTempF: string; minTempF: string; description?: string };
    location: string;
  }> {
    return this.request('/api/weather');
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
