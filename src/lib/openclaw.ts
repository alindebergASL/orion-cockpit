import type { ChatMessage, CanvasEvent } from '../types';

export class OpenClawClient {
  private baseUrl: string;
  private token: string;
  private abortController: AbortController | null = null;

  constructor(baseUrl: string, token: string) {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
  }

  private headers(): Record<string, string> {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.token) h['Authorization'] = `Bearer ${this.token}`;
    return h;
  }

  /** Stream a chat completion via SSE. */
  async streamChat(
    messages: Pick<ChatMessage, 'role' | 'content'>[],
    onText: (chunk: string) => void,
    onCanvas?: (event: CanvasEvent) => void,
    sessionKey?: string,
  ): Promise<void> {
    this.abortController = new AbortController();

    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      signal: this.abortController.signal,
      body: JSON.stringify({
        messages: messages.map(({ role, content }) => ({ role, content })),
        stream: true,
        ...(sessionKey && { session_key: sessionKey }),
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
          const delta = parsed.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) onText(delta.content);

          if (delta.canvas && onCanvas) {
            onCanvas(delta.canvas as CanvasEvent);
          }
        } catch {
          // skip malformed SSE chunks
        }
      }
    }
  }

  /** Cancel an in-flight streaming request. */
  abort(): void {
    this.abortController?.abort();
    this.abortController = null;
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

  /** Quick health / connectivity check. */
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
}
