import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, Trash2, MessageSquare, Search } from 'lucide-react';
import { useChat } from '../../hooks/useChat';
import { MessageList } from '../chat/MessageList';
import { MessageInput } from '../chat/MessageInput';
import { api } from '../../lib/api';
import type { Conversation } from '../../types';

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

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Conversation[] | null>(null);
  const [mobileHistoryOpen, setMobileHistoryOpen] = useState(false);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(null);

  const handleSearch = useCallback((q: string) => {
    setSearchQuery(q);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    if (!q.trim()) {
      setSearchResults(null);
      return;
    }
    searchTimeout.current = setTimeout(async () => {
      try {
        const results = await api.searchConversations(q);
        setSearchResults(results);
      } catch {
        setSearchResults([]);
      }
    }, 300);
  }, []);

  // Keyboard shortcut: Ctrl/Cmd+K to focus search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('chat-search')?.focus();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const displayConversations = searchResults ?? conversations;

  return (
    <div className="flex h-full">
      {/* Conversation sidebar */}
      <div className="hidden md:flex w-56 flex-col border-r border-th-border bg-th-surface">
        <div className="flex items-center justify-between border-b border-th-border px-3 py-3">
          <h3 className="text-xs font-semibold text-th-text-secondary">History</h3>
          <button
            onClick={newConversation}
            className="rounded-lg p-1.5 text-th-text-secondary hover:bg-th-elevated hover:text-cyan-400"
            title="New Chat"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="border-b border-th-border px-3 py-2">
          <div className="flex items-center gap-1.5 rounded-md border border-th-border bg-th-input px-2 py-1">
            <Search className="h-3 w-3 text-th-text-muted" />
            <input
              id="chat-search"
              value={searchQuery}
              onChange={(e) => handleSearch(e.target.value)}
              placeholder="Search... (Ctrl+K)"
              className="flex-1 bg-transparent text-base md:text-xs text-th-text outline-none placeholder-th-text-muted"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {displayConversations.length === 0 && !loadingHistory && (
            <div className="flex flex-col items-center gap-2 py-8 text-th-text-muted">
              <MessageSquare className="h-6 w-6" />
              <p className="text-[11px]">{searchQuery ? 'No results' : 'No conversations yet'}</p>
            </div>
          )}

          {displayConversations.map((conv) => (
            <button
              key={conv.id}
              onClick={() => { switchConversation(conv.id); setSearchQuery(''); setSearchResults(null); }}
              className={`group flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors ${
                activeConversationId === conv.id
                  ? 'bg-th-elevated text-th-text'
                  : 'text-th-text-secondary hover:bg-th-elevated/50 hover:text-th-text'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs">{conv.title}</p>
                <p className="text-[10px] text-th-text-muted">{timeAgo(conv.updatedAt)}</p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteConversation(conv.id);
                }}
                className="ml-1.5 shrink-0 rounded p-1 text-th-text-muted opacity-0 hover:text-red-400 group-hover:opacity-100"
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
        <div className="flex items-center justify-between border-b border-th-border px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-th-text">Chat</h2>
            <p className="text-xs text-th-text-muted">Talking to OpenClaw</p>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setMobileHistoryOpen(!mobileHistoryOpen)}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-th-text-secondary hover:bg-th-elevated md:hidden"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              History
            </button>
            <button
              onClick={newConversation}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-th-text-secondary hover:bg-th-elevated hover:text-cyan-400"
            >
              <Plus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">New Chat</span>
            </button>
          </div>
        </div>

        {/* Mobile conversation history */}
        {mobileHistoryOpen && (
          <div className="border-b border-th-border bg-th-surface max-h-64 overflow-y-auto md:hidden">
            <div className="border-b border-th-border px-3 py-2">
              <div className="flex items-center gap-1.5 rounded-md border border-th-border bg-th-input px-2 py-1.5">
                <Search className="h-3.5 w-3.5 text-th-text-muted" />
                <input
                  value={searchQuery}
                  onChange={(e) => handleSearch(e.target.value)}
                  placeholder="Search..."
                  className="flex-1 bg-transparent text-sm text-th-text outline-none placeholder-th-text-muted"
                />
              </div>
            </div>
            {displayConversations.map((conv) => (
              <button
                key={conv.id}
                onClick={() => { switchConversation(conv.id); setMobileHistoryOpen(false); setSearchQuery(''); setSearchResults(null); }}
                className={`flex w-full items-center gap-2 px-3 py-2.5 text-left ${
                  activeConversationId === conv.id ? 'bg-th-elevated text-th-text' : 'text-th-text-secondary'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm">{conv.title}</p>
                  <p className="text-xs text-th-text-muted">{timeAgo(conv.updatedAt)}</p>
                </div>
              </button>
            ))}
          </div>
        )}

        {loadingHistory ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-th-border-strong border-t-cyan-400" />
          </div>
        ) : (
          <>
            <MessageList messages={messages} streaming={streaming} onSuggestionClick={send} />
            <MessageInput onSend={send} onStop={stop} streaming={streaming} />
          </>
        )}
      </div>
    </div>
  );
}
