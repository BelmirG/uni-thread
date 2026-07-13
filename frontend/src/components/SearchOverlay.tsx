"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Search, X, MessageCircle, ChevronUp, Lock } from "lucide-react";
import { apiFetch } from "@/lib/api";
import MiniAvatar from "@/components/MiniAvatar";
import { timeAgo } from "@/lib/timeAgo";
import { cn } from "@/lib/utils";

interface SearchUser {
  username: string;
  display_name: string;
  avatar_url: string | null;
  faculty: string | null;
  program: string | null;
  is_following: boolean;
}

interface SearchPost {
  id: string;
  content: string;
  author: { username: string; display_name: string; avatar_url: string | null } | null;
  created_at: string;
  upvotes: number;
  reply_count: number;
}

interface Conversation {
  conversation_id: string;
  other_user: { username: string; display_name: string; avatar_url?: string | null };
}

interface SearchClub {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  banner_url: string | null;
  is_private: boolean;
  member_count: number;
  is_member: boolean;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** "global" searches people + posts; "chats" filters DM conversations;
      "clubs" filters the club directory. */
  mode: "global" | "chats" | "clubs";
  /** Which post pool a global search hits. Defaults to the public feed. */
  postType?: "feed" | "anonymous_qa";
}

export function SearchOverlay({ open, onClose, mode, postType = "feed" }: Props) {
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<SearchUser[]>([]);
  const [posts, setPosts] = useState<SearchPost[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [clubs, setClubs] = useState<SearchClub[]>([]);
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [followBusy, setFollowBusy] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset + focus on open; chats mode loads the conversation list once and
  // filters it locally as the user types.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setUsers([]);
    setPosts([]);
    setSearched(false);
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    if (mode === "chats") {
      apiFetch<Conversation[]>("/api/messages").then(setConversations).catch(() => {});
    }
    if (mode === "clubs") {
      apiFetch<{ clubs: SearchClub[] }>("/api/clubs").then((d) => setClubs(d.clubs)).catch(() => {});
    }
    return () => clearTimeout(t);
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Debounced remote search (global mode only)
  useEffect(() => {
    if (!open || mode !== "global") return;
    if (timerRef.current) clearTimeout(timerRef.current);
    const q = query.trim();
    if (!q) { setUsers([]); setPosts([]); setSearched(false); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const [u, p] = await Promise.all([
          apiFetch<SearchUser[]>(`/api/users/search?q=${encodeURIComponent(q)}`),
          apiFetch<{ posts: SearchPost[] }>(
            `/api/posts/search?q=${encodeURIComponent(q)}&post_type=${postType}`
          ),
        ]);
        setUsers(u);
        setPosts(p.posts);
        const map: Record<string, boolean> = {};
        u.forEach((x) => { map[x.username] = x.is_following; });
        setFollowing(map);
        setSearched(true);
      } catch { /* ignore */ }
    }, 280);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query, open, mode, postType]);

  async function handleFollow(username: string) {
    if (followBusy) return;
    setFollowBusy(username);
    const now = !following[username];
    try {
      await apiFetch(`/api/users/${username}/follow`, { method: now ? "POST" : "DELETE" });
      setFollowing((prev) => ({ ...prev, [username]: now }));
    } catch { /* ignore */ }
    finally { setFollowBusy(null); }
  }

  if (!open || typeof document === "undefined") return null;

  const q = query.trim().toLowerCase();
  const filteredChats = q
    ? conversations.filter(
        (c) =>
          c.other_user.display_name.toLowerCase().includes(q) ||
          c.other_user.username.toLowerCase().includes(q)
      )
    : conversations;
  const filteredClubs = q
    ? clubs.filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (c.description ?? "").toLowerCase().includes(q)
      )
    : clubs;

  const postHref = postType === "anonymous_qa" ? "/qa" : "/feed";
  const noResults =
    mode === "global"
      ? searched && users.length === 0 && posts.length === 0
      : mode === "chats"
        ? q.length > 0 && filteredChats.length === 0
        : q.length > 0 && filteredClubs.length === 0;

  return createPortal(
    <div className="fixed inset-0 z-[400] bg-background flex flex-col">
      {/* Search bar */}
      <div className="flex items-center gap-2 px-4 pt-4 pb-3 max-w-xl mx-auto w-full">
        <div className="flex-1 flex items-center gap-2.5 h-11 px-4 rounded-full bg-surface-container">
          <Search className="w-4 h-4 text-on-surface-variant flex-shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              mode === "chats" ? "Search chats…" : mode === "clubs" ? "Search clubs…" : "Search posts and people…"
            }
            className="flex-1 bg-transparent text-sm text-on-surface placeholder:text-on-surface-variant focus:outline-none"
          />
          {query && (
            <button onClick={() => setQuery("")} className="text-on-surface-variant">
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button onClick={onClose} className="text-sm font-medium text-on-surface-variant px-1">
          Cancel
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto px-4 pb-8 max-w-xl mx-auto w-full">
        {noResults && (
          <p className="text-sm text-on-surface-variant text-center py-12">
            No results for &ldquo;{query.trim()}&rdquo;
          </p>
        )}

        {mode === "chats" && filteredChats.length > 0 && (
          <div className="space-y-1 stagger-children">
            {filteredChats.map((c) => (
              <Link
                key={c.conversation_id}
                href={`/messages/${c.conversation_id}`}
                onClick={onClose}
                className="flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-surface-container-low transition-colors no-underline"
              >
                <MiniAvatar name={c.other_user.display_name} url={c.other_user.avatar_url ?? null} size={40} />
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-on-surface truncate">{c.other_user.display_name}</div>
                  <div className="text-xs text-on-surface-variant truncate">@{c.other_user.username}</div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {mode === "clubs" && filteredClubs.length > 0 && (
          <div className="space-y-2 stagger-children">
            {filteredClubs.map((c) => (
              <Link
                key={c.id}
                href={`/clubs/${c.slug}`}
                onClick={onClose}
                className="flex items-center gap-3 bg-surface rounded-2xl shadow-sm px-4 py-3 no-underline hover:bg-surface-container-lowest transition-colors"
              >
                <div className="w-10 h-10 rounded-xl overflow-hidden bg-primary/10 text-primary flex items-center justify-center font-bold flex-shrink-0 uppercase">
                  {c.banner_url ? (
                    <img src={c.banner_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
                  ) : (
                    c.name.charAt(0)
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-on-surface truncate">
                    {c.name}
                    {c.is_private && <Lock className="w-3 h-3 text-on-surface-variant flex-shrink-0" />}
                  </div>
                  <div className="text-xs text-on-surface-variant truncate">
                    {c.member_count} {c.member_count === 1 ? "member" : "members"}
                    {c.is_member ? " · Joined" : ""}
                    {c.description ? ` · ${c.description}` : ""}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {mode === "global" && users.length > 0 && (
          <div className="mb-5">
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">People</p>
            <div className="space-y-1">
              {users.map((u) => (
                <div key={u.username} className="flex items-center gap-3 px-3 py-2.5 rounded-2xl hover:bg-surface-container-low transition-colors">
                  <MiniAvatar name={u.display_name} url={u.avatar_url} size={40} />
                  <Link href={`/profile/${u.username}`} onClick={onClose} className="flex-1 min-w-0 no-underline text-on-surface">
                    <div className="text-sm font-semibold truncate">{u.display_name}</div>
                    <div className="text-xs text-on-surface-variant truncate">
                      @{u.username}{u.faculty ? ` · ${u.faculty}` : ""}
                    </div>
                  </Link>
                  <button
                    onClick={() => handleFollow(u.username)}
                    disabled={followBusy === u.username}
                    className={cn(
                      "text-xs font-semibold px-3.5 py-1.5 rounded-full transition-colors flex-shrink-0",
                      following[u.username]
                        ? "bg-surface-container text-on-surface-variant"
                        : "bg-primary text-primary-foreground hover:bg-primary/90"
                    )}
                  >
                    {following[u.username] ? "Following" : "Follow"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {mode === "global" && posts.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-on-surface-variant uppercase tracking-wider mb-2">Posts</p>
            <div className="space-y-2 stagger-children">
              {posts.map((p) => (
                <Link
                  key={p.id}
                  href={`${postHref}/${p.id}`}
                  onClick={onClose}
                  className="block bg-surface rounded-2xl shadow-sm px-4 py-3 no-underline hover:bg-surface-container-lowest transition-colors"
                >
                  <div className="text-xs text-on-surface-variant mb-1">
                    {postType === "anonymous_qa" ? "Anonymous" : p.author?.display_name ?? "Unknown"}
                    {" · "}{timeAgo(p.created_at)}
                  </div>
                  <p className="text-sm text-on-surface line-clamp-3 whitespace-pre-wrap">{p.content}</p>
                  <div className="flex items-center gap-3 mt-2 text-xs text-on-surface-variant">
                    <span className="flex items-center gap-1"><ChevronUp className="w-3.5 h-3.5" />{p.upvotes}</span>
                    <span className="flex items-center gap-1"><MessageCircle className="w-3.5 h-3.5" />{p.reply_count}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
