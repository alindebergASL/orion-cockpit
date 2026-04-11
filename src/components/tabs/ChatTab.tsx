import { Plus, Trash2, MessageSquare } from 'lucide-react';
import { useChat } from '../../hooks/useChat';
import { MessageList } from '../chat/MessageList';
import { MessageInput } from '../chat/MessageInput';

function timeAgo(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ChatTab() {
  const {
    messages,
    conversations,
    activeConversationId,
    streaming,
    loadingHistory,
    send,
    stop,
    newConversation,
    switchConversation,
    deleteConversation,
  } = useChat('chat');

  return (
    <div className="flex h-full">
      {/* Conversation sidebar */}
      <div className="flex w-56 flex-col border-r border-slate-800 bg-slate-900/50">
        <div className="flex items-center justify-between border-b border-slate-800 px-3 py-3">
          <h3 className="text-xs font-semibold text-slate-400">History</h3>
          <button
            onClick={newConversation}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-cyan-400"
            title="New Chat"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && !loadingHistory && (
            <div className="flex flex-col items-center gap-2 py-8 text-slate-600">
              <MessageSquare className="h-6 w-6" />
              <p className="text-[11px]">No conversations yet</p>
            </div>
          )}

          {conversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => switchConversation(conv.id)}
              className={`group flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors ${
                activeConversationId === conv.id
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-300'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs">{conv.title}</p>
                <p className="text-[10px] text-slate-600">{timeAgo(conv.updatedAt)}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteConversation(conv.id);
                }}
                className="ml-1.5 shrink-0 rounded p-1 text-slate-700 opacity-0 hover:text-red-400 group-hover:opacity-100"
                title="Delete"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </button>
          ))}
        </div>
      </div>

      {/* Chat panel */}
      <div className="flex flex-1 flex-col">
        {/* Chat header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Chat</h2>
            <p className="text-xs text-slate-500">Talking to OpenClaw</p>
          </div>
          <button
            onClick={newConversation}
            className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-cyan-400"
          >
            <Plus className="h-3.5 w-3.5" />
            New Chat
          </button>
        </div>

        {loadingHistory ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400" />
          </div>
        ) : (
          <>
            <MessageList messages={messages} streaming={streaming} />
            <MessageInput onSend={send} onStop={stop} streaming={streaming} />
          </>
        )}
      </div>
    </div>
  );
}
