"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import UserSearchInput from "@/components/UserSearchInput";
import MiniAvatar from "@/components/MiniAvatar";
import { timeAgo } from "@/lib/timeAgo";
import { Plus, X, ImageIcon, FileText } from "lucide-react";
import { useToast } from "@/components/ToastProvider";

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

function LastMsgPreview({ lm, unread }: { lm: LastMessage; unread: boolean }) {
  const cls = `text-xs truncate flex items-center gap-1 ${unread ? "text-foreground font-medium" : "text-muted-foreground"}`;
  const iconCls = "w-3 h-3 flex-shrink-0";
  const text = lm.content ?? "";

  const attachment = (() => {
    if (lm.is_post_share) return <><FileText className={iconCls} /><span>Shared a post</span></>;
    if (lm.has_photo && lm.has_file) return <><ImageIcon className={iconCls} /><span>Photo</span><span>·</span><FileText className={iconCls} /><span>File</span></>;
    if (lm.has_photo) return <><ImageIcon className={iconCls} /><span>Photo</span></>;
    if (lm.has_file) return <><FileText className={iconCls} /><span>File</span></>;
    return null;
  })();

  return (
    <span className={cls}>
      {text && <span className="truncate">{text}</span>}
      {text && attachment && <span className="flex-shrink-0">·</span>}
      {attachment}
    </span>
  );
}

export default function MessagesPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newError, setNewError] = useState<string | null>(null);
  const [newLoading, setNewLoading] = useState(false);
  const { onNotification } = useToast();
  const loadingRef = useRef(false);

  function reload() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    apiFetch<ConversationItem[]>("/api/messages")
      .then(setConversations)
      .catch(() => {})
      .finally(() => { loadingRef.current = false; });
  }

  useEffect(() => {
    apiFetch<ConversationItem[]>("/api/messages")
      .then(setConversations)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
      })
      .finally(() => setLoading(false));

    // Refresh list when a DM arrives via SSE
    const unsub = onNotification((p) => {
      if (p.type === "dm") reload();
    });
    // Polling fallback every 10 s
    const interval = setInterval(reload, 10000);
    return () => { unsub(); clearInterval(interval); };
  }, [router, onNotification]); // eslint-disable-line react-hooks/exhaustive-deps

  function openNew() {
    setNewOpen(true);
    setNewError(null);
    setNewUsername("");
  }


  return (
    <>
    <main className="max-w-xl mx-auto px-4 pt-4 pb-36">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-foreground">Messages</h1>
        <button
          onClick={openNew}
          className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New
        </button>
      </div>

      {/* List */}
      {loading && <p className="text-muted-foreground text-sm text-center py-8">Loading…</p>}
      {!loading && conversations.length === 0 && (
        <p className="text-muted-foreground text-sm text-center py-12">
          No conversations yet. Start one!
        </p>
      )}

      <div className="space-y-2">
        {conversations.map((c) => {
          const unread = c.unread_count > 0;
          return (
            <Link
              key={c.conversation_id}
              href={`/messages/${c.conversation_id}`}
              className="flex items-center gap-3 px-4 py-3 rounded-xl border no-underline transition-colors"
              style={{
                background: unread ? "hsl(var(--primary) / 0.04)" : "#fff",
                borderColor: unread ? "hsl(var(--primary) / 0.2)" : "hsl(var(--border))",
              }}
            >
              <div className="relative flex-shrink-0">
                <MiniAvatar name={c.other_user.display_name} url={c.other_user.avatar_url ?? null} size={40} />
                {unread && (
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-primary border-2 border-white" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className={`text-sm truncate ${unread ? "font-bold text-foreground" : "font-semibold text-foreground"}`}>
                    {c.other_user.display_name}
                  </span>
                  {c.last_message && (
                    <span className="text-[11px] text-muted-foreground flex-shrink-0">
                      {timeAgo(c.last_message.created_at)}
                    </span>
                  )}
                </div>
                {c.last_message ? (
                  <div className="flex items-center gap-1 text-xs min-w-0">
                    {c.last_message.sender_username !== c.other_user.username && (
                      <span className={`flex-shrink-0 ${unread ? "text-foreground font-medium" : "text-muted-foreground"}`}>You:</span>
                    )}
                    <LastMsgPreview lm={c.last_message} unread={unread} />
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No messages yet</p>
                )}
              </div>
            </Link>
          );
        })}
      </div>
    </main>

    {/* New conversation sheet */}
    {newOpen && (
      <>
        <div onClick={() => { setNewOpen(false); setNewUsername(""); }} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]" />
        <div className="fixed top-4 left-1/2 -translate-x-1/2 w-[min(600px,94vw)] bg-white rounded-2xl z-[101] shadow-2xl">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <span className="font-semibold text-sm">New conversation</span>
            <button
              onClick={() => { setNewOpen(false); setNewUsername(""); }}
              className="rounded-full p-1 hover:bg-muted text-muted-foreground transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="px-4 py-3 space-y-3">
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
            {newLoading && <p className="text-xs text-muted-foreground">Opening…</p>}
          </div>
        </div>
      </>
    )}
    </>
  );
}
