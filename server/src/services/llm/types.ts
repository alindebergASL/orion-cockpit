export interface LLMMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | LLMContentBlock[];
}

export type LLMContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string };

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
}

export type StreamChunk =
  | { type: 'text_delta'; text: string }
  | { type: 'tool_call'; id: string; name: string; args: Record<string, unknown> }
  | { type: 'done'; usage?: { input: number; output: number } };

export interface ChatOptions {
  messages: LLMMessage[];
  system?: string;
  tools?: ToolDefinition[];
  maxTokens?: number;
}

export interface LLMProvider {
  chat(opts: ChatOptions): AsyncIterable<StreamChunk>;
}
