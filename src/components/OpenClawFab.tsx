import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import type { TabId } from '../types';
import { useChat } from '../hooks/useChat';
import { MessageList } from './chat/MessageList';
import { MessageInput } from './chat/MessageInput';

interface Props {
  activeTab: TabId;
}

const SUGGESTIONS_BY_TAB: Record<TabId, string[]> = {
  today: [
    "What's my day looking like?",
    'Summarize my week so far',
    'What should I focus on right now?',
  ],
  chat: [
    "What's on my calendar today?",
    'Show my open tasks',
    'Create a reminder',
  ],
  calendar: [
    'Am I free tomorrow afternoon?',
    "What's my busiest day this week?",
    'Block 2 hours for focus work',
  ],
  tasks: [
    'What should I do next?',
    'Which tasks are overdue?',
    'Group my tasks by priority',
  ],
  notes: [
    'Summarize my recent notes',
    'What are the themes in my notes?',
    'Find a note about…',
  ],
  projects: [
    'Which project needs attention?',
    "What's blocking my projects?",
    'Generate tasks for my active project',
  ],
};

const TAB_CONTEXT_LABELS: Record<TabId, string> = {
  today: 'today',
  chat: 'general',
  calendar: 'calendar',
  tasks: 'tasks',
  notes: 'notes',
  projects: 'projects',
};

export function OpenClawFab({ activeTab }: Props) {
  const [open, setOpen] = useState(false);
  // Chat contextualized to the active tab so OpenClaw knows what you're looking at
  const chat = useChat(`fab-${TAB_CONTEXT_LABELS[activeTab]}`);

  return (
    <>
      {/* Floating button */}
      {!open && (
        <button
          onClick={() => setOpen(true)}
          className="fixed bottom-4 right-4 md:bottom-6 md:right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-cyan-600 text-white shadow-xl hover:bg-cyan-500 transition-all hover:scale-105 active:scale-95"
          title="Ask OpenClaw"
          aria-label="Ask OpenClaw"
        >
          <Sparkles className="h-5 w-5" />
        </button>
      )}

      {/* Panel */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-end sm:justify-end sm:bg-transparent sm:p-4 md:p-6">
          <div
            className="flex h-[80vh] w-full flex-col rounded-t-2xl border-t border-th-border-strong bg-th-surface shadow-2xl sm:h-[560px] sm:w-96 sm:rounded-2xl sm:border"
          >
            <div className="flex items-center justify-between border-b border-th-border px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-cyan-600/20 text-cyan-400">
                  <Sparkles className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-th-text">OpenClaw</p>
                  <p className="text-[10px] text-th-text-muted">
                    In context: {TAB_CONTEXT_LABELS[activeTab]}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="rounded p-1.5 text-th-text-secondary hover:bg-th-elevated hover:text-th-text"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <MessageList
              messages={chat.messages}
              streaming={chat.streaming}
              suggestions={SUGGESTIONS_BY_TAB[activeTab]}
              onSuggestionClick={chat.send}
            />
            <MessageInput
              onSend={chat.send}
              onStop={chat.stop}
              streaming={chat.streaming}
              placeholder={`Ask about ${TAB_CONTEXT_LABELS[activeTab]}...`}
            />
          </div>
        </div>
      )}
    </>
  );
}
