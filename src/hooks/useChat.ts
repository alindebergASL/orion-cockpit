import { useCallback, useRef, useState } from 'react';
import type { ChatMessage, CanvasEvent, CanvasSurface } from '../types';
import type { OpenClawClient } from '../lib/openclaw';

let nextId = 1;
function makeId() {
  return `msg-${Date.now()}-${nextId++}`;
}

export function useChat(client: OpenClawClient, sessionKey?: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [surfaces, setSurfaces] = useState<CanvasSurface[]>([]);
  const [streaming, setStreaming] = useState(false);
  const streamingRef = useRef(false);

  const handleCanvas = useCallback((evt: CanvasEvent) => {
    const id = evt.surfaceId ?? 'default';

    if (evt.action === 'deleteSurface') {
      setSurfaces((prev) => prev.filter((s) => s.id !== id));
      return;
    }

    if (evt.html) {
      setSurfaces((prev) => {
        const existing = prev.find((s) => s.id === id);
        if (existing) {
          return prev.map((s) => (s.id === id ? { ...s, html: evt.html! } : s));
        }
        return [...prev, { id, html: evt.html! }];
      });
    }
  }, []);

  const send = useCallback(
    async (content: string) => {
      if (streamingRef.current || !content.trim()) return;

      const userMsg: ChatMessage = {
        id: makeId(),
        role: 'user',
        content: content.trim(),
        timestamp: Date.now(),
      };

      const assistantMsg: ChatMessage = {
        id: makeId(),
        role: 'assistant',
        content: '',
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, userMsg, assistantMsg]);
      setStreaming(true);
      streamingRef.current = true;

      const history = [...messages, userMsg];

      try {
        await client.streamChat(
          history.map(({ role, content: c }) => ({ role, content: c })),
          (chunk) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id
                  ? { ...m, content: m.content + chunk }
                  : m,
              ),
            );
          },
          handleCanvas,
          sessionKey,
        );
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setMessages((prev) =>
            prev.map((m) =>
              m.id === assistantMsg.id
                ? { ...m, content: m.content || `Error: ${(err as Error).message}` }
                : m,
            ),
          );
        }
      } finally {
        setStreaming(false);
        streamingRef.current = false;
      }
    },
    [client, messages, handleCanvas, sessionKey],
  );

  const stop = useCallback(() => {
    client.abort();
  }, [client]);

  const clear = useCallback(() => {
    setMessages([]);
    setSurfaces([]);
  }, []);

  return { messages, surfaces, streaming, send, stop, clear };
}
