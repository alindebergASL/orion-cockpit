import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, FileText } from 'lucide-react';

interface Note {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}

const STORAGE_KEY = 'orion-cockpit-notes';

function loadNotes(): Note[] {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
  } catch {
    return [];
  }
}

function saveNotes(notes: Note[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

export function NotesTab() {
  const [notes, setNotes] = useState<Note[]>(loadNotes);
  const [activeId, setActiveId] = useState<string | null>(notes[0]?.id ?? null);

  useEffect(() => {
    saveNotes(notes);
  }, [notes]);

  const activeNote = notes.find((n) => n.id === activeId);

  const createNote = useCallback(() => {
    const note: Note = {
      id: `note-${Date.now()}`,
      title: 'Untitled',
      content: '',
      updatedAt: Date.now(),
    };
    setNotes((prev) => [note, ...prev]);
    setActiveId(note.id);
  }, []);

  const deleteNote = useCallback(
    (id: string) => {
      setNotes((prev) => prev.filter((n) => n.id !== id));
      if (activeId === id) setActiveId(null);
    },
    [activeId],
  );

  const updateNote = useCallback(
    (field: 'title' | 'content', value: string) => {
      if (!activeId) return;
      setNotes((prev) =>
        prev.map((n) =>
          n.id === activeId ? { ...n, [field]: value, updatedAt: Date.now() } : n,
        ),
      );
    },
    [activeId],
  );

  return (
    <div className="flex h-full">
      {/* Notes sidebar */}
      <div className="flex w-64 flex-col border-r border-slate-800 bg-slate-900/50">
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
      <div className="flex flex-1 flex-col">
        {activeNote ? (
          <>
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
