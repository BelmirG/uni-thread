import { wsUrl } from "@/lib/ws";

export type SocketStatus = "connecting" | "connected" | "disconnected";

export interface ChatSocket {
  send: (payload: object, queueIfClosed?: boolean) => void;
  close: () => void;
}

export function openChatSocket(
  path: string,
  opts: {
    onMessage: (data: unknown) => void;
    onStatus: (s: SocketStatus) => void;
    onReconnect?: () => void;
  }
): ChatSocket {
  let ws: WebSocket | null = null;
  let closed = false;
  let everConnected = false;
  let attempts = 0;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  const outbox: string[] = [];

  function connect() {
    if (closed) return;
    opts.onStatus("connecting");
    ws = new WebSocket(wsUrl(path));
    ws.onopen = () => {
      const isReconnect = everConnected;
      everConnected = true;
      attempts = 0;
      opts.onStatus("connected");
      if (isReconnect) opts.onReconnect?.();
      while (outbox.length && ws && ws.readyState === WebSocket.OPEN) {
        ws.send(outbox.shift()!);
      }
    };
    ws.onmessage = (event) => {
      try {
        opts.onMessage(JSON.parse(event.data));
      } catch {
        /* ignore malformed frames */
      }
    };
    ws.onclose = (event) => {
      ws = null;
      if (closed) return;
      opts.onStatus("disconnected");
      if (event.code >= 4000 && event.code < 5000) {
        closed = true;
        return;
      }
      scheduleRetry();
    };
    ws.onerror = () => ws?.close();
  }

  function scheduleRetry() {
    if (closed || retryTimer) return;
    const delay = Math.min(1000 * 2 ** attempts, 10000);
    attempts += 1;
    retryTimer = setTimeout(() => {
      retryTimer = null;
      connect();
    }, delay);
  }

  function wake() {
    if (closed) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
    attempts = 0;
    connect();
  }
  const onVisible = () => {
    if (document.visibilityState === "visible") wake();
  };
  window.addEventListener("visibilitychange", onVisible);
  window.addEventListener("online", wake);
  window.addEventListener("focus", wake);

  connect();

  return {
    send(payload: object, queueIfClosed = true) {
      const text = JSON.stringify(payload);
      if (ws && ws.readyState === WebSocket.OPEN) ws.send(text);
      else if (queueIfClosed) outbox.push(text);
    },
    close() {
      closed = true;
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", wake);
      window.removeEventListener("focus", wake);
      ws?.close();
      ws = null;
    },
  };
}
