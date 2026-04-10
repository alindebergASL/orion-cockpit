import { Trash2 } from 'lucide-react';
import { useChat } from '../../hooks/useChat';
import { MessageList } from '../chat/MessageList';
import { MessageInput } from '../chat/MessageInput';

export function ChatTab() {
  const { messages, streaming, send, stop, clear } = useChat('chat');

  return (
    <div className="flex h-full flex-col">
      {/* Chat header */}
      <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-100">Chat</h2>
          <p className="text-xs text-slate-500">Talking to OpenClaw</p>
        </div>
        <div className="flex items-center gap-2">
          {messages.length > 0 && (
            <button
              onClick={clear}
              className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Clear
            </button>
          )}
        </div>
      </div>

      <MessageList messages={messages} streaming={streaming} />
      <MessageInput onSend={send} onStop={stop} streaming={streaming} />
    </div>
  );
}
