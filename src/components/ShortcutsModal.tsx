import { useEffect } from 'react';
import { X } from 'lucide-react';

const SHORTCUTS = [
  { keys: ['Ctrl', '1-6'], desc: 'Switch tabs' },
  { keys: ['Ctrl', 'K'], desc: 'Open search' },
  { keys: ['Ctrl', 'N'], desc: 'New item (note, task, project)' },
  { keys: ['Ctrl', '/'], desc: 'Show shortcuts' },
  { keys: ['Enter'], desc: 'Send chat message' },
  { keys: ['Shift', 'Enter'], desc: 'New line in chat' },
  { keys: ['Escape'], desc: 'Close panel / dismiss' },
];

const SLASH_COMMANDS = [
  { cmd: '/task', desc: 'Create a task', example: '/task Buy groceries' },
  { cmd: '/event', desc: 'Create an event', example: '/event Meeting at 3pm tomorrow' },
  { cmd: '/note', desc: 'Create a note', example: '/note Ideas for vacation' },
  { cmd: '/focus', desc: 'Find free time for focus', example: '/focus' },
  { cmd: '/prep', desc: 'Prep for next meeting', example: '/prep' },
];

export function ShortcutsModal({ onClose }: { onClose: () => void }) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div
        className="w-11/12 max-w-lg rounded-xl border border-th-border-strong bg-th-surface p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-sm font-semibold text-th-text">Keyboard Shortcuts</h2>
          <button onClick={onClose} className="rounded p-1 text-th-text-secondary hover:text-th-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-2">
          {SHORTCUTS.map(({ keys, desc }) => (
            <div key={desc} className="flex items-center justify-between">
              <span className="text-sm text-th-text-secondary">{desc}</span>
              <div className="flex items-center gap-1">
                {keys.map((k) => (
                  <kbd key={k} className="rounded border border-th-border bg-th-elevated px-2 py-0.5 text-[11px] font-mono text-th-text">
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="mt-5 border-t border-th-border pt-4">
          <h3 className="text-xs font-semibold text-th-text-secondary mb-2">Chat Slash Commands</h3>
          <div className="space-y-2">
            {SLASH_COMMANDS.map(({ cmd, desc, example }) => (
              <div key={cmd} className="flex items-start gap-3">
                <code className="shrink-0 rounded bg-cyan-600/10 px-2 py-0.5 text-xs font-mono text-cyan-400">{cmd}</code>
                <div className="min-w-0">
                  <p className="text-sm text-th-text-secondary">{desc}</p>
                  <p className="text-xs text-th-text-muted">{example}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function useGlobalShortcuts(callbacks: {
  onNewItem?: () => void;
  onShowShortcuts?: () => void;
}): void {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'n') {
          e.preventDefault();
          callbacks.onNewItem?.();
        }
        if (e.key === '/') {
          e.preventDefault();
          callbacks.onShowShortcuts?.();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [callbacks]);
}
