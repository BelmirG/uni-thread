"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import {
  ArrowLeft, Send, X, CornerUpLeft, Plus, ImageIcon, FileText,
  Download, ExternalLink, MoreVertical, GalleryHorizontalEnd,
  ChevronLeft, ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface FileAttachment {
  url: string;
  name: string;
  size: number;
  mime_type: string;
}

interface PendingAttachment {
  uid: string;
  localUrl?: string;
  attachment: FileAttachment | null;
  uploading: boolean;
  error: string | null;
  name: string;
  mime_type: string;
}

interface Author {
  username: string;
  display_name: string;
  avatar_url?: string | null;
}

interface ChatMessage {
  id: string;
  content: string | null;
  attachments: FileAttachment[];
  author: Author;
  created_at: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseQuote(content: string | null): { quote: string | null; body: string } {
  if (!content) return { quote: null, body: "" };
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

function authorColor(username: string) {
  let hash = 0;
  for (let i = 0; i < username.length; i++) hash = (hash * 31 + username.charCodeAt(i)) >>> 0;
  return NAME_COLORS[hash % NAME_COLORS.length];
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

function LightboxPortal({ urls, index, onChange, onClose }: {
  urls: string[];
  index: number;
  onChange: (idx: number) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft" && index > 0) onChange(index - 1);
      if (e.key === "ArrowRight" && index < urls.length - 1) onChange(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, urls.length, onChange, onClose]);

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center" }}
    >
      <img
        src={urls[index]}
        alt="Preview"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 8 }}
      />
      {index > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onChange(index - 1); }}
          style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <ChevronLeft style={{ width: 20, height: 20 }} />
        </button>
      )}
      {index < urls.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onChange(index + 1); }}
          style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <ChevronRight style={{ width: 20, height: 20 }} />
        </button>
      )}
      {urls.length > 1 && (
        <div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: "0.75rem", padding: "4px 10px", borderRadius: 20 }}>
          {index + 1} / {urls.length}
        </div>
      )}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{ position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: "1.2rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
      >×</button>
    </div>
  );
}

// ── Media sheet ───────────────────────────────────────────────────────────────

function MediaSheet({ photos, docs, onPreview }: {
  photos: FileAttachment[];
  docs: FileAttachment[];
  onPreview: (urls: string[], index: number) => void;
}) {
  const [tab, setTab] = useState<"media" | "docs">("media");
  const allPhotoUrls = photos.map((p) => p.url);
  const isInline = (a: FileAttachment) =>
    a.mime_type === "application/pdf" || a.mime_type === "text/plain";

  return (
    <>
      <div className="flex border-b border-border flex-shrink-0">
        {(["media", "docs"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 py-2.5 text-sm font-semibold transition-colors relative",
              tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {t === "media" ? "Media" : "Docs"}
            {tab === t && <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary rounded-full" />}
          </button>
        ))}
      </div>
      <div className="overflow-y-auto flex-1 p-4">
        {tab === "media" && (
          photos.length === 0
            ? <p className="text-sm text-muted-foreground text-center py-10">No photos yet.</p>
            : <div className="grid grid-cols-7 gap-0.5">
                {photos.map((a, i) => (
                  <img
                    key={i}
                    src={a.url}
                    alt={a.name}
                    onClick={() => onPreview(allPhotoUrls, i)}
                    className="aspect-square object-cover rounded-sm cursor-zoom-in w-full"
                  />
                ))}
              </div>
        )}
        {tab === "docs" && (
          docs.length === 0
            ? <p className="text-sm text-muted-foreground text-center py-10">No files yet.</p>
            : <div className="space-y-2 mx-4">
                {docs.map((a, i) => (
                  <a
                    key={i}
                    href={a.url}
                    {...(isInline(a)
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : { download: a.name }
                    )}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-muted/40 hover:bg-muted transition-colors no-underline group"
                  >
                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-foreground truncate">{a.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {fmtSize(a.size)}{isInline(a) ? " · Opens in browser" : " · Click to download"}
                      </span>
                    </span>
                    {isInline(a)
                      ? <ExternalLink className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground flex-shrink-0" />
                      : <Download className="w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground flex-shrink-0" />
                    }
                  </a>
                ))}
              </div>
        )}
      </div>
    </>
  );
}

// ── Bubble attachments ────────────────────────────────────────────────────────

function BubbleAttachments({ attachments, isOwn, onPreview }: {
  attachments: FileAttachment[];
  isOwn: boolean;
  onPreview: (urls: string[], index: number) => void;
}) {
  if (!attachments.length) return null;
  const images = attachments.filter((a) => a.mime_type.startsWith("image/"));
  const docs = attachments.filter((a) => !a.mime_type.startsWith("image/"));
  const imageUrls = images.map((img) => img.url);
  const isInline = (a: FileAttachment) =>
    a.mime_type === "application/pdf" || a.mime_type === "text/plain";

  return (
    <div className="flex flex-col gap-1 mt-1">
      {images.length > 0 && (
        <div className={cn("grid gap-1", images.length === 1 ? "grid-cols-1" : "grid-cols-2")}>
          {images.map((a, i) => (
            <img
              key={i}
              src={a.url}
              alt={a.name}
              onClick={() => onPreview(imageUrls, i)}
              className="rounded-lg object-cover cursor-zoom-in w-full"
              style={{ maxHeight: 200 }}
            />
          ))}
        </div>
      )}
      {docs.map((a, i) => (
        <a
          key={i}
          href={a.url}
          {...(isInline(a)
            ? { target: "_blank", rel: "noopener noreferrer" }
            : { download: a.name }
          )}
          className={cn(
            "flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-xs no-underline group",
            isOwn ? "bg-white/15 hover:bg-white/25" : "bg-muted hover:bg-muted/80"
          )}
        >
          <FileText className={cn("w-3.5 h-3.5 flex-shrink-0", isOwn ? "text-white/70" : "text-muted-foreground")} />
          <span className="flex-1 min-w-0">
            <span className={cn("block truncate font-medium", isOwn ? "text-white/90" : "text-foreground")}>{a.name}</span>
            <span className={cn(isOwn ? "text-white/50" : "text-muted-foreground")}>{fmtSize(a.size)}</span>
          </span>
          {isInline(a)
            ? <ExternalLink className={cn("w-3 h-3 flex-shrink-0", isOwn ? "text-white/50" : "text-muted-foreground")} />
            : <Download className={cn("w-3 h-3 flex-shrink-0", isOwn ? "text-white/50" : "text-muted-foreground")} />
          }
        </a>
      ))}
    </div>
  );
}

// ── Swipeable bubble ──────────────────────────────────────────────────────────

function SwipeableBubble({
  msg, isOwn, showName, isLast, onSwipe, onScrollToQuote, onPreviewImage, msgRef,
}: {
  msg: ChatMessage;
  isOwn: boolean;
  showName: boolean;
  isLast: boolean;
  onSwipe: (msg: ChatMessage) => void;
  onScrollToQuote: (quote: string) => void;
  onPreviewImage: (urls: string[], index: number) => void;
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

  const { quote, body } = parseQuote(msg.content);
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
          <Link href={`/profile/${msg.author.username}`} className={cn("text-[11px] font-semibold mb-0.5 px-1 hover:underline", color)}>
            {msg.author.display_name}
          </Link>
        )}
        <div
          className={cn(
            "px-3.5 py-2 text-sm leading-snug flex flex-col",
            isOwn
              ? cn("bg-primary text-primary-foreground", isLast ? "rounded-2xl rounded-br-sm" : "rounded-xl")
              : cn("bg-white border border-border text-foreground", isLast ? "rounded-2xl rounded-bl-sm" : "rounded-xl")
          )}
          style={{ transform: `translateX(${offset}px)`, transition: offset === 0 ? "transform 0.2s ease" : "none" }}
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
            >
              <span className="line-clamp-2 break-words">{quote}</span>
            </button>
          )}
          {body && <span className="whitespace-pre-wrap break-words">{body}</span>}
          <BubbleAttachments attachments={msg.attachments ?? []} isOwn={isOwn} onPreview={onPreviewImage} />
          {isLast && (
            <span className={cn("text-[10px] self-end mt-1 ml-2 flex-shrink-0", isOwn ? "text-primary-foreground/50" : "text-muted-foreground")}>
              {timeLabel(msg.created_at)}
            </span>
          )}
        </div>
      </div>
      <button
        onClick={() => onSwipeRef.current(msg)}
        className="flex-shrink-0 self-center p-1 rounded-full text-muted-foreground"
        style={{ opacity: replyBtnOpacity, transition: offset === 0 ? "opacity 0.15s" : "none", pointerEvents: replyBtnOpacity > 0 ? "auto" : "none" }}
        tabIndex={-1}
      >
        <CornerUpLeft className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function ClubChatPage() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [clubName, setClubName] = useState("");
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [input, setInput] = useState("");
  const [replyTo, setReplyTo] = useState<ChatMessage | null>(null);
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const msgRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const messagesRef = useRef<ChatMessage[]>([]);
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

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

  async function uploadFile(file: File): Promise<{ attachment: FileAttachment | null; localUrl?: string }> {
    const isImage = file.type.startsWith("image/");
    const localUrl = isImage ? URL.createObjectURL(file) : undefined;
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch(isImage ? "/api/upload" : "/api/upload/file", {
        method: "POST", credentials: "include", body: fd,
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(body.detail ?? "Upload failed");
      }
      const raw = await res.json() as { url?: string; name?: string; size?: number; mime_type?: string };
      return {
        attachment: { url: raw.url ?? "", name: raw.name ?? file.name, size: raw.size ?? file.size, mime_type: raw.mime_type ?? file.type },
        localUrl,
      };
    } catch {
      return { attachment: null, localUrl };
    }
  }

  async function handleMediaSelect(files: FileList | null) {
    if (!files || !files.length) return;
    setAttachMenuOpen(false);
    const chosen = Array.from(files).slice(0, 5 - pendingAttachments.length);
    const placeholders: PendingAttachment[] = chosen.map((f) => ({
      uid: `${Date.now()}-${Math.random()}`,
      localUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
      attachment: null, uploading: true, error: null, name: f.name, mime_type: f.type,
    }));
    setPendingAttachments((prev) => [...prev, ...placeholders]);
    await Promise.all(chosen.map(async (file, i) => {
      const uid = placeholders[i].uid;
      const { attachment, localUrl } = await uploadFile(file);
      setPendingAttachments((prev) =>
        prev.map((p) =>
          p.uid === uid
            ? { ...p, attachment, uploading: false, localUrl: localUrl ?? p.localUrl, error: attachment ? null : "Upload failed" }
            : p
        )
      );
    }));
  }

  function send() {
    if (status !== "connected" || !wsRef.current) return;
    const text = input.trim();
    const readyAttachments = pendingAttachments.filter((p) => p.attachment !== null).map((p) => p.attachment!);
    if (!text && !readyAttachments.length) return;
    if (pendingAttachments.some((p) => p.uploading)) return;

    const contentWithQuote = replyTo && text ? `> ${(replyTo.content ?? "").slice(0, 80)}\n\n${text}` : text;
    wsRef.current.send(JSON.stringify({ content: contentWithQuote || undefined, attachments: readyAttachments }));
    setInput("");
    setReplyTo(null);
    setPendingAttachments([]);
    inputRef.current?.focus();
  }

  function handleSubmit(e: React.FormEvent) { e.preventDefault(); send(); }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function scrollToQuote(quote: string) {
    const target = messagesRef.current.find((m) => m.content === quote || (m.content ?? "").startsWith(quote));
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

  const grouped = messages.reduce<{ author: Author; msgs: ChatMessage[] }[]>((acc, msg) => {
    const last = acc[acc.length - 1];
    if (last && last.author.username === msg.author.username) last.msgs.push(msg);
    else acc.push({ author: msg.author, msgs: [msg] });
    return acc;
  }, []);

  const canSend = status === "connected" && (
    input.trim().length > 0 ||
    (pendingAttachments.some((p) => p.attachment !== null) && !pendingAttachments.some((p) => p.uploading))
  );

  // Media sheet data
  const allAttachments = messages.flatMap((m) => m.attachments ?? []);
  const mediaPhotos = allAttachments.filter((a) => a.mime_type.startsWith("image/"));
  const mediaDocs = allAttachments.filter((a) => !a.mime_type.startsWith("image/"));

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
        {/* Three-dots menu */}
        <div className="relative">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && (
            <>
              <div onClick={() => setMenuOpen(false)} className="fixed inset-0 z-[199]" />
              <div className="absolute right-0 top-[calc(100%+4px)] bg-white border border-border rounded-xl shadow-lg min-w-[160px] z-[200] overflow-hidden">
                <button
                  onClick={() => { setMenuOpen(false); setMediaOpen(true); }}
                  className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                >
                  <GalleryHorizontalEnd className="w-3.5 h-3.5" />
                  Media
                </button>
              </div>
            </>
          )}
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
                  onPreviewImage={(urls, idx) => setLightbox({ urls, index: idx })}
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
            {(replyTo.content ?? "").slice(0, 80)}
          </p>
          <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Pending attachments strip */}
      {pendingAttachments.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-t border-border bg-white flex-shrink-0 overflow-x-auto">
          {pendingAttachments.map((p) => (
            <div key={p.uid} className="relative flex-shrink-0">
              {p.localUrl ? (
                <img src={p.localUrl} alt={p.name} className="w-14 h-14 object-cover rounded-lg border border-border" />
              ) : (
                <div className="w-14 h-14 rounded-lg border border-border bg-muted flex flex-col items-center justify-center gap-1 px-1">
                  <FileText className="w-4 h-4 text-muted-foreground" />
                  <span className="text-[9px] text-muted-foreground text-center truncate w-full px-0.5">{p.name}</span>
                </div>
              )}
              {p.uploading && (
                <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
                  <span className="text-white text-[9px]">…</span>
                </div>
              )}
              <button
                onClick={() => setPendingAttachments((prev) => prev.filter((a) => a.uid !== p.uid))}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-foreground text-background flex items-center justify-center"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2 px-4 py-3 border-t border-border bg-white flex-shrink-0">
        <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple className="hidden" onChange={(e) => handleMediaSelect(e.target.files)} />
        <input ref={fileInputRef} type="file" accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.csv,.py,.js,.ts,.jsx,.tsx,.java,.c,.cpp,.h,.cs,.go,.rs,.rb,.php,.json,.yaml,.yml,.toml,.xml,.sh,.sql" multiple className="hidden" onChange={(e) => handleMediaSelect(e.target.files)} />

        {/* Attach button */}
        <div className="relative flex-shrink-0 self-end mb-0.5">
          <button
            type="button"
            onClick={() => setAttachMenuOpen((o) => !o)}
            disabled={status !== "connected"}
            className="w-9 h-9 rounded-full border border-input bg-background flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40"
          >
            <Plus className="w-4 h-4" />
          </button>
          {attachMenuOpen && (
            <>
              <div onClick={() => setAttachMenuOpen(false)} className="fixed inset-0 z-[10]" />
              <div className="absolute bottom-[calc(100%+6px)] left-0 bg-white border border-border rounded-xl shadow-lg min-w-[140px] z-[20] overflow-hidden">
                <button type="button" onClick={() => { setAttachMenuOpen(false); photoInputRef.current?.click(); }} className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors">
                  <ImageIcon className="w-3.5 h-3.5 text-muted-foreground" /> Photo
                </button>
                <button type="button" onClick={() => { setAttachMenuOpen(false); fileInputRef.current?.click(); }} className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors border-t border-border">
                  <FileText className="w-3.5 h-3.5 text-muted-foreground" /> File
                </button>
              </div>
            </>
          )}
        </div>

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
          disabled={!canSend}
          className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 disabled:opacity-40 hover:bg-primary/90 transition-colors mb-0.5"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

      {/* Media sheet */}
      {mediaOpen && (
        <>
          <div onClick={() => setMediaOpen(false)} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]" />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[600px] bg-white rounded-2xl z-[101] shadow-2xl max-h-[70vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
              <span className="font-semibold text-sm">Media &amp; Files</span>
              <button onClick={() => setMediaOpen(false)} className="rounded-full p-1 hover:bg-muted text-muted-foreground transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <MediaSheet
              photos={mediaPhotos}
              docs={mediaDocs}
              onPreview={(urls, idx) => setLightbox({ urls, index: idx })}
            />
          </div>
        </>
      )}

      {/* Lightbox */}
      {lightbox && typeof document !== "undefined" && createPortal(
        <LightboxPortal
          urls={lightbox.urls}
          index={lightbox.index}
          onChange={(idx) => setLightbox((l) => l ? { ...l, index: idx } : null)}
          onClose={() => setLightbox(null)}
        />,
        document.body
      )}
    </main>
  );
}
