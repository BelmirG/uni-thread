"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import MiniAvatar from "@/components/MiniAvatar";
import { wsUrl } from "@/lib/ws";
import { X, ImageIcon, FileText } from "lucide-react";
import { cn } from "@/lib/utils";

interface NotifPayload {
  type: "follow" | "club_invite" | "dm";
  actor_username: string;
  actor_display_name: string;
  actor_avatar_url: string | null;
  // dm
  conversation_id?: string;
  preview?: string;
  has_photo?: boolean;
  has_file?: boolean;
  is_post_share?: boolean;
  silent?: boolean;
  // club_invite
  club_name?: string;
  club_slug?: string;
}

interface Toast {
  id: string;
  payload: NotifPayload;
}

type NotifHandler = (p: NotifPayload) => void;

interface ToastCtx {
  addToast: (p: NotifPayload) => void;
  onNotification: (handler: NotifHandler) => () => void;
}

const Ctx = createContext<ToastCtx>({ addToast: () => {}, onNotification: () => () => {} });
export const useToast = () => useContext(Ctx);

function toastHref(p: NotifPayload): string {
  if (p.type === "dm" && p.conversation_id) return `/messages/${p.conversation_id}`;
  if (p.type === "club_invite") return `/profile`;
  return `/profile/${p.actor_username}`;
}

function DmPreviewLine({ p }: { p: NotifPayload }) {
  const iconCls = "w-3 h-3 flex-shrink-0";
  const text = p.preview ?? "";

  const attachment = (() => {
    if (p.is_post_share) return <><FileText className={iconCls} /><span>Shared a post</span></>;
    if (p.has_photo && p.has_file) return <><ImageIcon className={iconCls} /><span>Photo</span><span>·</span><FileText className={iconCls} /><span>File</span></>;
    if (p.has_photo) return <><ImageIcon className={iconCls} /><span>Photo</span></>;
    if (p.has_file) return <><FileText className={iconCls} /><span>File</span></>;
    return null;
  })();

  if (!text && !attachment) return <span>Sent you a message</span>;

  return (
    <span className="flex items-center gap-1 min-w-0">
      {text && <span className="truncate">{text}</span>}
      {text && attachment && <span className="flex-shrink-0">·</span>}
      {attachment}
    </span>
  );
}

function ToastContent({ p }: { p: NotifPayload }) {
  if (p.type === "dm") {
    return (
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate leading-tight">
          {p.actor_display_name}
        </p>
        <p className="text-xs text-muted-foreground leading-snug mt-0.5 flex items-center gap-1 min-w-0">
          <DmPreviewLine p={p} />
        </p>
      </div>
    );
  }
  if (p.type === "club_invite") {
    return (
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-foreground truncate leading-tight">
          {p.actor_display_name}
        </p>
        <p className="text-xs text-muted-foreground truncate leading-snug mt-0.5">
          Invited you to {p.club_name}
        </p>
      </div>
    );
  }
  // follow
  return (
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold text-foreground truncate leading-tight">
        {p.actor_display_name}
      </p>
      <p className="text-xs text-muted-foreground leading-snug mt-0.5">
        Started following you
      </p>
    </div>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = requestAnimationFrame(() => setVisible(true));
    const hide = setTimeout(() => setVisible(false), 4500);
    const remove = setTimeout(onDismiss, 5000);
    return () => {
      cancelAnimationFrame(show);
      clearTimeout(hide);
      clearTimeout(remove);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function handleClick() {
    router.push(toastHref(toast.payload));
    onDismiss();
  }

  return (
    <div
      className={cn(
        "flex items-center gap-3 bg-white border border-border rounded-2xl shadow-xl px-3.5 py-3 max-w-[300px] w-full cursor-pointer transition-all duration-300",
        visible ? "opacity-100 translate-y-0" : "opacity-0 -translate-y-2"
      )}
      onClick={handleClick}
    >
      <MiniAvatar
        name={toast.payload.actor_display_name}
        url={toast.payload.actor_avatar_url}
        size={38}
      />
      <ToastContent p={toast.payload} />
      <button
        onClick={(e) => { e.stopPropagation(); setVisible(false); setTimeout(onDismiss, 300); }}
        className="text-muted-foreground hover:text-foreground flex-shrink-0 ml-1"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const wsRef = useRef<WebSocket | null>(null);
  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  const listenersRef = useRef<Set<NotifHandler>>(new Set());
  useEffect(() => { pathnameRef.current = pathname; }, [pathname]);

  const onNotification = useCallback((handler: NotifHandler) => {
    listenersRef.current.add(handler);
    return () => { listenersRef.current.delete(handler); };
  }, []);

  const addToast = useCallback((payload: NotifPayload) => {
    // Always notify subscribers (e.g. messages list refresh) — mute only hides the popup
    listenersRef.current.forEach((h) => h(payload));
    // Suppress toast when muted or already in that conversation
    if (payload.silent) return;
    if (
      payload.type === "dm" &&
      payload.conversation_id &&
      pathnameRef.current === `/messages/${payload.conversation_id}`
    ) return;
    const id = crypto.randomUUID();
    setToasts((prev) => [...prev.slice(-4), { id, payload }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  useEffect(() => {
    let destroyed = false;
    let retryDelay = 2000;

    function connect() {
      if (destroyed) return;
      const ws = new WebSocket(wsUrl("/api/notifications/ws"));
      wsRef.current = ws;

      ws.onopen = () => { retryDelay = 2000; };

      ws.onmessage = (event) => {
        try {
          const payload: NotifPayload = JSON.parse(event.data);
          addToast(payload);
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        wsRef.current = null;
        if (!destroyed) {
          retryRef.current = setTimeout(connect, retryDelay);
          retryDelay = Math.min(retryDelay * 2, 30000);
        }
      };

      ws.onerror = () => ws.close();
    }

    connect();

    return () => {
      destroyed = true;
      if (retryRef.current) clearTimeout(retryRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [addToast]);

  return (
    <Ctx.Provider value={{ addToast, onNotification }}>
      {children}
      {toasts.length > 0 && (
        <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 items-end pointer-events-none">
          {toasts.map((t) => (
            <div key={t.id} className="pointer-events-auto">
              <ToastItem toast={t} onDismiss={() => dismiss(t.id)} />
            </div>
          ))}
        </div>
      )}
    </Ctx.Provider>
  );
}
