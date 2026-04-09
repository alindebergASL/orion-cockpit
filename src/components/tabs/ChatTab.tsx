import { useState } from 'react';
import { PanelRightOpen, Trash2 } from 'lucide-react';
import { useOpenClaw } from '../../hooks/useOpenClaw';
import { useChat } from '../../hooks/useChat';
import { MessageList } from '../chat/MessageList';
import { MessageInput } from '../chat/MessageInput';
import { CanvasPanel } from '../chat/CanvasPanel';

export function ChatTab() {
  const { client } = useOpenClaw();
  const { messages, surfaces, streaming, send, stop, clear } = useChat(client, 'cockpit-main');

  const [canvasVisible, setCanvasVisible] = useState(true);
  const [canvasExpanded, setCanvasExpanded] = useState(false);

  const hasCanvas = surfaces.length > 0;

  return (
    <div className="flex h-full">
      {/* Chat panel */}
      <div className="flex flex-1 flex-col">
        {/* Chat header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Chat</h2>
            <p className="text-xs text-slate-500">Talking to your OpenClaw agent</p>
          </div>
          <div className="flex items-center gap-2">
            {hasCanvas && !canvasVisible && (
              <button
                onClick={() => setCanvasVisible(true)}
                className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-slate-400 hover:bg-slate-800 hover:text-slate-200"
              >
                <PanelRightOpen className="h-3.5 w-3.5" />
                Canvas
              </button>
            )}
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

      {/* Canvas panel */}
      <CanvasPanel
        surfaces={surfaces}
        visible={canvasVisible}
        onClose={() => setCanvasVisible(false)}
        expanded={canvasExpanded}
        onToggleExpand={() => setCanvasExpanded((e) => !e)}
      />
    </div>
  );
}
