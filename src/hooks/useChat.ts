import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, Conversation } from '../types';
import { api } from '../lib/api';

let nextId = 1;
function makeId() {
  return `msg-${Date.now()}-${nextId++}`;
}

const ACTIVE_CONV_KEY = 'orion-active-conversation';

export function useChat(tabContext: string) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [activeConversationId, setActiveConversationId] = useState<number | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const streamingRef = useRef(false);
  const initRef = useRef(false);

  // Load conversations list and restore active conversation on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    (async () => {
      try {
        const convs = await api.getConversations(tabContext, 5);
        setConversations(convs);

        // Try to restore last active conversation
        const storedId = localStorage.getItem(`${ACTIVE_CONV_KEY}-${tabContext}`);
        const restoredId = storedId ? parseInt(storedId, 10) : null;
        const activeConv = restoredId && convs.find((c) => c.id === restoredId)
          ? restoredId
          : convs[0]?.id ?? null;

        if (activeConv) {
          setActiveConversationId(activeConv);
          const msgs = await api.getConversationMessages(activeConv);
          setMessages(msgs.map((m) => ({
            id: makeId(),
            role: m.role as ChatMessage['role'],
            content: m.content,
            timestamp: new Date(m.timestamp).getTime(),
          })));
        }
      } catch {
        // silently fail on load
      } finally {
        setLoadingHistory(false);
      }
    })();
  }, [tabContext]);

  // Persist active conversation ID
  useEffect(() => {
    if (activeConversationId !== null) {
      localStorage.setItem(`${ACTIVE_CONV_KEY}-${tabContext}`, String(activeConversationId));
    }
  }, [activeConversationId, tabContext]);

  const refreshConversations = useCallback(async () => {
    try {
      const convs = await api.getConversations(tabContext, 5);
      setConversations(convs);
    } catch { /* ignore */ }
  }, [tabContext]);

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
          activeConversationId ?? undefined,
          (newConvId) => {
            setActiveConversationId(newConvId);
          },
        );
        // Refresh conversation list (title may have been auto-set)
        await refreshConversations();
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
    [tabContext, activeConversationId, refreshConversations],
  );

  const stop = useCallback(() => {
    api.abort();
  }, []);

  const newConversation = useCallback(async () => {
    try {
      const conv = await api.createConversation(tabContext);
      setActiveConversationId(conv.id);
      setMessages([]);
      await refreshConversations();
    } catch { /* ignore */ }
  }, [tabContext, refreshConversations]);

  const switchConversation = useCallback(async (convId: number) => {
    if (convId === activeConversationId) return;
    setActiveConversationId(convId);
    setMessages([]);
    try {
      const msgs = await api.getConversationMessages(convId);
      setMessages(msgs.map((m) => ({
        id: makeId(),
        role: m.role as ChatMessage['role'],
        content: m.content,
        timestamp: new Date(m.timestamp).getTime(),
      })));
    } catch { /* ignore */ }
  }, [activeConversationId]);

  const deleteConversation = useCallback(async (convId: number) => {
    try {
      await api.deleteConversation(convId);
      if (convId === activeConversationId) {
        setMessages([]);
        setActiveConversationId(null);
      }
      await refreshConversations();
    } catch { /* ignore */ }
  }, [activeConversationId, refreshConversations]);

  return {
    messages,
    conversations,
    activeConversationId,
    streaming,
    loadingHistory,
    send,
    stop,
    newConversation,
    switchConversation,
    deleteConversation,
  };
}
