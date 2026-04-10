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

  /** Stream a chat completion from OpenClaw. */
  async streamChat(
    opts: OpenClawStreamOptions,
    onText: (chunk: string) => void,
  ): Promise<void> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        messages: opts.messages,
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
}

export const openclawClient = new OpenClawClient();
