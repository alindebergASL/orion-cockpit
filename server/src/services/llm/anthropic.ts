import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider, ChatOptions, StreamChunk, LLMMessage } from './types.js';
import type { TierConfig } from '../../config.js';

export class AnthropicAdapter implements LLMProvider {
  private client: Anthropic;
  private model: string;

  constructor(config: TierConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey });
    this.model = config.model;
  }

  async *chat(opts: ChatOptions): AsyncIterable<StreamChunk> {
    const messages = this.convertMessages(opts.messages);

    const stream = this.client.messages.stream({
      model: this.model,
      max_tokens: opts.maxTokens ?? 4096,
      system: opts.system ?? '',
      messages,
      tools: opts.tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters as Anthropic.Tool['input_schema'],
      })),
    });

    let inputTokens = 0;
    let outputTokens = 0;

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          yield { type: 'text_delta', text: event.delta.text };
        } else if (event.delta.type === 'input_json_delta') {
          // Tool input arrives as JSON deltas — accumulated by the SDK
        }
      } else if (event.type === 'content_block_stop') {
        // Check if completed block is a tool_use
        const msg = stream.currentMessage;
        if (msg) {
          const block = msg.content[event.index];
          if (block?.type === 'tool_use') {
            yield {
              type: 'tool_call',
              id: block.id,
              name: block.name,
              args: block.input as Record<string, unknown>,
            };
          }
        }
      } else if (event.type === 'message_delta') {
        // Final usage stats
      } else if (event.type === 'message_start' && event.message.usage) {
        inputTokens = event.message.usage.input_tokens;
      }
    }

    const finalMsg = await stream.finalMessage();
    outputTokens = finalMsg.usage.output_tokens;
    inputTokens = finalMsg.usage.input_tokens;

    yield { type: 'done', usage: { input: inputTokens, output: outputTokens } };
  }

  private convertMessages(messages: LLMMessage[]): Anthropic.MessageParam[] {
    return messages
      .filter((m) => m.role !== 'system')
      .map((m) => {
        if (typeof m.content === 'string') {
          return { role: m.role as 'user' | 'assistant', content: m.content };
        }
        // Convert content blocks
        const blocks: Anthropic.ContentBlockParam[] = m.content.map((b) => {
          if (b.type === 'text') return { type: 'text' as const, text: b.text };
          if (b.type === 'tool_use') {
            return {
              type: 'tool_use' as const,
              id: b.id,
              name: b.name,
              input: b.input,
            };
          }
          if (b.type === 'tool_result') {
            return {
              type: 'tool_result' as const,
              tool_use_id: b.tool_use_id,
              content: b.content,
            };
          }
          return { type: 'text' as const, text: '' };
        });
        return { role: m.role as 'user' | 'assistant', content: blocks };
      });
  }
}
