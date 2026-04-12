import { useState, useRef, useEffect } from 'react';
import { Send, Square } from 'lucide-react';

interface Props {
  onSend: (message: string) => void;
  onStop: () => void;
  streaming: boolean;
  placeholder?: string;
}

export function MessageInput({ onSend, onStop, streaming, placeholder }: Props) {
  const [value, setValue] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!streaming) textareaRef.current?.focus();
  }, [streaming]);

  const handleSubmit = () => {
    if (streaming) {
      onStop();
      return;
    }
    if (!value.trim()) return;
    onSend(value);
    setValue('');
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-th-border bg-th-surface px-4 py-3">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          ref={textareaRef}
          rows={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder ?? 'Message OpenClaw...'}
          disabled={streaming}
          className="flex-1 resize-none rounded-xl border border-th-border-strong bg-th-input px-4 py-2.5 text-base md:text-sm text-th-text placeholder-th-text-muted outline-none transition-colors focus:border-cyan-600 disabled:opacity-50"
        />
        <button
          onClick={handleSubmit}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors ${
            streaming
              ? 'bg-red-600/80 text-white hover:bg-red-600'
              : 'bg-cyan-600 text-white hover:bg-cyan-500'
          }`}
        >
          {streaming ? <Square className="h-4 w-4" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </div>
  );
}
