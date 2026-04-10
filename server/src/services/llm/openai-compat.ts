import OpenAI from 'openai';
import type { LLMProvider, ChatOptions, StreamChunk, LLMMessage, LLMContentBlock } from './types.js';
import type { TierConfig } from '../../config.js';

export class OpenAICompatAdapter implements LLMProvider {
  private client: OpenAI;
  private model: string;

  constructor(config: TierConfig) {
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      defaultHeaders: config.headers,
    });
    this.model = config.model;
  }

  async *chat(opts: ChatOptions): AsyncIterable<StreamChunk> {
    const messages = this.convertMessages(opts.messages, opts.system);
    const tools = opts.tools?.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const stream = await this.client.chat.completions.create({
      model: this.model,
      max_tokens: opts.maxTokens ?? 4096,
      messages,
      tools: tools?.length ? tools : undefined,
      stream: true,
    });

    // Track tool calls being assembled from deltas
    const toolCalls = new Map<number, { id: string; name: string; args: string }>();
    let inputTokens = 0;
    let outputTokens = 0;

    for await (const chunk of stream) {
      const choice = chunk.choices?.[0];
      if (!choice) continue;

      const delta = choice.delta;

      // Text content
      if (delta?.content) {
        yield { type: 'text_delta', text: delta.content };
      }

      // Tool call deltas
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index;
          if (!toolCalls.has(idx)) {
            toolCalls.set(idx, { id: tc.id || '', name: tc.function?.name || '', args: '' });
          }
          const entry = toolCalls.get(idx)!;
          if (tc.id) entry.id = tc.id;
          if (tc.function?.name) entry.name = tc.function.name;
          if (tc.function?.arguments) entry.args += tc.function.arguments;
        }
      }

      // Token usage in final chunk
      if (chunk.usage) {
        inputTokens = chunk.usage.prompt_tokens;
        outputTokens = chunk.usage.completion_tokens;
      }

      // When choice finishes, emit assembled tool calls
      if (choice.finish_reason === 'tool_calls' || choice.finish_reason === 'stop') {
        for (const [, tc] of toolCalls) {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(tc.args || '{}');
          } catch { /* empty args */ }
          yield { type: 'tool_call', id: tc.id, name: tc.name, args };
        }
        toolCalls.clear();
      }
    }

    yield { type: 'done', usage: { input: inputTokens, output: outputTokens } };
  }

  private convertMessages(messages: LLMMessage[], system?: string): OpenAI.ChatCompletionMessageParam[] {
    const result: OpenAI.ChatCompletionMessageParam[] = [];

    if (system) {
      result.push({ role: 'system', content: system });
    }

    for (const m of messages) {
      if (m.role === 'system') {
        result.push({ role: 'system', content: typeof m.content === 'string' ? m.content : '' });
        continue;
      }

      if (typeof m.content === 'string') {
        result.push({ role: m.role, content: m.content });
        continue;
      }

      // Handle content blocks (tool use / tool result)
      if (m.role === 'assistant') {
        const textParts = m.content.filter((b): b is Extract<LLMContentBlock, { type: 'text' }> => b.type === 'text');
        const toolParts = m.content.filter((b): b is Extract<LLMContentBlock, { type: 'tool_use' }> => b.type === 'tool_use');
        result.push({
          role: 'assistant',
          content: textParts.map((t) => t.text).join('') || null,
          tool_calls: toolParts.length
            ? toolParts.map((t) => ({
                id: t.id,
                type: 'function' as const,
                function: { name: t.name, arguments: JSON.stringify(t.input) },
              }))
            : undefined,
        });
      } else if (m.role === 'user') {
        // Tool results go as separate "tool" role messages in OpenAI format
        for (const block of m.content) {
          if (block.type === 'tool_result') {
            result.push({
              role: 'tool',
              tool_call_id: block.tool_use_id,
              content: block.content,
            });
          } else if (block.type === 'text') {
            result.push({ role: 'user', content: block.text });
          }
        }
      }
    }

    return result;
  }
}
