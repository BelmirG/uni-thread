"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { ArrowLeft, Send, MoreVertical, Trash2, X, CornerUpLeft, Plus, ImageIcon, FileText, Download, ExternalLink, GalleryHorizontalEnd, ChevronLeft, ChevronRight, Bell } from "lucide-react";
import { createPortal } from "react-dom";
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

interface DmMessage {
  id: string;
  content: string | null;
  attachments: FileAttachment[];
  shared_post: SharedPost | null;
  sender: Author;
  created_at: string;
}

interface ConvResponse {
  other_user: Author;
  messages: DmMessage[];
  is_muted: boolean;
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function MsgAttachments({ attachments, isOwn, onPreview }: {
  attachments: FileAttachment[];
  isOwn: boolean;
  onPreview: (urls: string[], index: number) => void;
}) {
  if (!attachments.length) return null;
  const images = attachments.filter(a => a.mime_type.startsWith("image/"));
  const docs = attachments.filter(a => !a.mime_type.startsWith("image/"));
  const isPdf = (a: FileAttachment) => a.mime_type === "application/pdf";
  const isText = (a: FileAttachment) => a.mime_type === "text/plain";
  const imageUrls = images.map(img => img.url);

  return (
    <div className="mt-1.5 space-y-1.5">
      {images.length > 0 && (
        <div className={cn("grid gap-1", images.length > 1 ? "grid-cols-2" : "grid-cols-1")}>
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
          {...(isPdf(a) || isText(a)
            ? { target: "_blank", rel: "noopener noreferrer" }
            : { download: a.name }
          )}
          className={cn(
            "flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs no-underline",
            isOwn ? "bg-white/15 text-white hover:bg-white/25" : "bg-muted text-foreground hover:bg-muted/80"
          )}
        >
          <FileText className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
          <span className="flex-1 min-w-0 truncate font-medium">{a.name}</span>
          <span className="opacity-60 flex-shrink-0">{fmtSize(a.size)}</span>
          {isPdf(a) || isText(a)
            ? <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-60" />
            : <Download className="w-3 h-3 flex-shrink-0 opacity-60" />
          }
        </a>
      ))}
    </div>
  );
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
  onPreviewImage,
  msgRef,
}: {
  msg: DmMessage;
  isOwn: boolean;
  isHovered: boolean;
  onSwipe: (msg: DmMessage) => void;
  onScrollToQuote: (quote: string) => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
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
        {(msg.attachments ?? []).length > 0 && (
          <MsgAttachments attachments={msg.attachments} isOwn={isOwn} onPreview={onPreviewImage} />
        )}
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

      {/* Prev */}
      {index > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onChange(index - 1); }}
          style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <ChevronLeft style={{ width: 20, height: 20 }} />
        </button>
      )}

      {/* Next */}
      {index < urls.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onChange(index + 1); }}
          style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          <ChevronRight style={{ width: 20, height: 20 }} />
        </button>
      )}

      {/* Counter */}
      {urls.length > 1 && (
        <div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: "0.75rem", padding: "4px 10px", borderRadius: 20 }}>
          {index + 1} / {urls.length}
        </div>
      )}

      {/* Close */}
      <button
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        style={{ position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: "1.2rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
      >×</button>
    </div>
  );
}

function MediaSheet({
  photos,
  docs,
  isPdf,
  isText,
  onPreview,
}: {
  photos: FileAttachment[];
  docs: FileAttachment[];
  isPdf: (a: FileAttachment) => boolean;
  isText: (a: FileAttachment) => boolean;
  onPreview: (urls: string[], index: number) => void;
}) {
  const [tab, setTab] = useState<"media" | "docs">("media");
  return (
    <>
      {/* Tab bar */}
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
            {tab === t && (
              <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
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
                    onClick={() => onPreview(photos.map(p => p.url), i)}
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
                    {...(isPdf(a) || isText(a)
                      ? { target: "_blank", rel: "noopener noreferrer" }
                      : { download: a.name }
                    )}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-border bg-muted/40 hover:bg-muted transition-colors no-underline group"
                  >
                    <FileText className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-foreground truncate">{a.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {fmtSize(a.size)}{isPdf(a) || isText(a) ? " · Opens in browser" : " · Click to download"}
                      </span>
                    </span>
                    {isPdf(a) || isText(a)
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
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{ urls: string[]; index: number } | null>(null);
  const [mediaOpen, setMediaOpen] = useState(false);
  const [isMuted, setIsMuted] = useState(false);

  const closeMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const msgRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const messagesRef = useRef<DmMessage[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => () => { if (closeMenuTimerRef.current) clearTimeout(closeMenuTimerRef.current); }, []);

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
        setIsMuted(conv.is_muted);
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

  async function uploadFile(file: File, endpoint: string): Promise<FileAttachment> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch(endpoint, { method: "POST", credentials: "include", body: fd });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { detail?: string };
      throw new Error(body.detail ?? "Upload failed");
    }
    return res.json() as Promise<FileAttachment>;
  }

  async function handleMediaSelect(e: React.ChangeEvent<HTMLInputElement>, endpoint: string) {
    const files = Array.from(e.target.files ?? []).slice(0, 5 - pendingAttachments.length);
    if (e.target) e.target.value = "";
    if (!files.length) return;
    setAttachMenuOpen(false);

    const newPending: PendingAttachment[] = files.map((f) => ({
      uid: crypto.randomUUID(),
      localUrl: f.type.startsWith("image/") ? URL.createObjectURL(f) : undefined,
      attachment: null,
      uploading: true,
      error: null,
      name: f.name,
      mime_type: f.type,
    }));
    setPendingAttachments((prev) => [...prev, ...newPending]);

    await Promise.all(
      files.map(async (file, i) => {
        const uid = newPending[i].uid;
        try {
          const raw = await uploadFile(file, endpoint);
          // The image endpoint only returns {url}. Enrich with file metadata so
          // mime_type is available for correct rendering in the chat bubble.
          const attachment: FileAttachment = {
            url: raw.url,
            name: raw.name ?? file.name,
            size: raw.size ?? file.size,
            mime_type: raw.mime_type ?? file.type,
          };
          setPendingAttachments((prev) =>
            prev.map((a) => a.uid === uid ? { ...a, attachment, uploading: false } : a)
          );
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Upload failed";
          setPendingAttachments((prev) =>
            prev.map((a) => a.uid === uid ? { ...a, uploading: false, error: msg } : a)
          );
        }
      })
    );
  }

  function removePending(uid: string) {
    setPendingAttachments((prev) => prev.filter((a) => a.uid !== uid));
  }

  function send() {
    const text = input.trim();
    const readyAttachments = pendingAttachments
      .filter((a) => a.attachment !== null)
      .map((a) => a.attachment!);
    const stillUploading = pendingAttachments.some((a) => a.uploading);

    if ((!text && readyAttachments.length === 0) || stillUploading || status !== "connected" || !wsRef.current) return;

    const wsPayload: Record<string, unknown> = {};
    if (text) {
      wsPayload.content = replyTo
        ? `> ${(replyTo.content ?? "[post]").slice(0, 80)}\n\n${text}`
        : text;
    }
    if (readyAttachments.length > 0) wsPayload.attachments = readyAttachments;

    wsRef.current.send(JSON.stringify(wsPayload));
    setInput("");
    setReplyTo(null);
    setPendingAttachments([]);
    inputRef.current?.focus();
  }

  function handleSubmit(e: React.FormEvent) { e.preventDefault(); send(); }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
  }

  function handleToggleMute() {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    apiFetch(`/api/messages/${id}/mute`, { method: newMuted ? "POST" : "DELETE" }).catch(() => {
      setIsMuted(!newMuted);
    });
  }

  function handleMenuMouseEnter() {
    if (closeMenuTimerRef.current) {
      clearTimeout(closeMenuTimerRef.current);
      closeMenuTimerRef.current = null;
    }
  }

  function handleMenuMouseLeave() {
    closeMenuTimerRef.current = setTimeout(() => {
      setMenuOpen(false);
      closeMenuTimerRef.current = null;
    }, 200);
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
          <div className="relative" onMouseEnter={handleMenuMouseEnter} onMouseLeave={handleMenuMouseLeave}>
            <button onClick={() => setMenuOpen((o) => !o)} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors">
              <MoreVertical className="w-4 h-4" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full bg-white border border-border rounded-xl shadow-lg min-w-[180px] z-[200] overflow-hidden">
                <button
                  onClick={() => { setMenuOpen(false); setMediaOpen(true); }}
                  className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                >
                  <GalleryHorizontalEnd className="w-3.5 h-3.5" />
                  Media
                </button>
                <div className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-foreground border-t border-border">
                  <Bell className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="flex-1 select-none">Notifications</span>
                  <div
                    onClick={handleToggleMute}
                    role="switch"
                    aria-checked={!isMuted}
                    className={`relative cursor-pointer inline-flex h-5 w-9 flex-shrink-0 items-center rounded-full transition-colors duration-500 ${isMuted ? "bg-orange-400" : "bg-green-500"}`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform duration-500 ease-in-out ${isMuted ? "translate-x-1" : "translate-x-[18px]"}`}
                    />
                  </div>
                </div>
                <button onClick={handleDeleteConversation} className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-destructive hover:bg-destructive/5 transition-colors border-t border-border">
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete chat
                </button>
              </div>
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
            onPreviewImage={(urls, idx) => setLightbox({ urls, index: idx })}
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

      {/* Pending attachments preview */}
      {pendingAttachments.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2 border-t border-border bg-white flex-shrink-0 flex-wrap">
          {pendingAttachments.map((p) => (
            <div key={p.uid} className="relative flex-shrink-0">
              {p.localUrl ? (
                <img
                  src={p.localUrl}
                  alt={p.name}
                  onClick={() => !p.uploading && setLightbox({ urls: [p.localUrl!], index: 0 })}
                  className="w-14 h-14 rounded-lg object-cover border border-border cursor-zoom-in"
                />
              ) : (
                <div className="flex items-center gap-1.5 bg-muted rounded-lg px-2.5 py-1.5 text-xs max-w-[140px]">
                  <FileText className="w-3.5 h-3.5 flex-shrink-0 text-muted-foreground" />
                  <span className="truncate text-foreground">{p.name}</span>
                </div>
              )}
              {p.uploading && (
                <div className="absolute inset-0 rounded-lg bg-black/40 flex items-center justify-center">
                  <span className="text-[10px] text-white">…</span>
                </div>
              )}
              {p.error && (
                <div className="absolute inset-0 rounded-lg bg-destructive/30 flex items-center justify-center">
                  <span className="text-[10px] text-destructive font-semibold">!</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => removePending(p.uid)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-foreground text-background flex items-center justify-center"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input */}
      <form onSubmit={handleSubmit} className="flex items-end gap-2 px-3 py-3 border-t border-border bg-white flex-shrink-0">
        {/* Hidden file inputs */}
        <input
          ref={photoInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          className="hidden"
          onChange={(e) => handleMediaSelect(e, "/api/upload")}
        />
        <input
          ref={fileInputRef}
          type="file"
          accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,.txt,.md,.csv,.py,.js,.ts,.jsx,.tsx,.java,.c,.cpp,.h,.cs,.go,.rs,.rb,.php,.json,.yaml,.yml,.toml,.xml,.sh,.sql,.r,.ipynb"
          multiple
          className="hidden"
          onChange={(e) => handleMediaSelect(e, "/api/upload/file")}
        />

        {/* + button with attach menu */}
        <div className="relative flex-shrink-0 mb-0.5">
          <button
            type="button"
            onClick={() => setAttachMenuOpen((o) => !o)}
            disabled={status !== "connected" || pendingAttachments.length >= 5}
            className="w-10 h-10 rounded-full border border-input bg-background flex items-center justify-center text-muted-foreground hover:bg-muted transition-colors disabled:opacity-40"
          >
            <Plus className="w-4 h-4" />
          </button>
          {attachMenuOpen && (
            <>
              <div onClick={() => setAttachMenuOpen(false)} className="fixed inset-0 z-[198]" />
              <div className="absolute bottom-[calc(100%+6px)] left-0 bg-white border border-border rounded-xl shadow-lg z-[199] overflow-hidden min-w-[140px]">
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                >
                  <ImageIcon className="w-4 h-4 text-blue-500" />
                  Photo
                </button>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors border-t border-border"
                >
                  <FileText className="w-4 h-4 text-orange-500" />
                  File
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
          disabled={
            status !== "connected" ||
            pendingAttachments.some((a) => a.uploading) ||
            (!input.trim() && !pendingAttachments.some((a) => a.attachment))
          }
          className="w-10 h-10 rounded-full bg-primary text-primary-foreground flex items-center justify-center flex-shrink-0 disabled:opacity-40 hover:bg-primary/90 transition-colors mb-0.5"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>

      {/* Media sheet */}
      {mediaOpen && (() => {
        const allAttachments = messages.flatMap((m) => m.attachments ?? []);
        const photos = allAttachments.filter((a) => a.mime_type.startsWith("image/"));
        const docs = allAttachments.filter((a) => !a.mime_type.startsWith("image/"));
        const isPdf = (a: FileAttachment) => a.mime_type === "application/pdf";
        const isText = (a: FileAttachment) => a.mime_type === "text/plain";
        return (
          <>
            <div onClick={() => setMediaOpen(false)} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]" />
            <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-[600px] bg-white rounded-2xl z-[101] shadow-2xl max-h-[70vh] flex flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
                <span className="font-semibold text-sm">Media &amp; Files</span>
                <button onClick={() => setMediaOpen(false)} className="rounded-full p-1 hover:bg-muted text-muted-foreground transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tabs */}
              <MediaSheet
                photos={photos}
                docs={docs}
                isPdf={isPdf}
                isText={isText}
                onPreview={(urls, idx) => setLightbox({ urls, index: idx })}
              />
            </div>
          </>
        );
      })()}

      {/* Image lightbox portal */}
      {lightbox && createPortal(
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
