"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { ArrowLeft, Send, X, CornerUpLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface Author {
  username: string;
  display_name: string;
}

interface ChatMessage {
  id: string;
  content: string;
  author: Author;
  created_at: string;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function parseContent(content: string): { quote: string | null; body: string } {
  if (content.startsWith("> ")) {
    const sep = content.indexOf("\n\n");
    if (sep !== -1) return { quote: content.slice(2, sep), body: content.slice(sep + 2) };
  }
  return { quote: null, body: content };
}

const NAME_COLORS = [
  "text-rose-600", "text-orange-500", "text-amber-600",
  "text-green-600", "text-teal-600", "text-cyan-600",
  "text-violet-600", "text-purple-600", "text-pink-600", "text-indigo-500",
];

function authorColor(username: string): string {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
  return NAME_COLORS[hash % NAME_COLORS.length];
}

function SwipeableBubble({
  msg,
  isOwn,
  showName,
  isLast,
  onSwipe,
  onScrollToQuote,
  msgRef,
}: {
  msg: ChatMessage;
  isOwn: boolean;
  showName: boolean;
  isLast: boolean;
  onSwipe: (msg: ChatMessage) => void;
  onScrollToQuote: (quote: string) => void;
  msgRef: (el: HTMLDivElement | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);
  const offsetRef = useRef(0);
  const onSwipeRef = useRef(onSwipe);
  const [offset, setOffset] = useState(0);
  const [hovered, setHovered] = useState(false);

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
  const color = authorColor(msg.author.username);
  const replyBtnOpacity = offset > 10 ? Math.min(offset / 40, 1) : hovered ? 1 : 0;

  return (
    <div
      ref={(el) => { containerRef.current = el; msgRef(el); }}
      className={cn("flex w-full items-end gap-1.5", isOwn ? "flex-row-reverse" : "flex-row")}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex flex-col max-w-[72%]">
        {showName && !isOwn && (
          <span className={cn("text-[11px] font-semibold mb-0.5 px-1", color)}>
            {msg.author.display_name}
          </span>
        )}
        <div
          className={cn(
            "px-3.5 py-2 text-sm leading-snug flex flex-col",
            isOwn
              ? cn("bg-primary text-primary-foreground", isLast ? "rounded-2xl rounded-br-sm" : "rounded-xl")
              : cn("bg-white border border-border text-foreground", isLast ? "rounded-2xl rounded-bl-sm" : "rounded-xl")
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
          <span className="whitespace-pre-wrap break-words">{body}</span>
          {isLast && (
            <span className={cn("text-[10px] self-end mt-1 ml-2 flex-shrink-0", isOwn ? "text-primary-foreground/50" : "text-muted-foreground")}>
              {timeLabel(msg.created_at)}
            </span>
          )}
        </div>
      </div>

      {/* Reply button: fades in on hover (desktop) or swipe (mobile) */}
      <button
        onClick={() => onSwipeRef.current(msg)}
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

export default function ClubChatPage() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [clubName, setClubName] = useState("");
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const msgRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const messagesRef = useRef<ChatMessage[]>([]);

  useEffect(() => { messagesRef.current = messages; }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const [history, me, club] = await Promise.all([
          apiFetch<ChatMessage[]>(`/api/clubs/${slug}/chat`),
          apiFetch<{ username: string }>("/api/auth/me"),
          apiFetch<{ name: string }>(`/api/clubs/${slug}`),
        ]);
        if (cancelled) return;
        setMessages(history);
        setCurrentUsername(me.username);
        setClubName(club.name);
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
        else if (err instanceof ApiError && err.status === 403) router.replace(`/clubs/${slug}`);
        return;
      }

      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${window.location.host}/api/clubs/${slug}/chat/ws`);
      wsRef.current = ws;
      ws.onopen = () => setStatus("connected");
      ws.onmessage = (event) => {
        const msg: ChatMessage = JSON.parse(event.data);
        setMessages((prev) => [...prev, msg]);
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
  }, [slug, router]);

  function scrollToQuote(quote: string) {
    const all = messagesRef.current;
    const target = all.find((m) => m.content === quote || m.content.startsWith(quote));
    if (!target) return;
    const el = msgRefs.current.get(target.id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
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
      ? `> ${replyTo.content.slice(0, 80)}\n\n${text}`
      : text;
    wsRef.current.send(payload);
    setInput("");
    setReplyTo(null);
    inputRef.current?.focus();
  }

  function handleSubmit(e: React.FormEvent) { e.preventDefault(); send(); }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  const grouped = messages.reduce<{ author: Author; msgs: ChatMessage[] }[]>((acc, msg) => {
    const last = acc[acc.length - 1];
    if (last && last.author.username === msg.author.username) {
      last.msgs.push(msg);
    } else {
      acc.push({ author: msg.author, msgs: [msg] });
    }
    return acc;
  }, []);

  return (
    <main className="fixed top-0 bottom-[60px] left-1/2 -translate-x-1/2 w-full max-w-[700px] flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-border bg-white flex-shrink-0">
        <Link href={`/clubs/${slug}`} className="flex items-center text-muted-foreground hover:text-foreground transition-colors no-underline flex-shrink-0">
          <ArrowLeft className="w-4 h-4" />
        </Link>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-foreground truncate">{clubName || "Chat"}</p>
          <p className="text-[11px] text-muted-foreground">Club chat</p>
        </div>
        <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
          <span className={cn("w-2 h-2 rounded-full", status === "connected" ? "bg-green-500" : status === "connecting" ? "bg-yellow-400" : "bg-destructive")} />
          <span className="text-muted-foreground">
            {status === "connected" ? "Live" : status === "connecting" ? "Connecting…" : "Disconnected"}
          </span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-1 bg-muted/30">
        {messages.length === 0 && status === "connected" && (
          <p className="text-muted-foreground text-sm text-center m-auto">No messages yet. Say hello!</p>
        )}
        {grouped.map((group, gi) => {
          const isOwn = group.author.username === currentUsername;
          return (
            <div key={gi} className="flex flex-col gap-0.5 mb-1">
              {group.msgs.map((msg, mi) => (
                <SwipeableBubble
                  key={msg.id}
                  msg={msg}
                  isOwn={isOwn}
                  showName={mi === 0}
                  isLast={mi === group.msgs.length - 1}
                  onSwipe={(m) => { setReplyTo(m); setTimeout(() => inputRef.current?.focus(), 50); }}
                  onScrollToQuote={scrollToQuote}
                  msgRef={(el) => {
                    if (el) msgRefs.current.set(msg.id, el);
                    else msgRefs.current.delete(msg.id);
                  }}
                />
              ))}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Reply preview */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2 bg-muted/60 border-t border-border flex-shrink-0">
          <CornerUpLeft className="w-3.5 h-3.5 text-primary flex-shrink-0" />
          <p className="flex-1 text-xs text-muted-foreground truncate">
            <span className="font-medium text-foreground">{replyTo.author.display_name}:</span>{" "}
            {replyTo.content.slice(0, 80)}
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
