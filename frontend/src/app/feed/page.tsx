"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import UserSearchInput from "@/components/UserSearchInput";
import { ImageUploader } from "@/components/ImageUploader";
import { ImageGrid } from "@/components/ImageGrid";
import MiniAvatar from "@/components/MiniAvatar";
import PollComposer, { PollDraft } from "@/components/PollComposer";
import PollDisplay from "@/components/PollDisplay";
import { FACULTIES, FACULTY_NAMES, Faculty } from "@/lib/faculties";
import { timeAgo } from "@/lib/timeAgo";

type FeedTab = "discover" | "friends";

interface Author {
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface Poll {
  options: { id: string; text: string; votes: number }[];
  total_votes: number;
  user_vote_option_id: string | null;
  expires_at: string | null;
  is_expired: boolean;
}

interface Post {
  id: string;
  content: string;
  faculty_tag: string | null;
  image_urls: string[];
  author: Author | null;
  upvotes: number;
  downvotes: number;
  current_user_vote: "up" | "down" | null;
  reply_count: number;
  share_count: number;
  poll: Poll | null;
  created_at: string;
}

interface PostListResponse {
  posts: Post[];
  total: number;
}

interface VoteResponse {
  upvotes: number;
  downvotes: number;
  current_user_vote: "up" | "down" | null;
}

interface SearchUser {
  username: string;
  display_name: string;
  avatar_url: string | null;
  faculty: string | null;
  program: string | null;
  is_following: boolean;
}

function FacultyBadge({ tag }: { tag: string }) {
  return (
    <span style={{
      fontSize: "0.72rem", fontWeight: "bold", letterSpacing: "0.03em",
      padding: "0.15rem 0.5rem", borderRadius: 12,
      background: "#f0f0f0", color: "#444", flexShrink: 0,
    }}>
      {tag}
    </span>
  );
}

// ── People search used in Friends tab ────────────────────────────────────────

function PeopleSearch({ onFollowChange }: { onFollowChange?: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchUser[]>([]);
  const [following, setFollowing] = useState<Record<string, boolean>>({});
  const [loadingFollow, setLoadingFollow] = useState<string | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      try {
        const data = await apiFetch<SearchUser[]>(`/api/users/search?q=${encodeURIComponent(query)}`);
        setResults(data);
        // seed following state from the response
        const map: Record<string, boolean> = {};
        data.forEach((u) => { map[u.username] = u.is_following; });
        setFollowing(map);
      } catch { /* ignore */ }
    }, 280);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [query]);

  async function handleFollow(username: string) {
    if (loadingFollow) return;
    setLoadingFollow(username);
    const isNowFollowing = !following[username];
    try {
      await apiFetch(`/api/users/${username}/follow`, {
        method: isNowFollowing ? "POST" : "DELETE",
      });
      setFollowing((prev) => ({ ...prev, [username]: isNowFollowing }));
      if (isNowFollowing) onFollowChange?.();
    } catch { /* ignore */ }
    finally { setLoadingFollow(null); }
  }

  return (
    <div style={{ marginBottom: "1.5rem" }}>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => { setQuery(""); setResults([]); }, 150)}
        placeholder="Search by name or username…"
        style={{
          width: "100%", boxSizing: "border-box",
          padding: "0.55rem 0.75rem", fontSize: "0.95rem",
          border: "1px solid #ccc", borderRadius: 6, fontFamily: "inherit",
        }}
      />
      {results.length > 0 && (
        <div onMouseDown={(e) => e.preventDefault()} style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {results.map((u) => (
            <div
              key={u.username}
              style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.65rem 0.85rem", border: "1px solid #e0e0e0", borderRadius: 8, background: "#fff" }}
            >
              {/* Avatar */}
              {u.avatar_url ? (
                <img src={u.avatar_url} alt="" style={{ width: 38, height: 38, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
              ) : (
                <div style={{ width: 38, height: 38, borderRadius: "50%", background: "#111", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", fontWeight: "bold", flexShrink: 0 }}>
                  {u.display_name[0].toUpperCase()}
                </div>
              )}
              {/* Info — navigates to profile on click */}
              <Link href={`/profile/${u.username}`} style={{ flex: 1, textDecoration: "none", color: "inherit", minWidth: 0 }}>
                <div style={{ fontWeight: 500, fontSize: "0.95rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.display_name}</div>
                <div style={{ fontSize: "0.8rem", color: "#888" }}>
                  @{u.username}
                  {u.faculty && <span style={{ marginLeft: "0.4rem" }}>· {u.faculty}{u.program ? ` · ${u.program}` : ""}</span>}
                </div>
              </Link>
              {/* Follow button */}
              <button
                onClick={() => handleFollow(u.username)}
                disabled={loadingFollow === u.username}
                style={{
                  padding: "0.3rem 0.85rem", fontSize: "0.85rem", borderRadius: 6, cursor: "pointer", flexShrink: 0,
                  border: following[u.username] ? "1px solid #ccc" : "none",
                  background: following[u.username] ? "#fff" : "#111",
                  color: following[u.username] ? "#111" : "#fff",
                }}
              >
                {following[u.username] ? "Following" : "Follow"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FeedPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [feedTab, setFeedTab] = useState<FeedTab>("discover");
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);
  const [sort, setSort] = useState<"hot" | "new">("hot");
  const [facultyFilter, setFacultyFilter] = useState<Faculty | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [postFacultyTag, setPostFacultyTag] = useState<Faculty | "">("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imagesUploading, setImagesUploading] = useState(false);
  const [uploaderKey, setUploaderKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [pollDraft, setPollDraft] = useState<PollDraft | null>(null);

  useEffect(() => {
    setLoading(true);
    const params = new URLSearchParams({ feed: feedTab });
    if (feedTab === "discover") params.set("sort", sort);
    if (facultyFilter) params.set("faculty", facultyFilter);

    Promise.all([
      apiFetch<PostListResponse>(`/api/posts?${params}`),
      apiFetch<{ username: string }>("/api/auth/me"),
    ])
      .then(([postsData, me]) => {
        setPosts(postsData.posts);
        setTotal(postsData.total);
        setCurrentUsername(me.username);
      })
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [feedTab, sort, facultyFilter, feedRefreshKey, router]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() && !imageUrls.length && !pollDraft) return;
    if (imagesUploading) return;
    if (pollDraft) {
      const validOptions = pollDraft.options.map((o) => o.trim()).filter(Boolean);
      if (validOptions.length < 2) {
        setPostError("A poll needs at least 2 options.");
        return;
      }
    }
    setSubmitting(true);
    setPostError(null);
    try {
      const newPost = await apiFetch<Post>("/api/posts", {
        method: "POST",
        body: JSON.stringify({
          content: content.trim(),
          faculty_tag: postFacultyTag || null,
          image_urls: imageUrls,
          poll_options: pollDraft ? pollDraft.options.map((o) => o.trim()).filter(Boolean) : [],
          poll_expires_at: pollDraft?.expiresAt ? new Date(pollDraft.expiresAt).toISOString() : null,
        }),
      });
      if (feedTab === "discover") setPosts((prev) => [newPost, ...prev]);
      setTotal((t) => t + 1);
      setContent("");
      setPostFacultyTag("");
      setImageUrls([]);
      setUploaderKey((k) => k + 1);
      setPollDraft(null);
      setComposerOpen(false);
    } catch (err: unknown) {
      setPostError(err instanceof Error ? err.message : "Failed to post.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVote(postId: string, voteType: "up" | "down") {
    try {
      const data = await apiFetch<VoteResponse>(`/api/posts/${postId}/vote`, {
        method: "POST",
        body: JSON.stringify({ vote_type: voteType }),
      });
      setPosts((prev) =>
        prev.map((p) => p.id === postId
          ? { ...p, upvotes: data.upvotes, downvotes: data.downvotes, current_user_vote: data.current_user_vote }
          : p
        )
      );
    } catch { /* non-critical */ }
  }

  async function handleDelete(postId: string) {
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    try {
      await apiFetch(`/api/posts/${postId}`, { method: "DELETE" });
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      setTotal((t) => t - 1);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not delete post.");
    }
  }

  const tabBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: "0.55rem 0", fontSize: "0.95rem", fontWeight: active ? "bold" : "normal",
    cursor: "pointer", border: "none", borderBottom: active ? "2px solid #111" : "2px solid transparent",
    background: "none", color: active ? "#111" : "#888",
  });

  const pillStyle = (active: boolean): React.CSSProperties => ({
    padding: "0.25rem 0.75rem", fontSize: "0.8rem", cursor: "pointer",
    borderRadius: 20, border: "1px solid #ccc",
    background: active ? "#111" : "#fff",
    color: active ? "#fff" : "#555",
  });

  return (
    <>
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem 1rem 5rem" }}>

      {/* Discover / Friends tabs */}
      <div style={{ display: "flex", borderBottom: "1px solid #e0e0e0", marginBottom: "1rem" }}>
        <button style={tabBtnStyle(feedTab === "discover")} onClick={() => setFeedTab("discover")}>Discover</button>
        <button style={tabBtnStyle(feedTab === "friends")} onClick={() => setFeedTab("friends")}>Friends</button>
      </div>

      {/* Secondary controls — only Discover shows Hot/New */}
      {feedTab === "discover" && (
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "0.75rem" }}>
          {(["hot", "new"] as const).map((s) => (
            <button key={s} onClick={() => setSort(s)} style={pillStyle(sort === s)}>
              {s === "hot" ? "Hot" : "New"}
            </button>
          ))}
        </div>
      )}

      {/* Faculty filter pills — both tabs */}
      <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <button onClick={() => setFacultyFilter(null)} style={pillStyle(facultyFilter === null)}>All</button>
        {FACULTIES.map((f) => (
          <button key={f} onClick={() => setFacultyFilter(facultyFilter === f ? null : f)} style={pillStyle(facultyFilter === f)}>{f}</button>
        ))}
      </div>

      {/* People search — always visible in Friends tab */}
      {feedTab === "friends" && (
        <div style={{ marginBottom: "1.25rem" }}>
          <p style={{ margin: "0 0 0.6rem", fontSize: "0.85rem", color: "#555", fontWeight: 500 }}>Find people to follow</p>
          <PeopleSearch onFollowChange={() => setFeedRefreshKey((k) => k + 1)} />
        </div>
      )}

      {/* Posts */}
      {loading && <p style={{ color: "#888" }}>Loading…</p>}
      {!loading && posts.length === 0 && (
        <p style={{ color: "#aaa", textAlign: "center", marginTop: "2rem" }}>
          {feedTab === "friends"
            ? "No posts from people you follow yet. Follow someone above to see their posts here."
            : facultyFilter
              ? `No posts tagged ${facultyFilter} yet.`
              : "No posts yet. Be the first!"}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {posts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            currentUsername={currentUsername}
            onVote={handleVote}
            onDelete={handleDelete}
            onPollUpdate={(id, poll) => setPosts((prev) => prev.map((p) => p.id === id ? { ...p, poll } : p))}
          />
        ))}
      </div>

      {total > posts.length && (
        <p style={{ color: "#888", textAlign: "center", marginTop: "1rem" }}>
          Showing {posts.length} of {total} posts
        </p>
      )}
      </main>

      {/* Fixed compose bar — above bottom nav */}
      <div style={{ position: "fixed", bottom: 60, left: 0, right: 0, background: "#fff", borderTop: "1px solid #e8e8e8", padding: "0.5rem 1rem", zIndex: 50 }}>
        <div
          onClick={() => setComposerOpen(true)}
          style={{ maxWidth: 640, margin: "0 auto", display: "flex", alignItems: "center", padding: "0.6rem 1rem", borderRadius: 20, background: "#f5f5f5", cursor: "text", color: "#aaa", fontSize: "0.95rem" }}
        >
          What&apos;s on your mind?
        </div>
      </div>

      {/* Compose sheet */}
      {composerOpen && (
        <>
          <div onClick={() => { setComposerOpen(false); setPollDraft(null); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 100 }} />
          <div style={{ position: "fixed", bottom: 60, left: "50%", transform: "translateX(-50%)", width: "min(600px, 94vw)", background: "#fff", borderRadius: 16, padding: "1rem 1rem 1.5rem", zIndex: 101, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 4px 32px rgba(0,0,0,0.18)" }}>
            <div style={{ maxWidth: 640, margin: "0 auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <span style={{ fontWeight: "600", fontSize: "1rem" }}>Create post</span>
                <button onClick={() => { setComposerOpen(false); setPollDraft(null); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.5rem", color: "#999", lineHeight: 1, padding: "0 0.2rem" }}>×</button>
              </div>
              <form onSubmit={handlePost}>
                <textarea
                  autoFocus
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="What's on your mind?"
                  rows={4}
                  style={{ width: "100%", boxSizing: "border-box", padding: "0.6rem", fontSize: "0.95rem", border: "1px solid #ccc", borderRadius: 4, fontFamily: "inherit", resize: "vertical" }}
                />
                <ImageUploader
                  key={uploaderKey}
                  onUrlsChange={(urls, uploading) => { setImageUrls(urls); setImagesUploading(uploading); }}
                />
                <PollComposer value={pollDraft} onChange={setPollDraft} />
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                  <select
                    value={postFacultyTag}
                    onChange={(e) => setPostFacultyTag(e.target.value as Faculty | "")}
                    style={{ padding: "0.4rem 0.6rem", fontSize: "0.88rem", border: "1px solid #ccc", borderRadius: 4, fontFamily: "inherit", color: postFacultyTag ? "#111" : "#888", background: "#fff" }}
                  >
                    <option value="">Tag faculty (optional)</option>
                    {FACULTIES.map((f) => <option key={f} value={f}>{f} — {FACULTY_NAMES[f]}</option>)}
                  </select>
                  {postError && <p style={{ color: "crimson", margin: 0, fontSize: "0.9rem" }}>{postError}</p>}
                  <button
                    type="submit"
                    disabled={submitting || imagesUploading || (!content.trim() && !imageUrls.length && !pollDraft)}
                    style={{ marginLeft: "auto", padding: "0.5rem 1.2rem", cursor: "pointer" }}
                  >
                    {imagesUploading ? "Uploading…" : submitting ? "Posting…" : "Post"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </>
  );
}

// ── Post components ───────────────────────────────────────────────────────────

function SharePanel({ postId, shareCount }: { postId: string; shareCount: number }) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [msg, setMsg] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function close() { setOpen(false); setUsername(""); setMsg(""); setStatus("idle"); setError(null); }

  async function handleShare(e: React.FormEvent) {
    e.preventDefault();
    if (!username.trim()) return;
    setStatus("sending");
    setError(null);
    try {
      await apiFetch("/api/messages/share", {
        method: "POST",
        body: JSON.stringify({ recipient_username: username.trim(), post_id: postId, content: msg.trim() }),
      });
      setStatus("sent");
      setTimeout(close, 1500);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not share.");
      setStatus("error");
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#555", fontSize: "0.9rem" }}
      >
        ↗ {shareCount > 0 ? shareCount : "Share"}
      </button>
      {open && (
        <>
          <div onClick={close} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200 }} />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(360px, 90vw)", background: "#fff", borderRadius: 12, padding: "1.25rem", zIndex: 201, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <span style={{ fontWeight: 600, fontSize: "1rem" }}>Share via message</span>
              <button onClick={close} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.4rem", color: "#999", lineHeight: 1, padding: 0 }}>×</button>
            </div>
            <form onSubmit={handleShare} style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
              <UserSearchInput value={username} onChange={setUsername} onSelect={(u) => setUsername(u)} placeholder="Search by name or username" />
              <input value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Add a message (optional)" style={{ padding: "0.5rem 0.6rem", fontSize: "0.9rem", border: "1px solid #ccc", borderRadius: 6, fontFamily: "inherit" }} />
              {error && <p style={{ margin: 0, fontSize: "0.82rem", color: "crimson" }}>{error}</p>}
              {status === "sent" && <p style={{ margin: 0, fontSize: "0.88rem", color: "#1a6b3a" }}>Sent!</p>}
              <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
                <button type="submit" disabled={status === "sending" || status === "sent" || !username.trim()} style={{ flex: 1, padding: "0.5rem", fontSize: "0.9rem", cursor: "pointer", background: "#111", color: "#fff", border: "none", borderRadius: 6 }}>
                  {status === "sending" ? "Sending…" : "Send"}
                </button>
                <button type="button" onClick={close} style={{ padding: "0.5rem 1rem", fontSize: "0.9rem", cursor: "pointer", background: "none", border: "1px solid #ccc", borderRadius: 6 }}>Cancel</button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}

function PostCard({
  post, currentUsername, onVote, onDelete, onPollUpdate,
}: {
  post: Post;
  currentUsername: string | null;
  onVote: (id: string, type: "up" | "down") => void;
  onDelete: (id: string) => void;
  onPollUpdate: (postId: string, poll: Poll) => void;
}) {
  const voted = post.current_user_vote;
  const isOwn = currentUsername !== null && post.author?.username === currentUsername;

  return (
    <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: "1rem", background: "#fff" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", marginBottom: "0.6rem" }}>
        <Link href={`/profile/${post.author?.username}`} style={{ flexShrink: 0 }}>
          <MiniAvatar name={post.author?.display_name ?? "?"} url={post.author?.avatar_url ?? null} />
        </Link>
        <div style={{ flex: 1, minWidth: 0 }}>
          <Link href={`/profile/${post.author?.username}`} style={{ color: "inherit", textDecoration: "none" }}>
            <strong style={{ color: "#222", fontSize: "0.9rem" }}>{post.author?.display_name ?? "Unknown"}</strong>
            {" "}<span style={{ color: "#999", fontSize: "0.82rem" }}>@{post.author?.username ?? "?"}</span>
          </Link>
          <span style={{ color: "#bbb", fontSize: "0.8rem" }}> · {timeAgo(post.created_at)}</span>
        </div>
        {post.faculty_tag && <FacultyBadge tag={post.faculty_tag} />}
      </div>
      <ImageGrid urls={post.image_urls ?? []} />
      {post.content && (
        <p style={{ margin: "0 0 0.75rem", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{post.content}</p>
      )}
      {post.poll && (
        <PollDisplay postId={post.id} poll={post.poll} onUpdate={(p) => onPollUpdate(post.id, p)} />
      )}
      <div style={{ display: "flex", gap: "1rem", alignItems: "center", fontSize: "0.9rem", flexWrap: "wrap" }}>
        <button onClick={() => onVote(post.id, "up")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: voted === "up" ? "#e05c00" : "#555", fontWeight: voted === "up" ? "bold" : "normal" }}>▲ {post.upvotes}</button>
        <button onClick={() => onVote(post.id, "down")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: voted === "down" ? "#5555dd" : "#555", fontWeight: voted === "down" ? "bold" : "normal" }}>▼ {post.downvotes}</button>
        <Link href={`/feed/${post.id}`} style={{ color: "#555", textDecoration: "none" }}>💬 {post.reply_count} {post.reply_count === 1 ? "reply" : "replies"}</Link>
        <SharePanel postId={post.id} shareCount={post.share_count} />
        {isOwn && (
          <button onClick={() => onDelete(post.id)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", padding: 0, color: "#ccc", fontSize: "0.85rem" }}>Delete</button>
        )}
      </div>
    </div>
  );
}
