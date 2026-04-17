import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Search,
  X,
  CalendarDays,
  ListChecks,
  StickyNote,
  BookOpen,
  MessageSquare,
  Lightbulb,
  Hash,
  AtSign,
} from 'lucide-react';
import type { SearchResult } from '../types';
import { api } from '../lib/api';

interface Props {
  onClose: () => void;
  onNavigate: (tab: string, meta?: Record<string, unknown>) => void;
}

const typeIcons: Record<string, React.FC<{ className?: string }>> = {
  event: CalendarDays,
  task: ListChecks,
  note: StickyNote,
  journal: BookOpen,
  chat: MessageSquare,
  insight: Lightbulb,
};

const typeLabels: Record<string, string> = {
  event: 'Calendar',
  task: 'Task',
  note: 'Note',
  journal: 'Journal',
  chat: 'Chat',
  insight: 'Insight',
};

const typeColors: Record<string, string> = {
  event: 'text-cyan-400',
  task: 'text-amber-400',
  note: 'text-emerald-400',
  journal: 'text-purple-400',
  chat: 'text-blue-400',
  insight: 'text-yellow-400',
};

function highlightMatch(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-cyan-600/30 text-th-text rounded px-0.5">{text.slice(idx, idx + query.length)}</mark>
      {text.slice(idx + query.length)}
    </>
  );
}

export function SearchPalette({ onClose, onNavigate }: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [mentions, setMentions] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const doSearch = useCallback((q: string) => {
    if (!q.trim()) {
      setResults([]);
      setTags([]);
      setMentions([]);
      return;
    }

    setLoading(true);
    if (searchTimeout.current) clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      try {
        let data;
        if (q.startsWith('#')) {
          data = await api.searchByTag(q.slice(1));
        } else if (q.startsWith('@')) {
          data = await api.searchByMention(q.slice(1));
        } else {
          data = await api.globalSearch(q);
        }
        setResults(data.results);
        setTags(data.tags);
        setMentions(data.mentions);
        setSelectedIndex(0);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 200);
  }, []);

  useEffect(() => {
    doSearch(query);
  }, [query, doSearch]);

  const handleSelect = useCallback((result: SearchResult) => {
    switch (result.type) {
      case 'event':
        onNavigate('calendar');
        break;
      case 'task':
        onNavigate('tasks');
        break;
      case 'note':
        onNavigate('notes');
        break;
      case 'journal':
        onNavigate('today');
        break;
      case 'chat':
        onNavigate('chat', result.meta || undefined);
        break;
      case 'insight':
        onNavigate('today');
        break;
    }
    onClose();
  }, [onNavigate, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && results[selectedIndex]) {
      handleSelect(results[selectedIndex]);
    }
  }, [results, selectedIndex, onClose, handleSelect]);

  // Group results by type
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    (acc[r.type] = acc[r.type] || []).push(r);
    return acc;
  }, {});

  let flatIndex = 0;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/50" onClick={onClose}>
      <div
        className="w-11/12 max-w-xl rounded-xl border border-th-border-strong bg-th-surface shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 border-b border-th-border px-4 py-3">
          <Search className="h-5 w-5 text-th-text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search everything... (try #tag or @person)"
            className="flex-1 bg-transparent text-base text-th-text outline-none placeholder-th-text-muted"
          />
          {query && (
            <button onClick={() => setQuery('')} className="text-th-text-muted hover:text-th-text">
              <X className="h-4 w-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-block rounded border border-th-border px-1.5 py-0.5 text-[10px] text-th-text-muted">ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[50vh] overflow-y-auto">
          {!query && (
            <div className="px-4 py-8 text-center text-sm text-th-text-muted">
              Search across calendar, tasks, notes, journal, and chat history
            </div>
          )}

          {query && results.length === 0 && !loading && (
            <div className="px-4 py-8 text-center text-sm text-th-text-muted">
              No results for "{query}"
            </div>
          )}

          {/* Tags and mentions found */}
          {(tags.length > 0 || mentions.length > 0) && (
            <div className="flex flex-wrap gap-1.5 border-b border-th-border px-4 py-2.5">
              {tags.map((t) => (
                <button
                  key={`tag-${t}`}
                  onClick={() => setQuery(`#${t}`)}
                  className="flex items-center gap-1 rounded-full bg-cyan-600/10 px-2.5 py-1 text-xs text-cyan-400 hover:bg-cyan-600/20"
                >
                  <Hash className="h-3 w-3" />{t}
                </button>
              ))}
              {mentions.map((m) => (
                <button
                  key={`mention-${m}`}
                  onClick={() => setQuery(`@${m}`)}
                  className="flex items-center gap-1 rounded-full bg-purple-600/10 px-2.5 py-1 text-xs text-purple-400 hover:bg-purple-600/20"
                >
                  <AtSign className="h-3 w-3" />{m}
                </button>
              ))}
            </div>
          )}

          {/* Grouped results */}
          {Object.entries(grouped).map(([type, items]) => {
            const Icon = typeIcons[type] || Search;
            const color = typeColors[type] || 'text-th-text-secondary';

            return (
              <div key={type}>
                <div className="px-4 pt-3 pb-1">
                  <span className={`text-[10px] font-semibold uppercase tracking-wider ${color}`}>
                    {typeLabels[type] || type} ({items.length})
                  </span>
                </div>
                {items.map((result) => {
                  const idx = flatIndex++;
                  const isSelected = idx === selectedIndex;
                  return (
                    <button
                      key={`${result.type}-${result.id}`}
                      onClick={() => handleSelect(result)}
                      className={`flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors ${
                        isSelected ? 'bg-th-elevated' : 'hover:bg-th-elevated/50'
                      }`}
                    >
                      <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-th-text truncate">
                          {highlightMatch(result.title, query.replace(/^[#@]/, ''))}
                        </p>
                        <p className="text-xs text-th-text-muted truncate">
                          {highlightMatch(result.snippet, query.replace(/^[#@]/, ''))}
                        </p>
                      </div>
                      {result.date && (
                        <span className="shrink-0 text-[10px] text-th-text-muted mt-0.5">
                          {new Date(result.date).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
