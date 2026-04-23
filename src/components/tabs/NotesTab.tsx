import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  Plus,
  Trash2,
  FileText,
  Pin,
  Hash,
  FolderOpen,
  Search,
  Eye,
  Pencil,
  X,
  ChevronDown,
  ChevronRight,
  Palette,
  Sparkles,
  ChevronLeft,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Note } from '../../types';
import { api } from '../../lib/api';
import { trackActivity } from '../../lib/activity';
import { showToast, showUndoToast } from '../Toast';

const NOTE_COLORS = [
  { name: 'none', hex: '' },
  { name: 'red', hex: '#ef4444' },
  { name: 'orange', hex: '#f97316' },
  { name: 'amber', hex: '#f59e0b' },
  { name: 'emerald', hex: '#10b981' },
  { name: 'cyan', hex: '#06b6d4' },
  { name: 'blue', hex: '#3b82f6' },
  { name: 'purple', hex: '#8b5cf6' },
  { name: 'pink', hex: '#ec4899' },
] as const;

export function NotesTab() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewMode, setPreviewMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterFolder, setFilterFolder] = useState<string>('all');
  const [filterTag, setFilterTag] = useState<string>('all');
  const [tagInput, setTagInput] = useState('');
  const [folderInput, setFolderInput] = useState('');
  const [showFolderInput, setShowFolderInput] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [collapsedFolders, setCollapsedFolders] = useState<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
  const activeIdRef = useRef<number | null>(null);

  useEffect(() => {
    api.getNotes()
      .then((data) => {
        setNotes(data);
        if (data.length > 0 && data[0]) setActiveId(data[0].id);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const activeNote = notes.find((n) => n.id === activeId);

  // Derived: folders and tags from notes data
  const folders = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) { if (n.folder) set.add(n.folder); }
    return [...set].sort();
  }, [notes]);

  const allTags = useMemo(() => {
    const set = new Set<string>();
    for (const n of notes) { for (const t of n.tags) set.add(t); }
    return [...set].sort();
  }, [notes]);

  // Filtered notes
  const filteredNotes = useMemo(() => {
    let result = [...notes];
    if (filterFolder !== 'all') {
      if (filterFolder === 'unfiled') result = result.filter((n) => !n.folder);
      else result = result.filter((n) => n.folder === filterFolder);
    }
    if (filterTag !== 'all') result = result.filter((n) => n.tags.includes(filterTag));
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter((n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q));
    }
    // Pinned first, then by updatedAt
    result.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
    });
    return result;
  }, [notes, filterFolder, filterTag, searchQuery]);

  // Grouped by folder
  const groupedNotes = useMemo(() => {
    if (filterFolder !== 'all') return null;
    const pinned = filteredNotes.filter((n) => n.isPinned);
    const unfiled = filteredNotes.filter((n) => !n.isPinned && !n.folder);
    const folderGroups: Record<string, Note[]> = {};
    for (const n of filteredNotes) {
      if (n.isPinned || !n.folder) continue;
      (folderGroups[n.folder] ??= []).push(n);
    }
    return { pinned, unfiled, folders: folderGroups };
  }, [filteredNotes, filterFolder]);

  const createNote = useCallback(async () => {
    try {
      const folder = filterFolder !== 'all' && filterFolder !== 'unfiled' ? filterFolder : undefined;
      const note = await api.createNote('Untitled', '', { folder });
      setNotes((prev) => [note, ...prev]);
      setActiveId(note.id);
      setPreviewMode(false);
      trackActivity('note_created', { noteId: note.id });
    } catch {
      showToast('Failed to create note', 'error');
    }
  }, [filterFolder]);

  const deleteNote = useCallback((id: number) => {
    const noteToDelete = notes.find((n) => n.id === id);
    if (!noteToDelete) return;

    // Optimistic removal + undo window
    setNotes((prev) => prev.filter((n) => n.id !== id));
    if (activeId === id) setActiveId(null);

    let undone = false;
    showUndoToast(
      `Deleted "${noteToDelete.title || 'Untitled'}"`,
      () => {
        undone = true;
        setNotes((prev) => [noteToDelete, ...prev].sort((a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        ));
      },
      {
        onExpire: async () => {
          if (undone) return;
          try {
            await api.deleteNote(id);
          } catch {
            // Restore on failure
            setNotes((prev) => [noteToDelete, ...prev]);
            showToast('Failed to delete note', 'error');
          }
        },
      },
    );
  }, [activeId, notes]);

  const updateField = useCallback((field: string, value: unknown) => {
    if (activeId === null) return;
    setNotes((prev) => prev.map((n) => n.id === activeId ? { ...n, [field]: value, updatedAt: new Date().toISOString() } as Note : n));
    const id = activeIdRef.current;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (id) api.updateNote(id, { [field]: value } as Record<string, unknown>).catch(() => {});
    }, 300);
  }, [activeId]);

  const togglePin = useCallback(() => {
    if (!activeNote) return;
    const next = !activeNote.isPinned;
    setNotes((prev) => prev.map((n) => n.id === activeId ? { ...n, isPinned: next } : n));
    if (activeId) api.updateNote(activeId, { isPinned: next }).catch(() => {});
  }, [activeNote, activeId]);

  const addTag = useCallback(() => {
    if (!activeNote || !tagInput.trim()) return;
    const tag = tagInput.trim().replace(/^#/, '');
    if (activeNote.tags.includes(tag)) { setTagInput(''); return; }
    const newTags = [...activeNote.tags, tag];
    updateField('tags', newTags);
    setTagInput('');
  }, [activeNote, tagInput, updateField]);

  const removeTag = useCallback((tag: string) => {
    if (!activeNote) return;
    updateField('tags', activeNote.tags.filter((t) => t !== tag));
  }, [activeNote, updateField]);

  const setFolder = useCallback((folder: string | null) => {
    updateField('folder', folder);
    setShowFolderInput(false);
    setFolderInput('');
  }, [updateField]);

  const createAndSetFolder = useCallback(() => {
    if (!folderInput.trim()) return;
    setFolder(folderInput.trim());
  }, [folderInput, setFolder]);

  const setColor = useCallback((color: string | null) => {
    updateField('color', color);
    setShowColorPicker(false);
  }, [updateField]);

  const toggleFolder = useCallback((folder: string) => {
    setCollapsedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder); else next.add(folder);
      return next;
    });
  }, []);

  // Word count
  const wordCount = activeNote ? activeNote.content.split(/\s+/).filter(Boolean).length : 0;

  // AI features
  const [aiLoading, setAiLoading] = useState<'summarize' | 'expand' | null>(null);
  const [aiResult, setAiResult] = useState<{ type: 'summary' | 'expanded'; text: string } | null>(null);
  const [showAiMenu, setShowAiMenu] = useState(false);

  const handleAiSummarize = useCallback(async () => {
    if (!activeNote) return;
    setAiLoading('summarize');
    setAiResult({ type: 'summary', text: '' });
    setShowAiMenu(false);
    try {
      await api.aiSummarizeNote(activeNote.id, (chunk) => {
        setAiResult((prev) => prev ? { ...prev, text: prev.text + chunk } : null);
      });
    } catch {
      showToast('Failed to summarize note', 'error');
      setAiResult(null);
    } finally {
      setAiLoading(null);
    }
  }, [activeNote]);

  const handleAiAutoTag = useCallback(async () => {
    if (!activeNote) return;
    setShowAiMenu(false);
    try {
      const result = await api.aiSuggestTags(activeNote.id);
      if (result.tags && result.tags.length > 0) {
        const newTags = [...new Set([...activeNote.tags, ...result.tags])];
        updateField('tags', newTags);
        showToast(`Added ${result.tags.length} tags`, 'success');
      } else {
        showToast('No tags suggested', 'info');
      }
    } catch {
      showToast('Failed to suggest tags', 'error');
    }
  }, [activeNote, updateField]);

  const handleAiExpand = useCallback(async () => {
    if (!activeNote) return;
    setAiLoading('expand');
    setAiResult({ type: 'expanded', text: '' });
    setShowAiMenu(false);
    try {
      await api.aiExpandNote(activeNote.id, (chunk) => {
        setAiResult((prev) => prev ? { ...prev, text: prev.text + chunk } : null);
      });
    } catch {
      showToast('Failed to expand note', 'error');
      setAiResult(null);
    } finally {
      setAiLoading(null);
    }
  }, [activeNote]);

  const replaceWithAiResult = useCallback(() => {
    if (!aiResult || !activeNote) return;
    updateField('content', aiResult.text);
    setAiResult(null);
  }, [aiResult, activeNote, updateField]);

  const appendAiResult = useCallback(() => {
    if (!aiResult || !activeNote) return;
    const separator = activeNote.content.trim() ? '\n\n' : '';
    updateField('content', activeNote.content + separator + aiResult.text);
    setAiResult(null);
  }, [aiResult, activeNote, updateField]);

  // Cmd+N new note handler
  useEffect(() => {
    const handler = (e: Event) => {
      if ((e as CustomEvent).detail?.tab === 'notes') createNote();
    };
    window.addEventListener('orion-new-item', handler);
    return () => window.removeEventListener('orion-new-item', handler);
  }, [createNote]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-th-border-strong border-t-cyan-400" />
      </div>
    );
  }

  const renderSidebarNote = (note: Note) => (
    <button
      key={note.id}
      onClick={() => { setActiveId(note.id); setPreviewMode(false); }}
      className={`group flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors ${
        activeId === note.id ? 'bg-th-input text-th-text' : 'text-th-text-secondary hover:bg-th-elevated/50'
      }`}
      style={{ borderLeftWidth: note.color ? '3px' : '0', borderLeftColor: note.color || undefined }}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {note.isPinned && <Pin className="h-3 w-3 text-amber-400 shrink-0" />}
          <p className="truncate text-sm">{note.title || 'Untitled'}</p>
        </div>
        <p className="truncate text-xs text-th-text-muted mt-0.5">
          {note.content.slice(0, 50) || 'Empty note'}
        </p>
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
        className="shrink-0 rounded p-1 text-th-text-muted opacity-0 hover:text-red-400 group-hover:opacity-100"
      >
        <Trash2 className="h-3 w-3" />
      </button>
    </button>
  );

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Sidebar */}
      <div className={`${activeId !== null ? 'hidden md:flex' : 'flex'} w-full md:w-72 flex-col border-b md:border-b-0 md:border-r border-th-border bg-th-surface`}>
        <div className="flex items-center justify-between border-b border-th-border px-3 py-3">
          <h2 className="text-sm font-semibold text-th-text">Notes</h2>
          <button onClick={createNote} className="rounded-lg p-1.5 text-th-text-secondary hover:bg-th-elevated hover:text-cyan-400">
            <Plus className="h-4 w-4" />
          </button>
        </div>

        {/* Search */}
        <div className="flex items-center gap-2 border-b border-th-border px-3 py-2">
          <Search className="h-3.5 w-3.5 text-th-text-muted shrink-0" />
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes..."
            className="flex-1 bg-transparent text-xs text-th-text outline-none placeholder-th-text-muted"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="text-th-text-muted hover:text-th-text-secondary">
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* Folder + tag filters */}
        <div className="border-b border-th-border px-3 py-1.5 space-y-1">
          <div className="flex items-center gap-1 flex-wrap">
            <FolderOpen className="h-3 w-3 text-th-text-muted shrink-0" />
            <button onClick={() => setFilterFolder('all')} className={`rounded px-1.5 py-0.5 text-[10px] ${filterFolder === 'all' ? 'bg-th-accent-soft text-th-accent-text' : 'text-th-text-muted hover:text-th-text-secondary'}`}>All</button>
            {folders.map((f) => (
              <button key={f} onClick={() => setFilterFolder(f)} className={`rounded px-1.5 py-0.5 text-[10px] ${filterFolder === f ? 'bg-th-accent-soft text-th-accent-text' : 'text-th-text-muted hover:text-th-text-secondary'}`}>{f}</button>
            ))}
            <button onClick={() => setFilterFolder('unfiled')} className={`rounded px-1.5 py-0.5 text-[10px] ${filterFolder === 'unfiled' ? 'bg-th-accent-soft text-th-accent-text' : 'text-th-text-muted hover:text-th-text-secondary'}`}>Unfiled</button>
          </div>
          {allTags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <Hash className="h-3 w-3 text-th-text-muted shrink-0" />
              <button onClick={() => setFilterTag('all')} className={`rounded px-1.5 py-0.5 text-[10px] ${filterTag === 'all' ? 'bg-th-accent-soft text-th-accent-text' : 'text-th-text-muted hover:text-th-text-secondary'}`}>All</button>
              {allTags.map((t) => (
                <button key={t} onClick={() => setFilterTag(t)} className={`rounded px-1.5 py-0.5 text-[10px] ${filterTag === t ? 'bg-th-accent-soft text-th-accent-text' : 'text-th-text-muted hover:text-th-text-secondary'}`}>{t}</button>
              ))}
            </div>
          )}
        </div>

        {/* Note list */}
        <div className="flex-1 overflow-y-auto">
          {filteredNotes.length === 0 && (
            <div className="flex flex-col items-center gap-3 py-12 px-4 text-th-text-muted">
              <FileText className="h-8 w-8" />
              <p className="text-xs">{notes.length === 0 ? 'No notes yet' : 'No notes match'}</p>
              {notes.length === 0 ? (
                <button
                  onClick={createNote}
                  className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-1.5 text-xs text-white hover:bg-cyan-500"
                >
                  <Plus className="h-3 w-3" />
                  Create your first note
                </button>
              ) : (
                <button
                  onClick={() => { setSearchQuery(''); setFilterFolder('all'); setFilterTag('all'); }}
                  className="text-xs text-cyan-400 hover:underline"
                >
                  Clear filters
                </button>
              )}
            </div>
          )}

          {filterFolder === 'all' && groupedNotes ? (
            <>
              {groupedNotes.pinned.length > 0 && (
                <div>
                  <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-th-text-muted">Pinned</div>
                  {groupedNotes.pinned.map(renderSidebarNote)}
                </div>
              )}
              {Object.entries(groupedNotes.folders).map(([folder, fNotes]) => (
                <div key={folder}>
                  <button onClick={() => toggleFolder(folder)} className="flex w-full items-center gap-1.5 px-3 py-1.5 hover:bg-th-elevated/30">
                    {collapsedFolders.has(folder) ? <ChevronRight className="h-3 w-3 text-th-text-muted" /> : <ChevronDown className="h-3 w-3 text-th-text-muted" />}
                    <FolderOpen className="h-3 w-3 text-th-text-muted" />
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-th-text-muted">{folder}</span>
                    <span className="ml-auto text-[10px] text-th-text-muted">{fNotes.length}</span>
                  </button>
                  {!collapsedFolders.has(folder) && fNotes.map(renderSidebarNote)}
                </div>
              ))}
              {groupedNotes.unfiled.length > 0 && (
                <div>
                  {(groupedNotes.pinned.length > 0 || Object.keys(groupedNotes.folders).length > 0) && (
                    <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-th-text-muted">Notes</div>
                  )}
                  {groupedNotes.unfiled.map(renderSidebarNote)}
                </div>
              )}
            </>
          ) : (
            filteredNotes.map(renderSidebarNote)
          )}
        </div>
      </div>

      {/* Editor */}
      <div className={`${activeId === null ? 'hidden md:flex' : 'flex'} flex-1 flex-col overflow-hidden`}>
        {activeNote ? (
          <>
            {/* Mobile back + toolbar */}
            <div className="flex items-center justify-between border-b border-th-border px-4 py-2">
              <button onClick={() => setActiveId(null)} className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-cyan-400 md:hidden">
                <ChevronLeft className="h-4 w-4" /> Back
              </button>
              <div className="flex items-center gap-1.5 ml-auto">
                <button
                  onClick={togglePin}
                  className={`rounded p-1.5 ${activeNote.isPinned ? 'text-amber-400' : 'text-th-text-muted hover:text-th-text-secondary'}`}
                  title={activeNote.isPinned ? 'Unpin' : 'Pin'}
                >
                  <Pin className="h-3.5 w-3.5" />
                </button>
                <div className="relative">
                  <button
                    onClick={() => setShowColorPicker(!showColorPicker)}
                    className="rounded p-1.5 text-th-text-muted hover:text-th-text-secondary"
                    title="Color"
                  >
                    <Palette className="h-3.5 w-3.5" />
                  </button>
                  {showColorPicker && (
                    <div className="absolute right-0 top-full mt-1 z-20 flex items-center gap-1 rounded-lg border border-th-border bg-th-surface p-2 shadow-lg">
                      {NOTE_COLORS.map((c) => (
                        <button
                          key={c.name}
                          onClick={() => setColor(c.hex || null)}
                          className={`h-4 w-4 rounded-full border ${!c.hex ? 'border-th-border bg-th-surface' : 'border-transparent'} ${activeNote.color === c.hex || (!activeNote.color && !c.hex) ? 'ring-2 ring-offset-1 ring-offset-th-surface ring-cyan-400' : ''}`}
                          style={c.hex ? { backgroundColor: c.hex } : {}}
                          title={c.name}
                        />
                      ))}
                    </div>
                  )}
                </div>
                <div className="relative">
                  <button
                    onClick={() => setShowAiMenu(!showAiMenu)}
                    disabled={!!aiLoading}
                    className={`rounded p-1.5 ${aiLoading ? 'text-th-ai-text animate-pulse' : 'text-th-text-muted hover:text-th-ai-text'}`}
                    title="AI Actions"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                  </button>
                  {showAiMenu && (
                    <div className="absolute right-0 top-full mt-1 z-20 w-36 rounded-lg border border-th-border bg-th-surface shadow-lg py-1">
                      <button
                        onClick={handleAiSummarize}
                        className="block w-full px-3 py-1.5 text-left text-xs text-th-text hover:bg-th-elevated"
                      >
                        Summarize
                      </button>
                      <button
                        onClick={handleAiExpand}
                        className="block w-full px-3 py-1.5 text-left text-xs text-th-text hover:bg-th-elevated"
                      >
                        Expand
                      </button>
                      <button
                        onClick={handleAiAutoTag}
                        className="block w-full px-3 py-1.5 text-left text-xs text-th-text hover:bg-th-elevated"
                      >
                        Auto-tag
                      </button>
                    </div>
                  )}
                </div>
                <button
                  onClick={() => setPreviewMode(!previewMode)}
                  className={`rounded p-1.5 ${previewMode ? 'text-cyan-400' : 'text-th-text-muted hover:text-th-text-secondary'}`}
                  title={previewMode ? 'Edit' : 'Preview'}
                >
                  {previewMode ? <Pencil className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </button>
              </div>
            </div>

            {/* Metadata bar: folder + tags */}
            <div className="flex items-center gap-2 flex-wrap border-b border-th-border px-6 py-2">
              {/* Folder */}
              <div className="flex items-center gap-1">
                <FolderOpen className="h-3 w-3 text-th-text-muted" />
                {activeNote.folder ? (
                  <span className="flex items-center gap-1 rounded bg-th-elevated px-1.5 py-0.5 text-[10px] text-th-text-secondary">
                    {activeNote.folder}
                    <button onClick={() => setFolder(null)} className="hover:text-red-400"><X className="h-2.5 w-2.5" /></button>
                  </span>
                ) : showFolderInput ? (
                  <div className="flex items-center gap-1">
                    <input
                      value={folderInput}
                      onChange={(e) => setFolderInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') createAndSetFolder(); if (e.key === 'Escape') setShowFolderInput(false); }}
                      autoFocus
                      placeholder="Folder name"
                      className="w-24 bg-transparent text-[10px] text-th-text outline-none border-b border-cyan-600"
                    />
                    {folders.map((f) => (
                      <button key={f} onClick={() => setFolder(f)} className="rounded px-1.5 py-0.5 text-[10px] text-th-text-muted hover:bg-th-elevated">{f}</button>
                    ))}
                  </div>
                ) : (
                  <button onClick={() => setShowFolderInput(true)} className="text-[10px] text-th-text-muted hover:text-th-text-secondary">+ folder</button>
                )}
              </div>

              <span className="text-th-border">|</span>

              {/* Tags */}
              <div className="flex items-center gap-1 flex-wrap">
                <Hash className="h-3 w-3 text-th-text-muted" />
                {activeNote.tags.map((tag) => (
                  <span key={tag} className="group flex items-center gap-0.5 rounded-full bg-cyan-600/10 px-2 py-0.5 text-[10px] text-cyan-400">
                    {tag}
                    <button onClick={() => removeTag(tag)} className="ml-0.5 opacity-0 group-hover:opacity-100 hover:text-red-400">
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))}
                <div className="relative">
                  <input
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') addTag(); if (e.key === 'Escape') setTagInput(''); }}
                    placeholder="+ tag"
                    className="w-20 bg-transparent text-[10px] text-th-text-muted outline-none placeholder-th-text-muted"
                  />
                  {tagInput.trim() && (
                    <div className="absolute left-0 top-full mt-1 z-10 min-w-[120px] rounded-md border border-th-border bg-th-surface shadow-lg">
                      {allTags
                        .filter((t) => !activeNote.tags.includes(t) && t.toLowerCase().includes(tagInput.toLowerCase().replace(/^#/, '')))
                        .slice(0, 5)
                        .map((t) => (
                          <button
                            key={t}
                            onClick={() => { updateField('tags', [...activeNote.tags, t]); setTagInput(''); }}
                            className="block w-full px-2 py-1 text-left text-[11px] text-cyan-400 hover:bg-th-elevated"
                          >
                            #{t}
                          </button>
                        ))}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Title */}
            <div
              className="border-b border-th-border px-6 py-3"
              style={activeNote.color ? { background: `linear-gradient(135deg, ${activeNote.color}15 0%, transparent 60%)` } : {}}
            >
              <input
                value={activeNote.title}
                onChange={(e) => updateField('title', e.target.value)}
                placeholder="Note title"
                className="w-full bg-transparent text-xl font-semibold text-th-text outline-none placeholder-th-text-muted"
              />
            </div>

            {/* Content: edit or preview */}
            <div className="flex-1 overflow-y-auto">
              {previewMode ? (
                <div className="prose prose-invert prose-sm max-w-none px-6 py-4">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {activeNote.content || '*Empty note*'}
                  </ReactMarkdown>
                </div>
              ) : (
                <textarea
                  value={activeNote.content}
                  onChange={(e) => updateField('content', e.target.value)}
                  placeholder="Start writing... (supports Markdown)"
                  className="h-full w-full resize-none bg-transparent px-6 py-4 text-base md:text-sm leading-relaxed text-th-text-secondary outline-none placeholder-th-text-muted"
                />
              )}
            </div>

            {/* AI Result */}
            {aiResult && (
              <div className="border-t border-th-ai/20 bg-th-ai-soft px-6 py-3 max-h-64 overflow-y-auto">
                <div className="flex items-center justify-between mb-2 sticky top-0 bg-th-surface/0">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-th-ai-text">
                    <Sparkles className={`h-3 w-3 ${aiLoading ? 'animate-pulse' : ''}`} />
                    {aiResult.type === 'summary' ? 'Summary' : 'Expanded'}
                    {aiLoading && <span className="text-th-text-muted font-normal">· streaming</span>}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={appendAiResult}
                      disabled={!aiResult.text || !!aiLoading}
                      className="rounded border border-th-ai px-2 py-0.5 text-xs text-th-ai-text hover:bg-th-ai-soft disabled:opacity-40"
                    >
                      Append
                    </button>
                    <button
                      onClick={replaceWithAiResult}
                      disabled={!aiResult.text || !!aiLoading}
                      className="rounded px-2 py-0.5 text-xs bg-th-ai text-white hover:bg-th-ai disabled:opacity-40"
                    >
                      Replace
                    </button>
                    <button
                      onClick={() => setAiResult(null)}
                      className="rounded p-0.5 text-th-text-muted hover:text-th-text-secondary"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                {aiResult.type === 'expanded' ? (
                  <div className="prose prose-invert prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                      {aiResult.text || '*waiting for response...*'}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <p className="text-sm text-th-text-secondary leading-relaxed whitespace-pre-wrap">
                    {aiResult.text || <span className="text-th-text-muted italic">waiting for response...</span>}
                  </p>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-th-border px-6 py-1.5 text-[10px] text-th-text-muted">
              <span>{wordCount} words</span>
              <span>Updated {new Date(activeNote.updatedAt).toLocaleString()}</span>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-th-text-muted">
            <FileText className="h-12 w-12" />
            <p>{notes.length === 0 ? 'No notes yet' : 'Select a note to start editing'}</p>
            <button
              onClick={createNote}
              className="flex items-center gap-1.5 rounded-lg bg-cyan-600 px-4 py-2 text-sm text-white hover:bg-cyan-500"
            >
              <Plus className="h-4 w-4" />
              {notes.length === 0 ? 'Create your first note' : 'New note'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
