import { useCallback, useEffect, useRef, useState } from 'react';
import type { Insight } from '../types';
import { api } from '../lib/api';

export function useNotifications() {
  const [insights, setInsights] = useState<Insight[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const eventSourceRef = useRef<EventSource | null>(null);

  // Load insights on mount
  const refresh = useCallback(async () => {
    try {
      const data = await api.getInsights();
      setInsights(data.insights);
      setUnreadCount(data.unreadCount);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    refresh();

    // Connect to SSE for real-time updates
    const token = localStorage.getItem('orion-token');
    if (token) {
      const es = new EventSource(`/api/notifications/stream?token=${token}`);
      es.addEventListener('new_insight', () => {
        refresh();
      });
      es.onerror = () => {
        // Reconnect handled by browser
      };
      eventSourceRef.current = es;
    }

    // Also poll every 5 min as fallback
    const interval = setInterval(refresh, 5 * 60 * 1000);

    return () => {
      eventSourceRef.current?.close();
      clearInterval(interval);
    };
  }, [refresh]);

  const markRead = useCallback(async (id: number) => {
    await api.markInsightRead(id);
    setInsights((prev) => prev.map((i) => i.id === id ? { ...i, read: true } : i));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const markAllRead = useCallback(async () => {
    await api.markAllInsightsRead();
    setInsights((prev) => prev.map((i) => ({ ...i, read: true })));
    setUnreadCount(0);
  }, []);

  const dismiss = useCallback(async (id: number) => {
    await api.dismissInsight(id);
    setInsights((prev) => prev.filter((i) => i.id !== id));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  const actOn = useCallback(async (id: number) => {
    await api.actOnInsight(id);
    setInsights((prev) => prev.map((i) => i.id === id ? { ...i, actedOn: true, read: true } : i));
    setUnreadCount((prev) => Math.max(0, prev - 1));
  }, []);

  return { insights, unreadCount, markRead, markAllRead, dismiss, actOn, refresh };
}
