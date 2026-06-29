"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import UserSearchInput from "@/components/UserSearchInput";
import { ImageUploader } from "@/components/ImageUploader";
import { ImageGrid } from "@/components/ImageGrid";
import MiniAvatar from "@/components/MiniAvatar";
import { timeAgo } from "@/lib/timeAgo";

// ── types ─────────────────────────────────────────────────────────────────────

interface Author {
  username: string;
  display_name: string;
  avatar_url: string | null;
}


interface Post {
  id: string;
  content: string;
  faculty_tag: string | null;
  image_urls: string[];
  parent_post_id: string | null;
  author: Author | null;
  upvotes: number;
  downvotes: number;
  current_user_vote: "up" | "down" | null;
  reply_count: number;
  share_count: number;
  created_at: string;
  is_deleted: boolean;
}

interface VoteResponse {
  upvotes: number;
  downvotes: number;
  current_user_vote: "up" | "down" | null;
}

interface TreeNode {
  post: Post;
  children: TreeNode[];
}

interface ThreadCtx {
  currentUsername: string | null;
  replyingToId: string | null;
  inlineContent: string;
  inlineImageUrls: string[];
  inlineImagesUploading: boolean;
  inlineUploaderKey: number;
  inlineSubmitting: boolean;
  inlineError: string | null;
  onVote: (id: string, type: "up" | "down") => void;
  onDelete: (id: string) => void;
  onStartReply: (id: string) => void;
  onSetContent: (v: string) => void;
  onSetUrls: (urls: string[], uploading: boolean) => void;
  onSubmitInline: (parentId: string) => void;
  onCancelInline: () => void;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function buildTree(posts: Post[], parentId: string): TreeNode[] {
  return posts
    .filter((p) => p.parent_post_id === parentId)
    .map((p) => ({ post: p, children: buildTree(posts, p.id) }));
}

// ── thread context ─────────────────────────────────────────────────────────────

const Ctx = createContext<ThreadCtx | null>(null);

// ── share panel ───────────────────────────────────────────────────────────────

function SharePanel({ postId, shareCount }: { postId: string; shareCount: number }) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [msg, setMsg] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

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
      setTimeout(() => { setStatus("idle"); setOpen(false); setUsername(""); setMsg(""); }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not share.");
      setStatus("error");
    }
  }

  return (
    <span>
      <button
        onClick={() => { setOpen((v) => !v); setStatus("idle"); setError(null); }}
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#888", fontSize: "0.82rem" }}
      >
        ↗ {shareCount > 0 ? shareCount : "Share"}
      </button>
      {open && (
        <form
          onSubmit={handleShare}
          style={{ marginTop: "0.5rem", padding: "0.65rem", border: "1px solid #e0e0e0", borderRadius: 6, background: "#fafafa", display: "flex", flexDirection: "column", gap: "0.4rem" }}
        >
          <UserSearchInput value={username} onChange={setUsername} onSelect={(u) => setUsername(u)} placeholder="Search by name or username" />
          <input
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="Add a message (optional)"
            style={{ padding: "0.4rem 0.6rem", fontSize: "0.85rem", border: "1px solid #ccc", borderRadius: 4, fontFamily: "inherit" }}
          />
          {error && <p style={{ margin: 0, fontSize: "0.82rem", color: "crimson" }}>{error}</p>}
          <div style={{ display: "flex", gap: "0.5rem" }}>
            <button
              type="submit"
              disabled={status === "sending" || !username.trim()}
              style={{ padding: "0.3rem 0.75rem", fontSize: "0.82rem", cursor: "pointer", background: "#111", color: "#fff", border: "none", borderRadius: 4 }}
            >
              {status === "sending" ? "Sharing…" : status === "sent" ? "Shared!" : "Share"}
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{ padding: "0.3rem 0.7rem", fontSize: "0.82rem", cursor: "pointer", background: "none", border: "1px solid #ccc", borderRadius: 4 }}
            >Cancel</button>
          </div>
        </form>
      )}
    </span>
  );
}

// ── recursive comment node ─────────────────────────────────────────────────────

function CommentNode({ node, depth }: { node: TreeNode; depth: number }) {
  const ctx = useContext(Ctx)!;
  const p = node.post;
  const isOwn = ctx.currentUsername !== null && p.author?.username === ctx.currentUsername;
  const isReplying = ctx.replyingToId === p.id;

  return (
    <div style={{ marginBottom: "0.5rem" }}>
      <div
        style={{
          borderLeft: depth > 0 ? "2px solid #e8e8e8" : "none",
          paddingLeft: depth > 0 ? 12 : 0,
          marginLeft: depth > 0 ? Math.min(depth, 4) * 16 : 0,
        }}
      >
        {p.is_deleted ? (
          <p style={{ color: "#bbb", margin: "0 0 0.5rem", fontStyle: "italic", fontSize: "0.88rem" }}>[deleted]</p>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.35rem" }}>
              <Link href={`/profile/${p.author?.username}`} style={{ flexShrink: 0 }}>
                <MiniAvatar name={p.author?.display_name ?? "?"} url={p.author?.avatar_url ?? null} size={26} />
              </Link>
              <div style={{ fontSize: "0.8rem", color: "#888" }}>
                <Link href={`/profile/${p.author?.username}`} style={{ color: "inherit", textDecoration: "none" }}>
                  <strong style={{ color: "#333" }}>{p.author?.display_name ?? "Unknown"}</strong>{" "}
                  @{p.author?.username ?? "?"}
                </Link>
                {" · "}{timeAgo(p.created_at)}
              </div>
            </div>
            <ImageGrid urls={p.image_urls ?? []} />
            {p.content && (
              <p style={{ margin: "0 0 0.35rem", whiteSpace: "pre-wrap", lineHeight: 1.45, fontSize: "0.93rem" }}>{p.content}</p>
            )}
            <div style={{ display: "flex", gap: "0.85rem", alignItems: "center", fontSize: "0.82rem", flexWrap: "wrap" }}>
              <button
                onClick={() => ctx.onVote(p.id, "up")}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: p.current_user_vote === "up" ? "#e05c00" : "#888", fontWeight: p.current_user_vote === "up" ? "bold" : "normal" }}
              >▲ {p.upvotes}</button>
              <button
                onClick={() => ctx.onVote(p.id, "down")}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: p.current_user_vote === "down" ? "#5555dd" : "#888", fontWeight: p.current_user_vote === "down" ? "bold" : "normal" }}
              >▼ {p.downvotes}</button>
              <button
                onClick={() => ctx.onStartReply(p.id)}
                style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: isReplying ? "#111" : "#888", fontWeight: isReplying ? "600" : "normal", fontSize: "0.82rem" }}
              >💬 Reply</button>
              <SharePanel postId={p.id} shareCount={p.share_count} />
              {isOwn && (
                <button
                  onClick={() => ctx.onDelete(p.id)}
                  style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#ccc", fontSize: "0.82rem", marginLeft: "auto" }}
                >Delete</button>
              )}
            </div>
          </>
        )}

        {isReplying && (
          <div style={{ marginTop: "0.5rem" }}>
            <textarea
              value={ctx.inlineContent}
              onChange={(e) => ctx.onSetContent(e.target.value)}
              placeholder={`Reply to ${p.author?.display_name ?? "comment"}…`}
              rows={2}
              autoFocus
              style={{ width: "100%", boxSizing: "border-box", padding: "0.45rem 0.6rem", fontSize: "0.9rem", border: "1px solid #ccc", borderRadius: 4, fontFamily: "inherit", resize: "vertical" }}
            />
            <ImageUploader key={ctx.inlineUploaderKey} onUrlsChange={ctx.onSetUrls} />
            {ctx.inlineError && (
              <p style={{ color: "crimson", margin: "0.2rem 0", fontSize: "0.82rem" }}>{ctx.inlineError}</p>
            )}
            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.35rem" }}>
              <button
                onClick={() => ctx.onSubmitInline(p.id)}
                disabled={ctx.inlineSubmitting || ctx.inlineImagesUploading || (!ctx.inlineContent.trim() && !ctx.inlineImageUrls.length)}
                style={{ padding: "0.3rem 0.8rem", fontSize: "0.85rem", cursor: "pointer", background: "#111", color: "#fff", border: "none", borderRadius: 4 }}
              >
                {ctx.inlineImagesUploading ? "Uploading…" : ctx.inlineSubmitting ? "Posting…" : "Reply"}
              </button>
              <button
                onClick={ctx.onCancelInline}
                style={{ padding: "0.3rem 0.7rem", fontSize: "0.85rem", cursor: "pointer", background: "none", border: "1px solid #ccc", borderRadius: 4 }}
              >Cancel</button>
            </div>
          </div>
        )}

        {node.children.length > 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            {node.children.map((child) => (
              <CommentNode key={child.post.id} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function PostDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [post, setPost] = useState<Post | null>(null);
  const [allReplies, setAllReplies] = useState<Post[]>([]);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Top-level comment form (reply to the post itself)
  const [topContent, setTopContent] = useState("");
  const [topImageUrls, setTopImageUrls] = useState<string[]>([]);
  const [topImagesUploading, setTopImagesUploading] = useState(false);
  const [topUploaderKey, setTopUploaderKey] = useState(0);
  const [topSubmitting, setTopSubmitting] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  // Inline reply form (reply to a specific comment)
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [inlineContent, setInlineContent] = useState("");
  const [inlineImageUrls, setInlineImageUrls] = useState<string[]>([]);
  const [inlineImagesUploading, setInlineImagesUploading] = useState(false);
  const [inlineUploaderKey, setInlineUploaderKey] = useState(0);
  const [inlineSubmitting, setInlineSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<{ post: Post; replies: Post[] }>(`/api/posts/${id}`),
      apiFetch<{ username: string }>("/api/auth/me"),
    ])
      .then(([data, me]) => {
        setPost(data.post);
        setAllReplies(data.replies);
        setCurrentUsername(me.username);
      })
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [id, router]);

  async function handleVote(targetId: string, voteType: "up" | "down") {
    try {
      const data = await apiFetch<VoteResponse>(`/api/posts/${targetId}/vote`, {
        method: "POST",
        body: JSON.stringify({ vote_type: voteType }),
      });
      setPost((prev) => (prev?.id === targetId ? { ...prev, ...data } : prev));
      setAllReplies((prev) => prev.map((p) => (p.id === targetId ? { ...p, ...data } : p)));
    } catch { /* non-critical */ }
  }

  async function handleDelete(targetId: string) {
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    try {
      await apiFetch(`/api/posts/${targetId}`, { method: "DELETE" });
      setPost((prev) => (prev?.id === targetId ? { ...prev, is_deleted: true, content: "[deleted]" } : prev));
      setAllReplies((prev) => prev.map((p) => (p.id === targetId ? { ...p, is_deleted: true, content: "[deleted]" } : p)));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  async function handleTopReply(e: React.FormEvent) {
    e.preventDefault();
    if (!topContent.trim() && !topImageUrls.length) return;
    if (topImagesUploading) return;
    setTopSubmitting(true);
    setTopError(null);
    try {
      const newReply = await apiFetch<Post>(`/api/posts/${id}/replies`, {
        method: "POST",
        body: JSON.stringify({ content: topContent.trim(), image_urls: topImageUrls }),
      });
      setAllReplies((prev) => [...prev, newReply]);
      setPost((prev) => (prev ? { ...prev, reply_count: prev.reply_count + 1 } : prev));
      setTopContent("");
      setTopImageUrls([]);
      setTopUploaderKey((k) => k + 1);
      setComposerOpen(false);
    } catch (err: unknown) {
      setTopError(err instanceof Error ? err.message : "Failed to post comment.");
    } finally {
      setTopSubmitting(false);
    }
  }

  function startInlineReply(commentId: string) {
    if (replyingToId === commentId) { setReplyingToId(null); return; }
    setReplyingToId(commentId);
    setInlineContent("");
    setInlineImageUrls([]);
    setInlineError(null);
    setInlineUploaderKey((k) => k + 1);
  }

  async function handleInlineReply(parentId: string) {
    if (!inlineContent.trim() && !inlineImageUrls.length) return;
    if (inlineImagesUploading) return;
    setInlineSubmitting(true);
    setInlineError(null);
    try {
      const newReply = await apiFetch<Post>(`/api/posts/${parentId}/replies`, {
        method: "POST",
        body: JSON.stringify({ content: inlineContent.trim(), image_urls: inlineImageUrls }),
      });
      setAllReplies((prev) => [...prev, newReply]);
      setPost((prev) => (prev ? { ...prev, reply_count: prev.reply_count + 1 } : prev));
      setReplyingToId(null);
      setInlineContent("");
      setInlineImageUrls([]);
    } catch (err: unknown) {
      setInlineError(err instanceof Error ? err.message : "Failed to reply.");
    } finally {
      setInlineSubmitting(false);
    }
  }

  if (loading) return <p style={{ padding: "2rem", color: "#888" }}>Loading…</p>;
  if (!post) return null;

  const tree = buildTree(allReplies, post.id);
  const isOwnPost = currentUsername !== null && post.author?.username === currentUsername;

  const ctxValue: ThreadCtx = {
    currentUsername,
    replyingToId,
    inlineContent,
    inlineImageUrls,
    inlineImagesUploading,
    inlineUploaderKey,
    inlineSubmitting,
    inlineError,
    onVote: handleVote,
    onDelete: handleDelete,
    onStartReply: startInlineReply,
    onSetContent: setInlineContent,
    onSetUrls: (urls, uploading) => { setInlineImageUrls(urls); setInlineImagesUploading(uploading); },
    onSubmitInline: handleInlineReply,
    onCancelInline: () => setReplyingToId(null),
  };

  return (
    <Ctx.Provider value={ctxValue}>
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem 1rem 5rem" }}>
        <Link href="/feed" style={{ fontSize: "0.9rem" }}>← Back to feed</Link>

        {/* Original post */}
        <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: "1rem", margin: "1rem 0", background: "#fff" }}>
          {post.is_deleted ? (
            <p style={{ color: "#aaa", margin: 0, fontStyle: "italic" }}>[deleted]</p>
          ) : (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: "0.55rem", marginBottom: "0.6rem" }}>
                <Link href={`/profile/${post.author?.username}`} style={{ flexShrink: 0 }}>
                  <MiniAvatar name={post.author?.display_name ?? "?"} url={post.author?.avatar_url ?? null} size={36} />
                </Link>
                <div style={{ flex: 1 }}>
                  <Link href={`/profile/${post.author?.username}`} style={{ color: "inherit", textDecoration: "none", fontSize: "0.88rem" }}>
                    <strong style={{ color: "#222" }}>{post.author?.display_name ?? "Unknown"}</strong>{" "}
                    <span style={{ color: "#999" }}>@{post.author?.username ?? "?"}</span>
                  </Link>
                  <div style={{ fontSize: "0.78rem", color: "#bbb", display: "flex", gap: "0.4rem", alignItems: "center" }}>
                    <span>{timeAgo(post.created_at)}</span>
                    {post.faculty_tag && (
                      <span style={{ fontSize: "0.72rem", fontWeight: "bold", padding: "0.1rem 0.45rem", borderRadius: 12, background: "#f0f0f0", color: "#444" }}>
                        {post.faculty_tag}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <ImageGrid urls={post.image_urls ?? []} />
              {post.content && (
                <p style={{ margin: "0 0 0.75rem", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>{post.content}</p>
              )}
              <div style={{ display: "flex", gap: "1rem", alignItems: "center", flexWrap: "wrap", fontSize: "0.9rem" }}>
                <button onClick={() => handleVote(post.id, "up")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: post.current_user_vote === "up" ? "#e05c00" : "#555", fontWeight: post.current_user_vote === "up" ? "bold" : "normal" }}>▲ {post.upvotes}</button>
                <button onClick={() => handleVote(post.id, "down")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: post.current_user_vote === "down" ? "#5555dd" : "#555", fontWeight: post.current_user_vote === "down" ? "bold" : "normal" }}>▼ {post.downvotes}</button>
                <SharePanel postId={post.id} shareCount={post.share_count} />
                {isOwnPost && (
                  <button onClick={() => handleDelete(post.id)} style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", padding: 0, color: "#ccc", fontSize: "0.85rem" }}>Delete</button>
                )}
              </div>
            </>
          )}
        </div>

        {/* Comment count + thread */}
        <div style={{ borderTop: "1px solid #eee", paddingTop: "0.75rem" }}>
          <h3 style={{ color: "#444", marginTop: 0, marginBottom: "1rem" }}>
            {allReplies.length} {allReplies.length === 1 ? "comment" : "comments"}
          </h3>
          {tree.map((node) => (
            <CommentNode key={node.post.id} node={node} depth={0} />
          ))}
        </div>
      </main>

      {/* Fixed compose bar */}
      <div style={{ position: "fixed", bottom: 60, left: 0, right: 0, background: "#fff", borderTop: "1px solid #e8e8e8", padding: "0.5rem 1rem", zIndex: 50 }}>
        <div
          onClick={() => setComposerOpen(true)}
          style={{ maxWidth: 640, margin: "0 auto", display: "flex", alignItems: "center", padding: "0.6rem 1rem", borderRadius: 20, background: "#f5f5f5", cursor: "text", color: "#aaa", fontSize: "0.95rem" }}
        >
          Add a comment…
        </div>
      </div>

      {composerOpen && (
        <>
          <div onClick={() => setComposerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 100 }} />
          <div style={{ position: "fixed", bottom: 60, left: "50%", transform: "translateX(-50%)", width: "min(600px, 94vw)", background: "#fff", borderRadius: 16, padding: "1rem 1rem 1.5rem", zIndex: 101, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 4px 32px rgba(0,0,0,0.18)" }}>
            <div style={{ maxWidth: 640, margin: "0 auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <span style={{ fontWeight: "600", fontSize: "1rem" }}>Add a comment</span>
                <button onClick={() => setComposerOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.5rem", color: "#999", lineHeight: 1, padding: "0 0.2rem" }}>×</button>
              </div>
              <form onSubmit={handleTopReply}>
                <textarea
                  autoFocus
                  value={topContent}
                  onChange={(e) => setTopContent(e.target.value)}
                  placeholder="Add a comment…"
                  rows={4}
                  style={{ width: "100%", boxSizing: "border-box", padding: "0.6rem", fontSize: "0.95rem", border: "1px solid #ccc", borderRadius: 4, fontFamily: "inherit", resize: "vertical" }}
                />
                <ImageUploader
                  key={topUploaderKey}
                  onUrlsChange={(urls, uploading) => { setTopImageUrls(urls); setTopImagesUploading(uploading); }}
                />
                {topError && <p style={{ color: "crimson", margin: "0.25rem 0", fontSize: "0.9rem" }}>{topError}</p>}
                <button
                  type="submit"
                  disabled={topSubmitting || topImagesUploading || (!topContent.trim() && !topImageUrls.length)}
                  style={{ marginTop: "0.5rem", padding: "0.5rem 1.2rem", cursor: "pointer" }}
                >
                  {topImagesUploading ? "Uploading…" : topSubmitting ? "Posting…" : "Comment"}
                </button>
              </form>
            </div>
          </div>
        </>
      )}
    </Ctx.Provider>
  );
}
