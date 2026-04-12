import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Trash2, FileText } from 'lucide-react';
import type { Note } from '../../types';
import { api } from '../../lib/api';

export function NotesTab() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Load notes from backend on mount
  useEffect(() => {
    api.getNotes()
      .then((data) => {
        setNotes(data);
        if (data.length > 0 && data[0]) setActiveId(data[0].id);
      })
      .catch(() => { /* silently fail, show empty */ })
      .finally(() => setLoading(false));
  }, []);

  const activeNote = notes.find((n) => n.id === activeId);

  const createNote = useCallback(async () => {
    try {
      const note = await api.createNote('Untitled', '');
      setNotes((prev) => [note, ...prev]);
      setActiveId(note.id);
    } catch {
      // silently fail
    }
  }, []);

  const deleteNote = useCallback(
    async (id: number) => {
      try {
        await api.deleteNote(id);
        setNotes((prev) => prev.filter((n) => n.id !== id));
        if (activeId === id) setActiveId(null);
      } catch {
        // silently fail
      }
    },
    [activeId],
  );

  const updateNote = useCallback(
    (field: 'title' | 'content', value: string) => {
      if (activeId === null) return;

      // Optimistic update
      setNotes((prev) =>
        prev.map((n) =>
          n.id === activeId ? { ...n, [field]: value, updatedAt: new Date().toISOString() } : n,
        ),
      );

      // Debounced save to backend
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        const note = notes.find((n) => n.id === activeId);
        if (!note) return;
        const title = field === 'title' ? value : note.title;
        const content = field === 'content' ? value : note.content;
        api.updateNote(activeId, title, content).catch(() => {});
      }, 300);
    },
    [activeId, notes],
  );

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-700 border-t-cyan-400" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col md:flex-row">
      {/* Notes sidebar */}
      <div className={`${activeId !== null ? 'hidden md:flex' : 'flex'} w-full md:w-64 flex-col border-b md:border-b-0 md:border-r border-slate-800 bg-slate-900/50`}>
        <div className="flex items-center justify-between border-b border-slate-800 px-3 py-3">
          <h2 className="text-sm font-semibold text-slate-100">Notes</h2>
          <button
            onClick={createNote}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-cyan-400"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {notes.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-12 text-slate-600">
              <FileText className="h-8 w-8" />
              <p className="text-xs">No notes yet</p>
            </div>
          )}

          {notes.map((note) => (
            <button
              key={note.id}
              onClick={() => setActiveId(note.id)}
              className={`flex w-full items-center justify-between px-3 py-2.5 text-left transition-colors ${
                activeId === note.id
                  ? 'bg-slate-800 text-slate-100'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-slate-300'
              }`}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm">{note.title || 'Untitled'}</p>
                <p className="truncate text-[11px] text-slate-600">
                  {new Date(note.updatedAt).toLocaleDateString()}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteNote(note.id);
                }}
                className="ml-2 shrink-0 rounded p-1 text-slate-600 hover:text-red-400"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </button>
          ))}
        </div>
      </div>

      {/* Editor */}
      <div className={`${activeId === null ? 'hidden md:flex' : 'flex'} flex-1 flex-col`}>
        {activeNote ? (
          <>
            <div className="flex items-center border-b border-slate-800 md:hidden">
              <button
                onClick={() => setActiveId(null)}
                className="px-3 py-3 text-xs text-cyan-400"
              >
                &larr; Back
              </button>
            </div>
            <input
              value={activeNote.title}
              onChange={(e) => updateNote('title', e.target.value)}
              placeholder="Note title"
              className="border-b border-slate-800 bg-transparent px-6 py-4 text-lg font-semibold text-slate-100 outline-none placeholder-slate-600"
            />
            <textarea
              value={activeNote.content}
              onChange={(e) => updateNote('content', e.target.value)}
              placeholder="Start writing..."
              className="flex-1 resize-none bg-transparent px-6 py-4 text-sm leading-relaxed text-slate-300 outline-none placeholder-slate-700"
            />
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-slate-600">
            <FileText className="h-12 w-12" />
            <p>Select or create a note</p>
          </div>
        )}
      </div>
    </div>
  );
}
