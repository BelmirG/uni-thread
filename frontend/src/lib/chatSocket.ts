/* Self-healing WebSocket for chat surfaces (DMs, club chat).
 *
 * A raw WebSocket dies permanently the moment the phone locks, the tab sleeps,
 * or the network blips — and the chat stays frozen until a full page reload.
 * This wrapper makes the connection behave the way messaging apps do:
 *
 *  - drops reconnect automatically with exponential backoff (1s → 10s cap);
 *  - returning to the tab / regaining network reconnects immediately;
 *  - messages sent while offline are queued and flushed on reconnect;
 *  - after a reconnect, `onReconnect` fires so the page can refetch history
 *    and fill in whatever arrived during the gap.
 *
 * Close codes 4000–4999 are the backend's deliberate rejections (bad auth,
 * not a member, no such conversation) — retrying those would loop forever,
 * so they end the connection for good.
 */
import { wsUrl } from "@/lib/ws";

export type SocketStatus = "connecting" | "connected" | "disconnected";

export interface ChatSocket {
  /** Send a JSON payload. Queued and sent on reconnect if currently offline,
   *  unless `queueIfClosed` is false (use that for ephemeral typing signals). */
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
        closed = true; // deliberate server rejection — retrying can't fix it
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

  // Coming back to the app is the moment users notice a dead chat — skip the
  // backoff timer and reconnect right away.
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
