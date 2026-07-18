"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import UserSearchInput from "@/components/UserSearchInput";
import { SearchOverlay } from "@/components/SearchOverlay";
import { SkeletonRowList } from "@/components/Skeleton";
import MiniAvatar from "@/components/MiniAvatar";
import { timeAgo } from "@/lib/timeAgo";
import { Plus, X, ImageIcon, FileText, Search } from "lucide-react";
import { useToast } from "@/components/ToastProvider";
import { cn } from "@/lib/utils";

interface OtherUser {
  username: string;
  display_name: string;
  avatar_url?: string | null;
}

interface LastMessage {
  content: string | null;
  is_post_share: boolean;
  has_photo: boolean;
  has_file: boolean;
  sender_username: string;
  created_at: string;
}

interface ConversationItem {
  conversation_id: string;
  other_user: OtherUser;
  last_message: LastMessage | null;
  unread_count: number;
}

interface ClubChatItem {
  slug: string;
  name: string;
  banner_url: string | null;
  chat_muted: boolean;
  last_message: {
    content: string | null;
    has_attachments: boolean;
    sender_is_you: boolean;
    sender_display_name: string;
    created_at: string;
  } | null;
}

function LastMsgPreview({ lm, unread }: { lm: LastMessage; unread: boolean }) {
  const iconCls = "w-3 h-3 flex-shrink-0";
  const text = lm.content ?? "";

  const attachment = (() => {
    if (lm.is_post_share) return <><FileText className={iconCls} /><span>Shared a post</span></>;
    if (lm.has_photo && lm.has_file) return <><ImageIcon className={iconCls} /><span>Photo · File</span></>;
    if (lm.has_photo) return <><ImageIcon className={iconCls} /><span>Photo</span></>;
    if (lm.has_file) return <><FileText className={iconCls} /><span>File</span></>;
    return null;
  })();

  return (
    <span className={cn(
      "text-xs truncate flex items-center gap-1",
      unread ? "text-on-surface font-medium" : "text-on-surface-variant"
    )}>
      {text && <span className="truncate">{text}</span>}
      {text && attachment && <span className="flex-shrink-0">·</span>}
      {attachment}
    </span>
  );
}

// Survives navigation away and back (module scope, like the feed/qa caches),
// so returning from a club chat lands on the Club chats group, not DMs.
let lastTab: "dms" | "clubs" = "dms";

export default function MessagesPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [clubChats, setClubChats] = useState<ClubChatItem[]>([]);
  const [tab, setTabState] = useState<"dms" | "clubs">(lastTab);
  const setTab = (t: "dms" | "clubs") => { lastTab = t; setTabState(t); };
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newError, setNewError] = useState<string | null>(null);
  const [newLoading, setNewLoading] = useState(false);
  const { onNotification } = useToast();
  const loadingRef = useRef(false);

  function reload() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    Promise.allSettled([
      apiFetch<ConversationItem[]>("/api/messages").then(setConversations),
      apiFetch<ClubChatItem[]>("/api/messages/club-chats").then(setClubChats),
    ]).finally(() => { loadingRef.current = false; });
  }

  useEffect(() => {
    Promise.all([
      apiFetch<ConversationItem[]>("/api/messages"),
      apiFetch<ClubChatItem[]>("/api/messages/club-chats"),
    ])
      .then(([convs, clubs]) => { setConversations(convs); setClubChats(clubs); })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
      })
      .finally(() => setLoading(false));

    const unsub = onNotification((p) => { if (p.type === "dm") reload(); });
    const interval = setInterval(reload, 10000);
    return () => { unsub(); clearInterval(interval); };
  }, [router, onNotification]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <>
      <main className="max-w-xl mx-auto px-4 pt-4 pb-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h1 className="text-xl font-bold text-on-surface">Messages</h1>
          <div className="flex-1" />
          <button
            onClick={() => setSearchOpen(true)}
            aria-label="Search chats"
            className="w-9 h-9 mr-1 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <Search className="w-5 h-5" />
          </button>
          {tab === "dms" && (
            <button
              onClick={() => { setNewOpen(true); setNewError(null); setNewUsername(""); }}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              New
            </button>
          )}
        </div>
        <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} mode="chats" />

        {/* Group switcher — DMs / Club chats (same segmented style as profile Posts/Clubs) */}
        <div className="flex gap-1 p-1 bg-surface-container-low border border-outline-variant rounded-full mb-4">
          {([
            ["dms", "DMs", conversations.length],
            ["clubs", "Club chats", clubChats.length],
          ] as const).map(([key, label, count]) => {
            const isActive = tab === key;
            return (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={cn(
                  "relative flex-1 flex items-center justify-center gap-1.5 py-2 text-sm font-medium rounded-full transition-all",
                  isActive
                    ? "bg-surface text-on-surface shadow-sm"
                    : "text-on-surface-variant hover:text-on-surface"
                )}
              >
                {label}
                <span className={cn(
                  "text-xs tabular-nums px-1.5 py-0.5 rounded-full",
                  isActive ? "bg-surface-container text-on-surface-variant" : "text-on-surface-variant/70"
                )}>
                  {count}
                </span>
                {key === "dms" && !isActive && conversations.some((c) => c.unread_count > 0) && (
                  <span className="absolute top-1.5 right-2.5 w-2 h-2 rounded-full bg-red-500" />
                )}
              </button>
            );
          })}
        </div>

        {/* List */}
        {loading && <SkeletonRowList />}
        {!loading && tab === "dms" && conversations.length === 0 && (
          <div className="flex flex-col items-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center">
              <Search className="w-5 h-5 text-on-surface-variant" />
            </div>
            <p className="text-on-surface-variant text-sm text-center">
              No conversations yet.<br />Tap <strong className="text-on-surface">New</strong> to start one.
            </p>
          </div>
        )}
        {!loading && tab === "clubs" && clubChats.length === 0 && (
          <div className="flex flex-col items-center py-16 gap-3">
            <div className="w-12 h-12 rounded-full bg-surface-container flex items-center justify-center">
              <Search className="w-5 h-5 text-on-surface-variant" />
            </div>
            <p className="text-on-surface-variant text-sm text-center">
              No club chats yet.<br />
              <Link href="/clubs" className="text-primary font-semibold">Join a club</Link> to start chatting.
            </p>
          </div>
        )}

        {!loading && tab === "clubs" && (
          <div className="space-y-2 stagger-children">
            {clubChats.map((c) => (
              <Link
                key={c.slug}
                href={`/clubs/${c.slug}/chat`}
                className="flex items-center gap-3 px-4 py-3 rounded-2xl shadow-sm no-underline bg-surface hover:bg-surface-container-low transition-colors"
              >
                <div className="w-[42px] h-[42px] rounded-2xl overflow-hidden flex-shrink-0 bg-gradient-to-br from-secondary/25 to-secondary/5 flex items-center justify-center">
                  {c.banner_url ? (
                    <img src={c.banner_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-sm font-bold text-secondary uppercase">{c.name.charAt(0)}</span>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className="text-sm font-semibold text-on-surface truncate">{c.name}</span>
                    {c.last_message && (
                      <span className="text-[11px] text-on-surface-variant flex-shrink-0">
                        {timeAgo(c.last_message.created_at)}
                      </span>
                    )}
                  </div>
                  {c.last_message ? (
                    <p className="text-xs text-on-surface-variant truncate">
                      {c.last_message.sender_is_you ? "You" : c.last_message.sender_display_name}:{" "}
                      {c.last_message.content || (c.last_message.has_attachments ? "Attachment" : "")}
                    </p>
                  ) : (
                    <p className="text-xs text-on-surface-variant">No messages yet</p>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className={cn("space-y-2 stagger-children", tab !== "dms" && "hidden")}>
          {conversations.map((c) => {
            const unread = c.unread_count > 0;
            return (
              <Link
                key={c.conversation_id}
                href={`/messages/${c.conversation_id}`}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-2xl shadow-sm no-underline transition-colors",
                  unread
                    ? "bg-primary/5 hover:bg-primary/8"
                    : "bg-surface hover:bg-surface-container-low"
                )}
              >
                <div className="relative flex-shrink-0">
                  <MiniAvatar name={c.other_user.display_name} url={c.other_user.avatar_url ?? null} size={42} />
                  {unread && (
                    <span className="absolute -top-0.5 -right-0.5 w-3 h-3 rounded-full bg-primary border-2 border-background" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2 mb-0.5">
                    <span className={cn(
                      "text-sm truncate",
                      unread ? "font-bold text-on-surface" : "font-semibold text-on-surface"
                    )}>
                      {c.other_user.display_name}
                    </span>
                    {c.last_message && (
                      <span className="text-[11px] text-on-surface-variant flex-shrink-0">
                        {timeAgo(c.last_message.created_at)}
                      </span>
                    )}
                  </div>
                  {c.last_message ? (
                    <div className="flex items-center gap-1 text-xs min-w-0">
                      {c.last_message.sender_username !== c.other_user.username && (
                        <span className={cn("flex-shrink-0", unread ? "text-on-surface font-medium" : "text-on-surface-variant")}>
                          You:
                        </span>
                      )}
                      <LastMsgPreview lm={c.last_message} unread={unread} />
                    </div>
                  ) : (
                    <p className="text-xs text-on-surface-variant">No messages yet</p>
                  )}
                </div>
                {unread && c.unread_count > 1 && (
                  <span className="flex-shrink-0 min-w-[20px] h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center px-1.5">
                    {c.unread_count > 99 ? "99+" : c.unread_count}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </main>

      {/* New conversation sheet */}
      {newOpen && (
        <>
          <div
            onClick={() => { setNewOpen(false); setNewUsername(""); }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(480px,94vw)] bg-surface rounded-2xl z-[101] shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant">
              <span className="font-semibold text-sm text-on-surface">New conversation</span>
              <button
                onClick={() => { setNewOpen(false); setNewUsername(""); }}
                className="rounded-full p-1 hover:bg-surface-container text-on-surface-variant transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="px-4 py-4 space-y-3">
              <UserSearchInput
                value={newUsername}
                onChange={setNewUsername}
                onSelect={async (u) => {
                  setNewUsername(u);
                  setNewLoading(true);
                  setNewError(null);
                  try {
                    const data = await apiFetch<{ conversation_id: string }>("/api/messages/open", {
                      method: "POST",
                      body: JSON.stringify({ username: u }),
                    });
                    router.push(`/messages/${data.conversation_id}`);
                  } catch (err: unknown) {
                    setNewError(err instanceof Error ? err.message : "User not found.");
                    setNewLoading(false);
                  }
                }}
                placeholder="Search by name or username…"
              />
              {newError && <p className="text-xs text-destructive">{newError}</p>}
              {newLoading && <p className="text-xs text-on-surface-variant">Opening…</p>}
            </div>
          </div>
        </>
      )}
    </>
  );
}
