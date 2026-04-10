import { useCallback, useRef, useState } from 'react';
import type { ChatMessage } from '../types';
import { api } from '../lib/api';

let nextId = 1;
function makeId() {
  return `msg-${Date.now()}-${nextId++}`;
}

export function useChat(tabContext: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const streamingRef = useRef(false);

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

      try {
        await api.streamChat(
          content.trim(),
          tabContext,
          (chunk) => {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === assistantMsg.id
                  ? { ...m, content: m.content + chunk }
                  : m,
              ),
            );
          },
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
    [tabContext],
  );

  const stop = useCallback(() => {
    api.abort();
  }, []);

  const clear = useCallback(() => {
    setMessages([]);
  }, []);

  return { messages, streaming, send, stop, clear };
}
