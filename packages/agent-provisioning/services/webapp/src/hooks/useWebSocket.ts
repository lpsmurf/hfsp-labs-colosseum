/**
 * Generic WebSocket hook — manages one shared connection per URL
 */
import { useEffect, useRef, useState, useCallback } from 'react';

type Handler = (data: unknown) => void;

interface WSState {
  connected: boolean;
  error: string | null;
}

// Module-level shared connections keyed by URL
const connections = new Map<string, {
  ws: WebSocket;
  subscribers: Map<string, Set<Handler>>;
  refCount: number;
}>();

export function useWebSocket(url: string | null, token: string | null) {
  const [state, setState] = useState<WSState>({ connected: false, error: null });
  const handlersRef = useRef<Map<string, Set<Handler>>>(new Map());

  const on = useCallback((type: string, handler: Handler) => {
    if (!handlersRef.current.has(type)) {
      handlersRef.current.set(type, new Set());
    }
    handlersRef.current.get(type)!.add(handler);
    return () => handlersRef.current.get(type)?.delete(handler);
  }, []);

  useEffect(() => {
    if (!url || !token) return;

    const fullUrl = `${url}?token=${encodeURIComponent(token)}`;

    let conn = connections.get(fullUrl);
    if (!conn) {
      const ws = new WebSocket(fullUrl);
      const subscribers = new Map<string, Set<Handler>>();
      conn = { ws, subscribers, refCount: 0 };
      connections.set(fullUrl, conn);

      ws.onopen = () => {
        conn!.subscribers.forEach((_, _k) => {});
        setState({ connected: true, error: null });
      };

      ws.onclose = () => setState({ connected: false, error: null });
      ws.onerror = () => setState((s) => ({ ...s, error: 'Connection error' }));

      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data) as { type: string; data?: unknown };
          conn!.subscribers.forEach((handlers, type) => {
            if (type === msg.type || type === '*') {
              handlers.forEach((h) => h(msg.data));
            }
          });
          if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
        } catch { /* ignore malformed */ }
      };
    }

    conn.refCount++;
    // Merge our handlers into the shared subscriber map
    handlersRef.current.forEach((handlers, type) => {
      if (!conn!.subscribers.has(type)) conn!.subscribers.set(type, new Set());
      handlers.forEach((h) => conn!.subscribers.get(type)!.add(h));
    });

    if (conn.ws.readyState === WebSocket.OPEN) {
      setState({ connected: true, error: null });
    }

    return () => {
      const c = connections.get(fullUrl);
      if (!c) return;
      c.refCount--;
      // Remove our handlers
      handlersRef.current.forEach((handlers, type) => {
        handlers.forEach((h) => c.subscribers.get(type)?.delete(h));
      });
      if (c.refCount <= 0) {
        c.ws.close();
        connections.delete(fullUrl);
      }
    };
  }, [url, token]);

  return { ...state, on };
}
