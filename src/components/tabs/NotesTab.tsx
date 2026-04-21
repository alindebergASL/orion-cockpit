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
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import type { Note } from '../../types';
import { api } from '../../lib/api';
import { trackActivity } from '../../lib/activity';

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
    } catch { /* ignore */ }
  }, [filterFolder]);

  const deleteNote = useCallback(async (id: number) => {
    if (!confirm('Delete this note?')) return;
    try {
      await api.deleteNote(id);
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (activeId === id) setActiveId(null);
    } catch { /* ignore */ }
  }, [activeId]);

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
        <p className="truncate text-[11px] text-th-text-muted mt-0.5">
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
            <button onClick={() => setFilterFolder('all')} className={`rounded px-1.5 py-0.5 text-[10px] ${filterFolder === 'all' ? 'bg-cyan-600/20 text-cyan-400' : 'text-th-text-muted hover:text-th-text-secondary'}`}>All</button>
            {folders.map((f) => (
              <button key={f} onClick={() => setFilterFolder(f)} className={`rounded px-1.5 py-0.5 text-[10px] ${filterFolder === f ? 'bg-cyan-600/20 text-cyan-400' : 'text-th-text-muted hover:text-th-text-secondary'}`}>{f}</button>
            ))}
            <button onClick={() => setFilterFolder('unfiled')} className={`rounded px-1.5 py-0.5 text-[10px] ${filterFolder === 'unfiled' ? 'bg-cyan-600/20 text-cyan-400' : 'text-th-text-muted hover:text-th-text-secondary'}`}>Unfiled</button>
          </div>
          {allTags.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              <Hash className="h-3 w-3 text-th-text-muted shrink-0" />
              <button onClick={() => setFilterTag('all')} className={`rounded px-1.5 py-0.5 text-[10px] ${filterTag === 'all' ? 'bg-cyan-600/20 text-cyan-400' : 'text-th-text-muted hover:text-th-text-secondary'}`}>All</button>
              {allTags.map((t) => (
                <button key={t} onClick={() => setFilterTag(t)} className={`rounded px-1.5 py-0.5 text-[10px] ${filterTag === t ? 'bg-cyan-600/20 text-cyan-400' : 'text-th-text-muted hover:text-th-text-secondary'}`}>{t}</button>
              ))}
            </div>
          )}
        </div>

        {/* Note list */}
        <div className="flex-1 overflow-y-auto">
          {filteredNotes.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-th-text-muted">
              <FileText className="h-8 w-8" />
              <p className="text-xs">{notes.length === 0 ? 'No notes yet' : 'No notes match'}</p>
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
              <button onClick={() => setActiveId(null)} className="text-xs text-cyan-400 md:hidden">&larr; Back</button>
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
                <input
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') addTag(); }}
                  placeholder="+ tag"
                  className="w-14 bg-transparent text-[10px] text-th-text-muted outline-none placeholder-th-text-muted"
                />
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
                  className="h-full w-full resize-none bg-transparent px-6 py-4 text-base md:text-sm leading-relaxed text-th-text-secondary outline-none placeholder-th-text-muted font-mono"
                />
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between border-t border-th-border px-6 py-1.5 text-[10px] text-th-text-muted">
              <span>{wordCount} words</span>
              <span>Updated {new Date(activeNote.updatedAt).toLocaleString()}</span>
            </div>
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-th-text-muted">
            <FileText className="h-12 w-12" />
            <p>Select or create a note</p>
          </div>
        )}
      </div>
    </div>
  );
}
