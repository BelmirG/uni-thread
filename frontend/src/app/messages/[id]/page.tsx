"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { ArrowLeft, Send, MoreVertical, Trash2, X, CornerUpLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import MiniAvatar from "@/components/MiniAvatar";

interface Author {
  username: string | null;
  display_name: string;
  avatar_url?: string | null;
}

interface SharedPost {
  id: string;
  post_type: string;
  content: string | null;
  is_deleted: boolean;
  author: Author | null;
}

interface DmMessage {
  id: string;
  content: string | null;
  shared_post: SharedPost | null;
  sender: Author;
  created_at: string;
}

interface ConvResponse {
  other_user: Author;
  messages: DmMessage[];
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function parseContent(content: string | null): { quote: string | null; body: string } {
  if (!content) return { quote: null, body: "" };
  if (content.startsWith("> ")) {
    const sep = content.indexOf("\n\n");
    if (sep !== -1) return { quote: content.slice(2, sep), body: content.slice(sep + 2) };
  }
  return { quote: null, body: content };
}

function SharedPostCard({ post, isOwn }: { post: SharedPost; isOwn: boolean }) {
  const isQA = post.post_type === "anonymous_qa";
  const href = isQA ? `/qa/${post.id}` : `/feed/${post.id}`;

  if (post.is_deleted) {
    return (
      <div className={cn(
        "mt-1.5 px-3 py-2 rounded-xl text-xs italic",
        isOwn ? "bg-white/15 text-white/80" : "bg-muted text-muted-foreground"
      )}>
        [deleted post]
      </div>
    );
  }
  return (
    <Link href={href} className={cn(
      "mt-1.5 px-3 py-2 rounded-xl text-xs block no-underline",
      isOwn ? "bg-white/15 text-white" : "bg-muted text-foreground"
    )}>
      <p className="font-semibold mb-0.5">
        {post.author?.display_name ?? "Unknown"}
        {isQA && <span className="font-normal opacity-60 ml-1">· Anonymous Q&A</span>}
      </p>
      <p className="opacity-80 whitespace-pre-wrap">
        {(post.content ?? "").slice(0, 120)}{(post.content ?? "").length > 120 ? "…" : ""}
      </p>
    </Link>
  );
}

function SwipeableMessage({
  msg,
  isOwn,
  isHovered,
  onSwipe,
  onScrollToQuote,
  onHoverEnter,
  onHoverLeave,
  msgRef,
}: {
  msg: DmMessage;
  isOwn: boolean;
  isHovered: boolean;
  onSwipe: (msg: DmMessage) => void;
  onScrollToQuote: (quote: string) => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  msgRef: (el: HTMLDivElement | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);
  const offsetRef = useRef(0);
  const onSwipeRef = useRef(onSwipe);
  const [offset, setOffset] = useState(0);

  useEffect(() => { onSwipeRef.current = onSwipe; });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const ts = (e: TouchEvent) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      tracking.current = false;
      offsetRef.current = 0;
      setOffset(0);
    };

    const tm = (e: TouchEvent) => {
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;
      if (!tracking.current) {
        if (Math.abs(dx) < 4 && Math.abs(dy) < 4) return;
        if (Math.abs(dy) >= Math.abs(dx)) return;
        tracking.current = true;
      }
      if (dx > 0) {
        e.preventDefault();
        const v = Math.min(dx * 0.45, 64);
        offsetRef.current = v;
        setOffset(v);
      }
    };

    const te = () => {
      if (offsetRef.current >= 40) onSwipeRef.current(msg);
      offsetRef.current = 0;
      setOffset(0);
    };

    el.addEventListener("touchstart", ts, { passive: true });
    el.addEventListener("touchmove", tm, { passive: false });
    el.addEventListener("touchend", te);
    return () => {
      el.removeEventListener("touchstart", ts);
      el.removeEventListener("touchmove", tm);
      el.removeEventListener("touchend", te);
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { quote, body } = parseContent(msg.content);
  const replyBtnOpacity = offset > 10 ? Math.min(offset / 40, 1) : isHovered ? 1 : 0;

  return (
    <div
      ref={(el) => { containerRef.current = el; msgRef(el); }}
      className={cn("flex w-full items-end gap-1.5", isOwn ? "flex-row-reverse" : "flex-row")}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
    >
      {!isOwn && (
        <div className="flex-shrink-0 mb-0.5">
          <MiniAvatar name={msg.sender.display_name} url={msg.sender.avatar_url ?? null} size={28} />
        </div>
      )}

      <div
        className={cn(
          "max-w-[72%] px-3.5 py-2 text-sm leading-snug flex flex-col",
          isOwn
            ? "bg-primary text-primary-foreground rounded-2xl rounded-br-sm"
            : "bg-white border border-border text-foreground rounded-2xl rounded-bl-sm"
        )}
        style={{
          transform: `translateX(${offset}px)`,
          transition: offset === 0 ? "transform 0.2s ease" : "none",
        }}
      >
        {quote && (
          <button
            onClick={() => onScrollToQuote(quote)}
            className={cn(
              "text-left text-xs px-2.5 py-1.5 rounded-lg mb-2 border-l-2 w-full cursor-pointer",
              isOwn
                ? "bg-white/15 border-white/50 text-white/80 hover:bg-white/25"
                : "bg-muted border-primary/50 text-muted-foreground hover:bg-muted/80"
            )}
            style={{ transition: "background 0.1s" }}
          >
            <span className="line-clamp-2 break-words">{quote}</span>
          </button>
        )}
        {body && <span className="whitespace-pre-wrap break-words">{body}</span>}
        {msg.shared_post && <SharedPostCard post={msg.shared_post} isOwn={isOwn} />}
        <span className={cn(
          "text-[10px] self-end mt-1 ml-2 flex-shrink-0",
          isOwn ? "text-primary-foreground/50" : "text-muted-foreground"
        )}>
          {timeLabel(msg.created_at)}
        </span>
      </div>

      {/* Reply button: visible on hover (desktop) or swipe (mobile) */}
      <button
        onClick={() => { onHoverLeave(); onSwipeRef.current(msg); }}
        className="flex-shrink-0 self-center p-1 rounded-full text-muted-foreground"
        style={{
          opacity: replyBtnOpacity,
          transition: offset === 0 ? "opacity 0.15s" : "none",
          pointerEvents: replyBtnOpacity > 0 ? "auto" : "none",
        }}
        tabIndex={-1}
      >
        <CornerUpLeft className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

export default function ConversationPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [otherUser, setOtherUser] = useState<Author | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [input, setInput] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [replyTo, setReplyTo] = useState<DmMessage | null>(null);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const msgRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const messagesRef = useRef<DmMessage[]>([]);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const [conv, me] = await Promise.all([
          apiFetch<ConvResponse>(`/api/messages/${id}`),
          apiFetch<{ username: string }>("/api/auth/me"),
        ]);
        if (cancelled) return;
        setMessages(conv.messages);
        setOtherUser(conv.other_user);
        setCurrentUsername(me.username);
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
        else if (err instanceof ApiError && err.status === 403) router.replace("/messages");
        return;
      }
      if (cancelled) return;

      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${window.location.host}/api/messages/${id}/ws`);
      wsRef.current = ws;
      ws.onopen = () => setStatus("connected");
      ws.onmessage = (event) => {
        const msg: DmMessage = JSON.parse(event.data);
        setMessages((prev) => [...prev, msg]);
        setCurrentUsername((cu) => {
          if (cu && msg.sender.username !== cu) {
            apiFetch(`/api/messages/${id}/read`, { method: "POST" }).catch(() => {});
          }
          return cu;
        });
      };
      ws.onclose = () => setStatus("disconnected");
      ws.onerror = () => setStatus("disconnected");
    }

    init();
    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [id, router]);

  function scrollToQuote(quote: string) {
    const all = messagesRef.current;
    const target = all.find((m) => {
      if (!m.content) return false;
      return m.content === quote || m.content.startsWith(quote);
    });
    if (!target) return;
    const el = msgRefs.current.get(target.id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    // Flash highlight via direct DOM (instant on, slow fade off)
    el.style.transition = "none";
    el.style.backgroundColor = "rgba(59,130,246,0.15)";
    el.style.borderRadius = "12px";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transition = "background-color 1.3s ease, border-radius 1.3s ease";
      el.style.backgroundColor = "";
      el.style.borderRadius = "";
    }));
    setTimeout(() => { el.style.transition = ""; }, 1500);
  }

  function send() {
    const text = input.trim();
    if (!text || status !== "connected" || !wsRef.current) return;
    const payload = replyTo
      ? `> ${(replyTo.content ?? "[post]").slice(0, 80)}\n\n${text}`
      : text;
    wsRef.current.send(JSON.stringify({ content: payload }));
    setInput("");
    setReplyTo(null);
    inputRef.current?.focus();
  }

  function handleSubmit(e: React.FormEvent) { e.preventDefault(); send(); }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  async function handleDeleteConversation() {
    if (!window.confirm("Delete this conversation? This cannot be undone.")) return;
    setMenuOpen(false);
    try {
      await apiFetch(`/api/messages/${id}`, { method: "DELETE" });
      router.replace("/messages");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not delete conversation.");
    }
  }

  return (
    <main className="fixed top-0 bottom-[60px] left-1/2 -translate-x-1/2 w-full max-w-[700px] flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-white flex-shrink-0">
        <Link href="/messages" className="flex items-center text-muted-foreground hover:text-foreground transition-colors no-underline flex-shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {otherUser && <MiniAvatar name={otherUser.display_name} url={otherUser.avatar_url ?? null} size={32} />}
          <span className="font-semibold text-sm text-foreground truncate">
            {otherUser?.display_name ?? "Conversation"}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center gap-1.5 text-xs">
            <span className={cn("w-2 h-2 rounded-full", status === "connected" ? "bg-green-500" : status === "connecting" ? "bg-yellow-400" : "bg-destructive")} />
            <span className="text-muted-foreground">
              {status === "connected" ? "Live" : status === "connecting" ? "Connecting…" : "Disconnected"}
            </span>
          </div>
          <div className="relative">
            <button onClick={() => setMenuOpen((o) => !o)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
              <MoreVertical className="w-4 h-4" />
            </button>
            {menuOpen && (
              <>
                <div onClick={() => setMenuOpen(false)} className="fixed inset-0 z-[199]" />
                <div className="absolute right-0 top-[calc(100%+4px)] bg-white border border-border rounded-xl shadow-lg min-w-[160px] z-[200] overflow-hidden">
                  <button onClick={handleDeleteConversation} className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-destructive hover:bg-destructive/5 transition-colors">
                    <Trash2 className="w-3.5 h-3.5" />
                    Delete chat
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div
        className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2 bg-muted/30"
        onScroll={() => setHoveredMsgId(null)}
      >
        {messages.length === 0 && status === "connected" && (
          <p className="text-muted-foreground text-sm text-center m-auto">No messages yet. Say hello!</p>
        )}
        {messages.map((msg) => (
          <SwipeableMessage
            key={msg.id}
            msg={msg}
            isOwn={msg.sender.username === currentUsername}
            isHovered={hoveredMsgId === msg.id}
            onHoverEnter={() => setHoveredMsgId(msg.id)}
            onHoverLeave={() => setHoveredMsgId(null)}
            onSwipe={(m) => { setHoveredMsgId(null); setReplyTo(m); setTimeout(() => inputRef.current?.focus(), 50); }}
            onScrollToQuote={scrollToQuote}
            msgRef={(el) => {
              if (el) msgRefs.current.set(msg.id, el);
              else msgRefs.current.delete(msg.id);
            }}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/60 border-t border-border flex-shrink-0">
          <CornerUpLeft className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <p className="flex-1 text-xs text-muted-foreground truncate">
            <span className="font-medium text-foreground">{replyTo.sender.display_name}:</span>{" "}
            {(replyTo.content ?? "[post]").slice(0, 80)}
          </p>
          <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2 px-4 py-3 border-t border-border bg-white flex-shrink-0">
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={status === "connected" ? "Type a message…" : "Disconnected"}
          disabled={status !== "connected"}
          maxLength={2000}
          rows={1}
          className="flex-1 px-4 py-2.5 text-sm rounded-2xl border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 resize-none max-h-32 overflow-y-auto"
          style={{ lineHeight: "1.4" }}
        />
        <button
          type="submit"
          disabled={!input.trim() || status !== "connected"}
          className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 disabled:opacity-40 hover:bg-primary/90 transition-colors mb-0.5"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </main>
  );
}
