"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { openChatSocket, type ChatSocket } from "@/lib/chatSocket";
import { getDmCache, saveDmCache } from "@/lib/chatCache";
import { compressImage } from "@/lib/imageCompress";
import { ArrowLeft, Send, MoreVertical, Trash2, X, CornerUpLeft, Plus, ImageIcon, FileText, Download, ExternalLink, GalleryHorizontalEnd, ChevronLeft, ChevronRight, Bell, Check, ListChecks } from "lucide-react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import MiniAvatar from "@/components/MiniAvatar";
import { Linkify } from "@/lib/linkify";

const IUS_BLUE = "#3865a6";
// Own-message bubble: a soft vertical gradient reads richer than a flat fill.
const OWN_BUBBLE_BG = "linear-gradient(135deg, #4a7cc0 0%, #3865a6 100%)";

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
  // Optimistic-send bookkeeping (client-side only; client_id also arrives on
  // the server echo so the pending bubble can be swapped for the real message).
  client_id?: string;
  pending?: boolean;
  failed?: boolean;
}

interface DmSnapshot {
  messages: DmMessage[];
  otherUser: Author;
  isMuted: boolean;
  me: Author;
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
  const isInline = (a: FileAttachment) => a.mime_type === "application/pdf" || a.mime_type === "text/plain";
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
              loading="lazy"
              decoding="async"
              onClick={() => onPreview(imageUrls, i)}
              className="rounded-xl object-cover cursor-zoom-in w-full"
              style={{ maxHeight: 220 }}
            />
          ))}
        </div>
      )}
      {docs.map((a, i) => (
        <a
          key={i}
          href={a.url}
          {...(isInline(a) ? { target: "_blank", rel: "noopener noreferrer" } : { download: a.name })}
          className={cn(
            "flex items-center gap-2 px-2.5 py-2 rounded-xl text-xs no-underline",
            isOwn ? "bg-white/15 text-white hover:bg-white/25" : "bg-surface-container text-on-surface hover:bg-surface-container-high"
          )}
        >
          <FileText className="w-3.5 h-3.5 flex-shrink-0 opacity-70" />
          <span className="flex-1 min-w-0 truncate font-medium">{a.name}</span>
          <span className="opacity-60 flex-shrink-0">{fmtSize(a.size)}</span>
          {isInline(a) ? <ExternalLink className="w-3 h-3 flex-shrink-0 opacity-60" /> : <Download className="w-3 h-3 flex-shrink-0 opacity-60" />}
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
      <div className={cn("mt-1.5 px-3 py-2 rounded-xl text-xs italic", isOwn ? "bg-white/15 text-white/80" : "bg-surface-container text-on-surface-variant")}>
        [deleted post]
      </div>
    );
  }
  return (
    <Link href={href} className={cn("mt-1.5 px-3 py-2 rounded-xl text-xs block no-underline border-l-2", isOwn ? "bg-white/15 text-white border-white/40" : "bg-surface-container text-on-surface border-primary/40")}>
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
  msg, isOwn, isHovered, selectMode, selected, onSwipe, onScrollToQuote, onHoverEnter, onHoverLeave, onPreviewImage, onRetry, onToggleSelect, onLongPress, msgRef,
}: {
  msg: DmMessage;
  isOwn: boolean;
  isHovered: boolean;
  selectMode: boolean;
  selected: boolean;
  onSwipe: (msg: DmMessage) => void;
  onScrollToQuote: (quote: string) => void;
  onHoverEnter: () => void;
  onHoverLeave: () => void;
  onPreviewImage: (urls: string[], index: number) => void;
  onRetry: () => void;
  onToggleSelect: () => void;
  onLongPress: () => void;
  msgRef: (el: HTMLDivElement | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const startX = useRef(0);
  const startY = useRef(0);
  const tracking = useRef(false);
  const offsetRef = useRef(0);
  const onSwipeRef = useRef(onSwipe);
  const [offset, setOffset] = useState(0);

  // Only your own, server-confirmed messages can be selected for deletion.
  const selectable = isOwn && !msg.pending && !msg.failed;

  // The touch handlers below are bound once, so anything they need at
  // event-time lives in refs.
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);
  const selectModeRef = useRef(selectMode);
  const selectableRef = useRef(selectable);
  const onLongPressRef = useRef(onLongPress);

  useEffect(() => {
    onSwipeRef.current = onSwipe;
    selectModeRef.current = selectMode;
    selectableRef.current = selectable;
    onLongPressRef.current = onLongPress;
  });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const cancelHold = () => {
      if (holdTimer.current) {
        clearTimeout(holdTimer.current);
        holdTimer.current = null;
      }
    };
    const ts = (e: TouchEvent) => {
      startX.current = e.touches[0].clientX;
      startY.current = e.touches[0].clientY;
      tracking.current = false;
      longPressFired.current = false;
      offsetRef.current = 0;
      setOffset(0);
      // Press-and-hold on your own message enters selection mode.
      if (!selectModeRef.current && selectableRef.current) {
        holdTimer.current = setTimeout(() => {
          holdTimer.current = null;
          longPressFired.current = true;
          onLongPressRef.current();
        }, 450);
      }
    };
    const tm = (e: TouchEvent) => {
      const dx = e.touches[0].clientX - startX.current;
      const dy = e.touches[0].clientY - startY.current;
      if (Math.abs(dx) > 8 || Math.abs(dy) > 8) cancelHold();
      if (selectModeRef.current || longPressFired.current) return; // no swipe-reply while selecting
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
      cancelHold();
      if (longPressFired.current) {
        offsetRef.current = 0;
        setOffset(0);
        return;
      }
      if (offsetRef.current >= 40) onSwipeRef.current(msg);
      offsetRef.current = 0;
      setOffset(0);
    };
    el.addEventListener("touchstart", ts, { passive: true });
    el.addEventListener("touchmove", tm, { passive: false });
    el.addEventListener("touchend", te);
    return () => {
      cancelHold();
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
      className={cn(
        "flex w-full items-end gap-1.5",
        isOwn ? "flex-row-reverse" : "flex-row",
        selectMode && "select-none",
        selectMode && !selectable && "opacity-40",
        selectMode && selectable && "cursor-pointer"
      )}
      // Suppress the iOS long-press callout so press-and-hold reliably enters
      // selection mode instead of the system menu.
      style={{ WebkitTouchCallout: "none" }}
      onMouseEnter={onHoverEnter}
      onMouseLeave={onHoverLeave}
      // In selection mode a tap anywhere on the row toggles it — capture phase
      // so inner links/images/buttons don't fire instead.
      onClickCapture={selectMode ? (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (selectable) onToggleSelect();
      } : undefined}
    >
      {!isOwn && (
        <div className="flex-shrink-0 mb-0.5">
          <MiniAvatar name={msg.sender.display_name} url={msg.sender.avatar_url ?? null} size={28} />
        </div>
      )}

      <div
        className={cn(
          "max-w-[80%] sm:max-w-[72%] px-3.5 py-2.5 text-sm leading-snug flex flex-col",
          isOwn
            ? "text-white rounded-2xl rounded-br-md shadow-sm"
            : "bg-surface-container text-on-surface rounded-2xl rounded-bl-md",
          selected && "ring-2 ring-primary/70"
        )}
        style={{
          background: isOwn ? OWN_BUBBLE_BG : undefined,
          opacity: msg.pending ? 0.7 : 1,
          transform: `translateX(${offset}px)`,
          transition: offset === 0 ? "transform 0.22s cubic-bezier(0.34,1.56,0.64,1)" : "none",
        }}
      >
        {quote && (
          <button
            onClick={() => onScrollToQuote(quote)}
            className={cn(
              "text-left text-xs px-2.5 py-1.5 rounded-lg mb-2 border-l-2 w-full cursor-pointer transition-colors",
              isOwn
                ? "bg-white/15 border-white/40 text-white/80 hover:bg-white/25"
                : "bg-surface-container border-primary/40 text-on-surface-variant hover:bg-surface-container-high"
            )}
          >
            <span className="line-clamp-2 break-words">{quote}</span>
          </button>
        )}
        {body && <Linkify text={body} isOwn={isOwn} />}
        {(msg.attachments ?? []).length > 0 && (
          <MsgAttachments attachments={msg.attachments} isOwn={isOwn} onPreview={onPreviewImage} />
        )}
        {msg.shared_post && <SharedPostCard post={msg.shared_post} isOwn={isOwn} />}
        {msg.failed ? (
          <button
            onClick={onRetry}
            className="text-[10px] self-end mt-1.5 ml-2 flex-shrink-0 font-semibold underline text-red-200"
          >
            Not sent — tap to retry
          </button>
        ) : (
          <span className={cn(
            "text-[10px] self-end mt-1.5 ml-2 flex-shrink-0",
            isOwn ? "text-white/45" : "text-on-surface-variant"
          )}>
            {msg.pending ? "Sending…" : timeLabel(msg.created_at)}
          </span>
        )}
      </div>

      {!selectMode && (
        <button
          onClick={() => { onHoverLeave(); onSwipeRef.current(msg); }}
          className="flex-shrink-0 self-center p-1 rounded-full text-on-surface-variant"
          style={{
            opacity: replyBtnOpacity,
            transition: offset === 0 ? "opacity 0.15s" : "none",
            pointerEvents: replyBtnOpacity > 0 ? "auto" : "none",
          }}
          tabIndex={-1}
        >
          <CornerUpLeft className="w-3.5 h-3.5" />
        </button>
      )}
      {/* Selection circle — last flex child, so on own (row-reversed) rows it
          sits at the far left edge, WhatsApp-style. */}
      {selectMode && selectable && (
        <span
          className={cn(
            "flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center self-center transition-colors",
            selected ? "bg-primary border-primary text-primary-foreground" : "border-outline-variant"
          )}
        >
          {selected && <Check className="w-3 h-3" />}
        </span>
      )}
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
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 9999, background: "rgba(0,0,0,0.92)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <img src={urls[index]} alt="Preview" onClick={(e) => e.stopPropagation()} style={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: 10 }} />
      {index > 0 && (
        <button onClick={(e) => { e.stopPropagation(); onChange(index - 1); }} style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ChevronLeft style={{ width: 20, height: 20 }} />
        </button>
      )}
      {index < urls.length - 1 && (
        <button onClick={(e) => { e.stopPropagation(); onChange(index + 1); }} style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", width: 40, height: 40, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <ChevronRight style={{ width: 20, height: 20 }} />
        </button>
      )}
      {urls.length > 1 && (
        <div style={{ position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)", background: "rgba(0,0,0,0.5)", color: "#fff", fontSize: "0.75rem", padding: "4px 10px", borderRadius: 20 }}>
          {index + 1} / {urls.length}
        </div>
      )}
      <button onClick={(e) => { e.stopPropagation(); onClose(); }} style={{ position: "absolute", top: 16, right: 16, width: 36, height: 36, borderRadius: "50%", background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", fontSize: "1.2rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>×</button>
    </div>
  );
}

function MediaSheet({ photos, docs, isPdf, isText, onPreview }: {
  photos: FileAttachment[];
  docs: FileAttachment[];
  isPdf: (a: FileAttachment) => boolean;
  isText: (a: FileAttachment) => boolean;
  onPreview: (urls: string[], index: number) => void;
}) {
  const [tab, setTab] = useState<"media" | "docs">("media");
  return (
    <>
      <div className="flex border-b border-outline-variant flex-shrink-0">
        {(["media", "docs"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)} className={cn("flex-1 py-2.5 text-sm font-medium transition-colors relative", tab === t ? "text-on-surface" : "text-on-surface-variant hover:text-on-surface")}>
            {t === "media" ? "Media" : "Docs"}
            {tab === t && <span className="absolute bottom-0 left-1/4 right-1/4 h-0.5 bg-on-surface rounded-full" />}
          </button>
        ))}
      </div>
      <div className="overflow-y-auto flex-1 p-4">
        {tab === "media" && (
          photos.length === 0
            ? <p className="text-sm text-on-surface-variant text-center py-10">No photos yet.</p>
            : <div className="grid grid-cols-4 sm:grid-cols-6 gap-0.5">
                {photos.map((a, i) => (
                  <img key={i} src={a.url} alt={a.name} loading="lazy" decoding="async" onClick={() => onPreview(photos.map(p => p.url), i)} className="aspect-square object-cover rounded-sm cursor-zoom-in w-full" />
                ))}
              </div>
        )}
        {tab === "docs" && (
          docs.length === 0
            ? <p className="text-sm text-on-surface-variant text-center py-10">No files yet.</p>
            : <div className="space-y-2">
                {docs.map((a, i) => (
                  <a key={i} href={a.url} {...(isPdf(a) || isText(a) ? { target: "_blank", rel: "noopener noreferrer" } : { download: a.name })}
                    className="flex items-center gap-3 px-3 py-2.5 rounded-xl border border-outline-variant bg-surface-container-low hover:bg-surface-container transition-colors no-underline group"
                  >
                    <FileText className="w-4 h-4 text-on-surface-variant flex-shrink-0" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-medium text-on-surface truncate">{a.name}</span>
                      <span className="text-xs text-on-surface-variant">{fmtSize(a.size)}{isPdf(a) || isText(a) ? " · Opens in browser" : " · Click to download"}</span>
                    </span>
                    {isPdf(a) || isText(a) ? <ExternalLink className="w-3.5 h-3.5 text-on-surface-variant group-hover:text-on-surface flex-shrink-0" /> : <Download className="w-3.5 h-3.5 text-on-surface-variant group-hover:text-on-surface flex-shrink-0" />}
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
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [otherTyping, setOtherTyping] = useState(false);
  const [queuedSend, setQueuedSend] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const typingClearRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastTypingSentRef = useRef(0);

  const wsRef = useRef<ChatSocket | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const msgRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const messagesRef = useRef<DmMessage[]>([]);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const meRef = useRef<Author | null>(null);
  const otherUsernameRef = useRef<string | null>(null);
  const pendingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const pendingPayloadsRef = useRef<Map<string, Record<string, unknown>>>(new Map());
  const nearBottomRef = useRef(true);
  const didInitialScrollRef = useRef(false);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  // Scroll ONLY the message list, never the window: scrollIntoView also
  // scrolls every scrollable ancestor, and with the iOS keyboard open that
  // pans the whole page, leaving the composer stranded off-screen after send.
  //
  // Layout effect + instant jump on open: the chat must *appear* already at
  // the bottom, not visibly slide there. After that, own sends snap down;
  // incoming messages only pull the list if the reader is already near the
  // bottom — never yank someone out of scrolled-up history.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el || messages.length === 0) return;
    if (!didInitialScrollRef.current) {
      el.scrollTop = el.scrollHeight;
      didInitialScrollRef.current = true;
      return;
    }
    const last = messages[messages.length - 1];
    const ownJustSent = !!(last && meRef.current && last.sender.username === meRef.current.username);
    if (ownJustSent) el.scrollTop = el.scrollHeight;
    else if (nearBottomRef.current) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, otherTyping]);

  // Merge fresh server history with local bubbles still in flight. A pending
  // bubble whose content already shows up in the history was delivered (the
  // socket just died before the echo) — drop it instead of duplicating.
  function mergeWithPending(server: DmMessage[], prev: DmMessage[]): DmMessage[] {
    const inFlight = prev.filter((m) => m.pending || m.failed);
    const survivors = inFlight.filter((p) =>
      !server.some((s) =>
        s.sender.username === p.sender.username &&
        (s.content ?? "") === (p.content ?? "") &&
        (s.attachments?.length ?? 0) === (p.attachments?.length ?? 0)
      )
    );
    return [...server, ...survivors];
  }

  function handleIncoming(data: unknown) {
    const evt = data as { event?: string; username?: string; ids?: string[] };
    // Someone deleted messages — drop those bubbles live on both sides.
    if (evt.event === "messages_deleted") {
      const gone = new Set(evt.ids ?? []);
      if (gone.size) {
        setMessages((prev) => prev.filter((m) => !gone.has(m.id)));
        setSelectedIds((prev) => {
          const next = new Set(Array.from(prev).filter((mid) => !gone.has(mid)));
          return next.size === prev.size ? prev : next;
        });
      }
      return;
    }
    // Ephemeral typing signal — show the indicator briefly, don't store anything.
    if (evt.event === "typing") {
      if (evt.username === otherUsernameRef.current) {
        setOtherTyping(true);
        if (typingClearRef.current) clearTimeout(typingClearRef.current);
        typingClearRef.current = setTimeout(() => setOtherTyping(false), 3000);
      }
      return;
    }
    const msg = data as DmMessage;
    // A real message replaces the "typing…" bubble instantly.
    if (msg.sender.username === otherUsernameRef.current) {
      setOtherTyping(false);
      if (typingClearRef.current) clearTimeout(typingClearRef.current);
    }
    if (msg.client_id) {
      const timer = pendingTimersRef.current.get(msg.client_id);
      if (timer) clearTimeout(timer);
      pendingTimersRef.current.delete(msg.client_id);
      pendingPayloadsRef.current.delete(msg.client_id);
    }
    setMessages((prev) => {
      // Our own echo: swap the optimistic bubble for the confirmed message.
      if (msg.client_id) {
        const idx = prev.findIndex((m) => m.client_id === msg.client_id && (m.pending || m.failed));
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = msg;
          return next;
        }
      }
      return prev.some((m) => m.id === msg.id) ? prev : [...prev, msg];
    });
    if (meRef.current && msg.sender.username !== meRef.current.username) {
      apiFetch(`/api/messages/${id}/read`, { method: "POST" }).catch(() => {});
    }
  }
  const handleIncomingRef = useRef(handleIncoming);
  useEffect(() => { handleIncomingRef.current = handleIncoming; });

  useEffect(() => {
    let cancelled = false;

    // Cached snapshot paints the conversation instantly; the fetch below still
    // runs and silently brings it up to date.
    const cached = getDmCache<DmSnapshot>(id);
    if (cached) {
      setMessages(cached.messages);
      setOtherUser(cached.otherUser);
      setIsMuted(cached.isMuted);
      setCurrentUsername(cached.me.username);
      meRef.current = cached.me;
      otherUsernameRef.current = cached.otherUser.username;
    }

    async function fetchConversation(): Promise<boolean> {
      try {
        const [conv, me] = await Promise.all([
          apiFetch<ConvResponse>(`/api/messages/${id}`),
          apiFetch<Author>("/api/auth/me"),
        ]);
        if (cancelled) return false;
        meRef.current = { username: me.username, display_name: me.display_name, avatar_url: me.avatar_url ?? null };
        otherUsernameRef.current = conv.other_user.username;
        setOtherUser(conv.other_user);
        setCurrentUsername(me.username);
        setIsMuted(conv.is_muted);
        setMessages((prev) => mergeWithPending(conv.messages, prev));
        return true;
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
        else if (err instanceof ApiError && err.status === 403) router.replace("/messages");
        return false;
      }
    }

    // Socket and history load in parallel — the handshake shouldn't wait for
    // the REST fetch. If access is denied, both fail consistently (the socket
    // gets a 4xxx close, the fetch redirects away).
    wsRef.current = openChatSocket(`/api/messages/${id}/ws`, {
      onStatus: (s) => { if (!cancelled) setStatus(s); },
      onMessage: (data) => { if (!cancelled) handleIncomingRef.current(data); },
      // The socket was down for a while — refetch to fill in anything missed.
      onReconnect: () => { fetchConversation(); },
    });
    fetchConversation();
    return () => { cancelled = true; wsRef.current?.close(); wsRef.current = null; };
  }, [id, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // Keep the snapshot cache fresh so coming back to this chat is instant.
  // In-flight bubbles are excluded — only server-confirmed messages belong.
  useEffect(() => {
    if (!otherUser || !meRef.current || messages.length === 0) return;
    saveDmCache(id, {
      messages: messages.filter((m) => !m.pending && !m.failed),
      otherUser,
      isMuted,
      me: meRef.current,
    } satisfies DmSnapshot);
  }, [id, messages, otherUser, isMuted]);

  function scrollToQuote(quote: string) {
    const target = messagesRef.current.find((m) => m.content === quote || (m.content ?? "").startsWith(quote));
    if (!target) return;
    const el = msgRefs.current.get(target.id);
    if (!el) return;
    const container = listRef.current;
    if (container) {
      // Container-only scroll (see the auto-scroll effect above for why).
      const cRect = container.getBoundingClientRect();
      const eRect = el.getBoundingClientRect();
      container.scrollTo({
        top: container.scrollTop + (eRect.top - cRect.top) - container.clientHeight / 2 + eRect.height / 2,
        behavior: "smooth",
      });
    }
    el.style.transition = "none";
    el.style.backgroundColor = "rgba(56,101,166,0.12)";
    el.style.borderRadius = "12px";
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transition = "background-color 1.3s ease, border-radius 1.3s ease";
      el.style.backgroundColor = "";
      el.style.borderRadius = "";
    }));
    setTimeout(() => { el.style.transition = ""; }, 1500);
  }

  async function uploadFile(file: File, endpoint: string): Promise<FileAttachment> {
    // Photos are downscaled on-device first — uploading a full 5 MB camera
    // shot just for the server to shrink it makes sending feel slow.
    const toSend = endpoint === "/api/upload" ? await compressImage(file) : file;
    const fd = new FormData();
    fd.append("file", toSend);
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
      attachment: null, uploading: true, error: null, name: f.name, mime_type: f.type,
    }));
    setPendingAttachments((prev) => [...prev, ...newPending]);
    await Promise.all(files.map(async (file, i) => {
      const uid = newPending[i].uid;
      try {
        const raw = await uploadFile(file, endpoint);
        const attachment: FileAttachment = { url: raw.url, name: raw.name ?? file.name, size: raw.size ?? file.size, mime_type: raw.mime_type ?? file.type };
        setPendingAttachments((prev) => prev.map((a) => a.uid === uid ? { ...a, attachment, uploading: false } : a));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Upload failed";
        setPendingAttachments((prev) => prev.map((a) => a.uid === uid ? { ...a, uploading: false, error: msg } : a));
      }
    }));
  }

  function removePending(uid: string) { setPendingAttachments((prev) => prev.filter((a) => a.uid !== uid)); }

  // If the echo hasn't come back after this long, surface a retry instead of
  // an eternal "Sending…". The outbox usually beats this comfortably.
  function startFailTimer(clientId: string) {
    const timers = pendingTimersRef.current;
    const old = timers.get(clientId);
    if (old) clearTimeout(old);
    timers.set(clientId, setTimeout(() => {
      timers.delete(clientId);
      setMessages((prev) => prev.map((m) =>
        m.client_id === clientId && m.pending ? { ...m, pending: false, failed: true } : m
      ));
    }, 15000));
  }

  function retrySend(clientId: string) {
    const payload = pendingPayloadsRef.current.get(clientId);
    const socket = wsRef.current;
    if (!payload || !socket) return;
    setMessages((prev) => prev.map((m) =>
      m.client_id === clientId ? { ...m, pending: true, failed: false } : m
    ));
    startFailTimer(clientId);
    socket.send(payload);
  }

  function send() {
    const text = input.trim();
    const readyAttachments = pendingAttachments.filter((a) => a.attachment !== null).map((a) => a.attachment!);
    const stillUploading = pendingAttachments.some((a) => a.uploading);
    const me = meRef.current;
    if ((!text && readyAttachments.length === 0) || stillUploading || !wsRef.current || !me) return;

    const clientId = crypto.randomUUID();
    const content = text ? (replyTo ? `> ${(replyTo.content ?? "[post]").slice(0, 80)}\n\n${text}` : text) : null;
    const wsPayload: Record<string, unknown> = { client_id: clientId };
    if (content) wsPayload.content = content;
    if (readyAttachments.length > 0) wsPayload.attachments = readyAttachments;

    // The bubble appears instantly; the server echo (matched by client_id)
    // replaces it. If the socket is down, the outbox delivers on reconnect.
    setMessages((prev) => [...prev, {
      id: clientId,
      client_id: clientId,
      content,
      attachments: readyAttachments,
      shared_post: null,
      sender: me,
      created_at: new Date().toISOString(),
      pending: true,
    }]);
    pendingPayloadsRef.current.set(clientId, wsPayload);
    startFailTimer(clientId);
    wsRef.current.send(wsPayload);

    setInput("");
    setReplyTo(null);
    setPendingAttachments([]);
    inputRef.current?.focus();
  }

  function handleSubmit(e: React.FormEvent) { e.preventDefault(); trySend(); }

  // Tapping send while an attachment is still uploading must never be a
  // silent no-op: arm an auto-send that fires the moment uploads settle.
  function trySend() {
    if (pendingAttachments.some((a) => a.uploading)) {
      setQueuedSend(true);
      return;
    }
    send();
  }
  useEffect(() => {
    if (!queuedSend) return;
    if (pendingAttachments.some((a) => a.uploading)) return;
    setQueuedSend(false);
    if (input.trim() || pendingAttachments.some((a) => a.attachment !== null)) send();
  }, [queuedSend, pendingAttachments]); // eslint-disable-line react-hooks/exhaustive-deps
  // Enter inserts a newline (like every mobile messenger); sending is the
  // send button's job. No onKeyDown handler needed for that — it's the
  // textarea's default behavior.

  // Tell the other side we're typing — throttled so a burst of keystrokes
  // produces at most one signal every 2s (their indicator stays lit for 3s).
  function signalTyping() {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000) return;
    if (status !== "connected" || !wsRef.current) return;
    lastTypingSentRef.current = now;
    // Never queue typing signals — a stale "typing…" after reconnect is noise.
    wsRef.current.send({ event: "typing" }, false);
  }

  function handleToggleMute() {
    const newMuted = !isMuted;
    setIsMuted(newMuted);
    apiFetch(`/api/messages/${id}/mute`, { method: newMuted ? "POST" : "DELETE" }).catch(() => setIsMuted(!newMuted));
  }

  function toggleSelect(msgId: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(msgId)) next.delete(msgId);
      else next.add(msgId);
      return next;
    });
  }

  function exitSelectMode() {
    setSelectMode(false);
    setSelectedIds(new Set());
  }

  async function deleteSelected() {
    if (selectedIds.size === 0 || deleting) return;
    const n = selectedIds.size;
    if (!window.confirm(`Delete ${n} message${n > 1 ? "s" : ""}? They will be removed for both of you.`)) return;
    setDeleting(true);
    try {
      await apiFetch(`/api/messages/${id}/messages/delete`, {
        method: "POST",
        body: JSON.stringify({ message_ids: Array.from(selectedIds) }),
      });
      // The WS broadcast also removes them, but don't wait for the round-trip.
      setMessages((prev) => prev.filter((m) => !selectedIds.has(m.id)));
      exitSelectMode();
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not delete messages.");
    } finally {
      setDeleting(false);
    }
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

  // Sending works even while reconnecting (the socket outbox delivers on
  // reconnect) and even mid-upload (trySend queues until uploads settle).
  const canSend = input.trim().length > 0 || pendingAttachments.some((a) => a.uploading || a.attachment !== null);

  return (
    // dvh (not svh): tracks the live viewport, so when the on-screen keyboard
    // resizes it (interactive-widget=resizes-content) the composer stays visible.
    <main className="flex flex-col bg-background max-w-[700px] w-full mx-auto overflow-hidden" style={{ height: "100dvh" }}>

      {/* Header — glass */}
      <div
        className="flex items-center gap-3 px-4 py-3 flex-shrink-0 border-b border-outline-variant/50"
        style={{ background: "rgba(255,255,255,0.88)", backdropFilter: "blur(20px) saturate(160%)", WebkitBackdropFilter: "blur(20px) saturate(160%)" }}
      >
        {selectMode ? (
          <>
            <button
              onClick={exitSelectMode}
              className="flex items-center text-on-surface-variant hover:text-on-surface transition-colors flex-shrink-0"
              aria-label="Cancel selection"
            >
              <X className="w-5 h-5" />
            </button>
            <p className="flex-1 font-semibold text-sm text-on-surface">
              {selectedIds.size} selected
            </p>
            <button
              onClick={deleteSelected}
              disabled={selectedIds.size === 0 || deleting}
              className="p-2 rounded-full text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-40 flex-shrink-0"
              aria-label="Delete selected messages"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </>
        ) : (
          <>
        <Link href="/messages" className="flex items-center text-on-surface-variant hover:text-on-surface transition-colors no-underline flex-shrink-0">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          {otherUser && (otherUser.username ? (
            <Link href={`/profile/${otherUser.username}`} className="no-underline flex-shrink-0" aria-label={`${otherUser.display_name}'s profile`}>
              <MiniAvatar name={otherUser.display_name} url={otherUser.avatar_url ?? null} size={34} />
            </Link>
          ) : (
            <MiniAvatar name={otherUser.display_name} url={otherUser.avatar_url ?? null} size={34} />
          ))}
          <div className="min-w-0">
            <p className="font-semibold text-sm text-on-surface truncate leading-tight">{otherUser?.display_name ?? "Conversation"}</p>
            {/* This is *connection* state, not the other person's presence —
                so when connected, show their handle instead of a misleading
                "Online". The socket self-heals, hence "Reconnecting…". */}
            <p className="text-[11px] text-on-surface-variant flex items-center gap-1 leading-tight">
              {status !== "connected" && (
                <span className="w-1.5 h-1.5 rounded-full flex-shrink-0 bg-yellow-400" />
              )}
              {status === "connected"
                ? (otherUser?.username ? `@${otherUser.username}` : " ")
                : status === "connecting" ? "Connecting…" : "Reconnecting…"}
            </p>
          </div>
        </div>
        <div className="relative flex-shrink-0">
          <button
            ref={menuBtnRef}
            onClick={() => {
              if (menuOpen) { setMenuOpen(false); return; }
              const rect = menuBtnRef.current?.getBoundingClientRect();
              if (rect) setMenuPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
              setMenuOpen(true);
            }}
            className="p-2 rounded-full hover:bg-surface-container text-on-surface-variant transition-colors"
          >
            <MoreVertical className="w-4 h-4" />
          </button>
          {menuOpen && menuPos && typeof document !== "undefined" && createPortal(
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 299 }} />
              <div style={{ position: "fixed", top: menuPos.top, right: menuPos.right, zIndex: 300, background: "white", border: "1px solid var(--outline-variant, #e0e0e0)", borderRadius: 16, boxShadow: "0 4px 24px rgba(0,0,0,0.12)", minWidth: 190, overflow: "hidden" }}>
                <button onClick={() => { setMenuOpen(false); setMediaOpen(true); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 16px", fontSize: "0.875rem", background: "none", border: "none", cursor: "pointer" }} onMouseEnter={e => (e.currentTarget.style.background = "#f5f5f5")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                  <GalleryHorizontalEnd style={{ width: 14, height: 14, color: "#6b7280", flexShrink: 0 }} />
                  Media &amp; Files
                </button>
                <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 16px", fontSize: "0.875rem", borderTop: "1px solid rgba(0,0,0,0.06)" }}>
                  <Bell style={{ width: 14, height: 14, color: "#6b7280", flexShrink: 0 }} />
                  <span style={{ flex: 1, userSelect: "none" }}>Notifications</span>
                  <div
                    onClick={handleToggleMute}
                    role="switch"
                    aria-checked={!isMuted}
                    style={{ position: "relative", cursor: "pointer", display: "inline-flex", width: 36, height: 20, flexShrink: 0, alignItems: "center", borderRadius: 9999, background: isMuted ? "#fb923c" : "#22c55e", transition: "background 0.3s" }}
                  >
                    <span style={{ display: "inline-block", width: 14, height: 14, borderRadius: "50%", background: "white", boxShadow: "0 1px 2px rgba(0,0,0,0.2)", transition: "transform 0.3s", transform: isMuted ? "translateX(3px)" : "translateX(19px)" }} />
                  </div>
                </div>
                <button onClick={() => { setMenuOpen(false); setSelectMode(true); }} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 16px", fontSize: "0.875rem", background: "none", border: "none", borderTop: "1px solid rgba(0,0,0,0.06)", cursor: "pointer" }} onMouseEnter={e => (e.currentTarget.style.background = "#f5f5f5")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                  <ListChecks style={{ width: 14, height: 14, color: "#6b7280", flexShrink: 0 }} />
                  Delete messages
                </button>
                <button onClick={handleDeleteConversation} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", textAlign: "left", padding: "10px 16px", fontSize: "0.875rem", background: "none", border: "none", borderTop: "1px solid rgba(0,0,0,0.06)", cursor: "pointer", color: "#ef4444" }} onMouseEnter={e => (e.currentTarget.style.background = "#fef2f2")} onMouseLeave={e => (e.currentTarget.style.background = "none")}>
                  <Trash2 style={{ width: 14, height: 14, flexShrink: 0 }} />
                  Delete chat
                </button>
              </div>
            </>,
            document.body
          )}
        </div>
          </>
        )}
      </div>

      {/* Messages */}
      <div
        ref={listRef}
        className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-2"
        onScroll={(e) => {
          const el = e.currentTarget;
          nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
          setHoveredMsgId(null);
        }}
      >
        {messages.length === 0 && status === "connected" && (
          <p className="text-on-surface-variant text-sm text-center m-auto">No messages yet. Say hello!</p>
        )}
        {messages.map((msg) => (
          <SwipeableMessage
            key={msg.id}
            msg={msg}
            isOwn={msg.sender.username === currentUsername}
            isHovered={hoveredMsgId === msg.id}
            selectMode={selectMode}
            selected={selectedIds.has(msg.id)}
            onToggleSelect={() => toggleSelect(msg.id)}
            onLongPress={() => { setSelectMode(true); toggleSelect(msg.id); }}
            onHoverEnter={() => setHoveredMsgId(msg.id)}
            onHoverLeave={() => setHoveredMsgId(null)}
            onSwipe={(m) => { setHoveredMsgId(null); setReplyTo(m); setTimeout(() => inputRef.current?.focus(), 50); }}
            onScrollToQuote={scrollToQuote}
            onPreviewImage={(urls, idx) => setLightbox({ urls, index: idx })}
            onRetry={() => { if (msg.client_id) retrySend(msg.client_id); }}
            msgRef={(el) => { if (el) msgRefs.current.set(msg.id, el); else msgRefs.current.delete(msg.id); }}
          />
        ))}
        {/* Typing indicator — mirrors a received bubble with pulsing dots */}
        {otherTyping && otherUser && (
          <div className="flex items-end gap-2 mt-1">
            <MiniAvatar name={otherUser.display_name} url={otherUser.avatar_url ?? null} size={26} />
            <div className="bg-surface-container rounded-2xl rounded-bl-md px-4 py-3 flex items-center gap-1">
              <span className="typing-dot" />
              <span className="typing-dot" style={{ animationDelay: "0.15s" }} />
              <span className="typing-dot" style={{ animationDelay: "0.3s" }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Reply strip */}
      {replyTo && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-surface-container-low border-t border-outline-variant/60 flex-shrink-0">
          <CornerUpLeft className="w-3.5 h-3.5 flex-shrink-0" style={{ color: IUS_BLUE }} />
          <p className="flex-1 text-xs text-on-surface-variant truncate">
            <span className="font-semibold text-on-surface">{replyTo.sender.display_name}:</span>{" "}
            {(replyTo.content ?? "[post]").slice(0, 80)}
          </p>
          <button onClick={() => setReplyTo(null)} className="text-on-surface-variant hover:text-on-surface transition-colors">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Pending attachments */}
      {pendingAttachments.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-2.5 border-t border-outline-variant/60 bg-surface flex-shrink-0 flex-wrap">
          {pendingAttachments.some((p) => p.error) && (
            <p className="w-full text-xs text-destructive">
              Some attachments failed to upload — remove them (×) and try again.
            </p>
          )}
          {pendingAttachments.map((p) => (
            <div key={p.uid} className="relative flex-shrink-0">
              {p.localUrl ? (
                <img src={p.localUrl} alt={p.name} onClick={() => !p.uploading && setLightbox({ urls: [p.localUrl!], index: 0 })} className="w-14 h-14 rounded-xl object-cover border border-outline-variant cursor-zoom-in" />
              ) : (
                <div className="flex items-center gap-1.5 bg-surface-container rounded-xl px-2.5 py-1.5 text-xs max-w-[140px]">
                  <FileText className="w-3.5 h-3.5 flex-shrink-0 text-on-surface-variant" />
                  <span className="truncate text-on-surface">{p.name}</span>
                </div>
              )}
              {p.uploading && <div className="absolute inset-0 rounded-xl bg-black/35 flex items-center justify-center"><span className="text-[10px] text-white">…</span></div>}
              {p.error && <div className="absolute inset-0 rounded-xl bg-destructive/30 flex items-center justify-center"><span className="text-[10px] text-destructive font-semibold">!</span></div>}
              <button type="button" onClick={() => removePending(p.uid)} className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-on-surface text-background flex items-center justify-center">
                <X className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Input bar — glass */}
      <form
        onSubmit={handleSubmit}
        className="flex items-end gap-2.5 px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] border-t border-outline-variant/50 flex-shrink-0"
        style={{ background: "rgba(255,255,255,0.92)", backdropFilter: "blur(20px) saturate(160%)", WebkitBackdropFilter: "blur(20px) saturate(160%)" }}
      >
        <input ref={photoInputRef} type="file" accept="image/jpeg,image/png,image/gif,image/webp" multiple className="hidden" onChange={(e) => handleMediaSelect(e, "/api/upload")} />
        <input ref={fileInputRef} type="file" accept="application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.openxmlformats-officedocument.presentationml.presentation,.txt,.md,.csv,.py,.js,.ts,.jsx,.tsx,.java,.c,.cpp,.h,.cs,.go,.rs,.rb,.php,.json,.yaml,.yml,.toml,.xml,.sh,.sql,.r,.ipynb" multiple className="hidden" onChange={(e) => handleMediaSelect(e, "/api/upload/file")} />

        {/* Attach button */}
        <div className="relative flex-shrink-0 mb-0.5">
          <button
            type="button"
            onClick={() => setAttachMenuOpen((o) => !o)}
            disabled={pendingAttachments.length >= 5}
            className="w-9 h-9 rounded-full bg-surface border border-outline-variant flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors disabled:opacity-40"
          >
            <Plus className="w-4 h-4" />
          </button>
          {attachMenuOpen && (
            <>
              <div onClick={() => setAttachMenuOpen(false)} className="fixed inset-0 z-[198]" />
              <div className="absolute bottom-[calc(100%+6px)] left-0 bg-surface border border-outline-variant rounded-2xl shadow-xl z-[199] overflow-hidden min-w-[140px]">
                <button type="button" onClick={() => photoInputRef.current?.click()} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-on-surface hover:bg-surface-container-low transition-colors">
                  <ImageIcon className="w-4 h-4 text-blue-500" />
                  Photo
                </button>
                <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm text-on-surface hover:bg-surface-container-low transition-colors border-t border-outline-variant/60">
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
          onChange={(e) => { setInput(e.target.value); signalTyping(); }}
          placeholder="Type a message…"
          maxLength={2000}
          rows={1}
          className="flex-1 px-4 py-2.5 text-sm rounded-full border border-outline-variant bg-surface-container-low placeholder:text-on-surface-variant focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-50 resize-none max-h-32 overflow-y-auto text-on-surface"
          style={{ lineHeight: "1.4" }}
        />
        <button
          type="submit"
          disabled={!canSend}
          className={cn(
            "w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 mb-0.5 transition-all duration-200 disabled:opacity-35",
            queuedSend && "animate-pulse"
          )}
          style={{ backgroundColor: canSend ? IUS_BLUE : "#9ca3af" }}
        >
          <Send className="w-4 h-4 text-white" />
        </button>
      </form>

      {/* Media sheet — centered modal via portal */}
      {mediaOpen && typeof document !== "undefined" && createPortal(
        (() => {
          const allAttachments = messages.flatMap((m) => m.attachments ?? []);
          const photos = allAttachments.filter((a) => a.mime_type.startsWith("image/"));
          const docs = allAttachments.filter((a) => !a.mime_type.startsWith("image/"));
          const isPdf = (a: FileAttachment) => a.mime_type === "application/pdf";
          const isText = (a: FileAttachment) => a.mime_type === "text/plain";
          return (
            <>
              <div onClick={() => setMediaOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)", zIndex: 200 }} />
              <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(520px, 90vw)", maxHeight: "70vh", zIndex: 201, background: "white", borderRadius: 20, display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 12px", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
                  <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Media &amp; Files</span>
                  <button onClick={() => setMediaOpen(false)} style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: "#f3f4f6", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <X style={{ width: 14, height: 14 }} />
                  </button>
                </div>
                <MediaSheet photos={photos} docs={docs} isPdf={isPdf} isText={isText} onPreview={(urls, idx) => setLightbox({ urls, index: idx })} />
              </div>
            </>
          );
        })(),
        document.body
      )}

      {lightbox && createPortal(
        <LightboxPortal urls={lightbox.urls} index={lightbox.index} onChange={(idx) => setLightbox((l) => l ? { ...l, index: idx } : null)} onClose={() => setLightbox(null)} />,
        document.body
      )}
    </main>
  );
}
