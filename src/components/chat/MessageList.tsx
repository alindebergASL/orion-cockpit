import { useEffect, useRef } from 'react';
import { Bot, User } from 'lucide-react';
import type { ChatMessage } from '../../types';

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
}

export function MessageList({ messages, streaming }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-500">
        <Bot className="h-12 w-12" />
        <p className="text-lg">Start a conversation with OpenClaw</p>
        <p className="text-sm text-slate-600">Your AI agent is ready.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : ''}`}
          >
            {msg.role === 'assistant' && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-600/20 text-cyan-400">
                <Bot className="h-4 w-4" />
              </div>
            )}

            <div
              className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-cyan-700/30 text-cyan-50'
                  : 'bg-slate-800 text-slate-200'
              }`}
            >
              {msg.content}
              {msg.role === 'assistant' && streaming && msg === messages[messages.length - 1] && !msg.content && (
                <span className="inline-block h-4 w-1.5 animate-pulse rounded bg-cyan-400" />
              )}
            </div>

            {msg.role === 'user' && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-700 text-slate-300">
                <User className="h-4 w-4" />
              </div>
            )}
          </div>
        ))}
        <div ref={endRef} />
      </div>
    </div>
  );
}
