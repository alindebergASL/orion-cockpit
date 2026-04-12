import { useEffect, useRef } from 'react';
import { Bot, User } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { ChatMessage } from '../../types';

interface Props {
  messages: ChatMessage[];
  streaming: boolean;
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-1">
      <div className="h-2 w-2 animate-bounce rounded-full bg-cyan-400 [animation-delay:0ms]" />
      <div className="h-2 w-2 animate-bounce rounded-full bg-cyan-400 [animation-delay:150ms]" />
      <div className="h-2 w-2 animate-bounce rounded-full bg-cyan-400 [animation-delay:300ms]" />
    </div>
  );
}

export function MessageList({ messages, streaming }: Props) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 text-slate-500 px-6">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-cyan-600/20">
          <Bot className="h-7 w-7 text-cyan-400" />
        </div>
        <div className="text-center">
          <p className="text-lg font-medium text-slate-300">Hey! How can I help you today?</p>
          <p className="mt-1.5 text-sm text-slate-600 max-w-md">
            I can check your schedule, manage tasks, create calendar events, or just chat. What's on your mind?
          </p>
        </div>
        <div className="flex flex-wrap justify-center gap-2 mt-2">
          <span className="rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-500">What's on my calendar today?</span>
          <span className="rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-500">Show my open tasks</span>
          <span className="rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-500">Create a reminder</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-4 py-4">
      <div className="mx-auto flex max-w-3xl flex-col gap-4">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          const isLastAssistant = !isUser && streaming && msg === messages[messages.length - 1];
          const isEmpty = !msg.content;

          return (
            <div
              key={msg.id}
              className={`flex gap-3 ${isUser ? 'justify-end' : ''}`}
            >
              {!isUser && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-cyan-600/20 text-cyan-400">
                  <Bot className="h-4 w-4" />
                </div>
              )}

              <div
                className={`max-w-[80%] rounded-xl px-4 py-2.5 text-sm leading-relaxed ${
                  isUser
                    ? 'bg-cyan-700/30 text-cyan-50 whitespace-pre-wrap'
                    : 'bg-slate-800 text-slate-200'
                }`}
              >
                {isUser ? (
                  msg.content
                ) : isEmpty && isLastAssistant ? (
                  <ThinkingIndicator />
                ) : (
                  <div className="prose prose-sm prose-invert max-w-none prose-p:my-1.5 prose-ul:my-1.5 prose-ol:my-1.5 prose-li:my-0.5 prose-pre:my-2 prose-pre:bg-slate-900 prose-pre:border prose-pre:border-slate-700 prose-code:text-cyan-300 prose-code:before:content-none prose-code:after:content-none prose-a:text-cyan-400 prose-strong:text-slate-100 prose-headings:text-slate-100 prose-headings:mt-3 prose-headings:mb-1.5">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {msg.content}
                    </ReactMarkdown>
                    {isLastAssistant && (
                      <span className="inline-block h-4 w-1.5 animate-pulse rounded bg-cyan-400 ml-0.5 align-middle" />
                    )}
                  </div>
                )}
              </div>

              {isUser && (
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-700 text-slate-300">
                  <User className="h-4 w-4" />
                </div>
              )}
            </div>
          );
        })}
        <div ref={endRef} />
      </div>
    </div>
  );
}
