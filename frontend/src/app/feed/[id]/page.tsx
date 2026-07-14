"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import {
  ChevronUp,
  ChevronDown,
  MessageCircle,
  Share2,
  Trash2,
  X,
  ArrowLeft,
  CornerDownRight,
  Pencil,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { clearFeedCache } from "@/lib/feedCache";
import UserSearchInput from "@/components/UserSearchInput";
import { AttachBar } from "@/components/AttachBar";
import { ImageGrid } from "@/components/ImageGrid";
import { FileAttachmentList } from "@/components/FileAttachmentList";
import type { FileAttachment } from "@/components/FileUploader";
import MiniAvatar from "@/components/MiniAvatar";
import BookmarkButton from "@/components/BookmarkButton";
import MentionSuggestions from "@/components/MentionSuggestions";
import { Linkify } from "@/lib/linkify";
import { timeAgo } from "@/lib/timeAgo";
import { lastVisitedPath } from "@/lib/navHistory";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  file_attachments: FileAttachment[];
  parent_post_id: string | null;
  author: Author | null;
  upvotes: number;
  downvotes: number;
  current_user_vote: "up" | "down" | null;
  reply_count: number;
  share_count: number;
  created_at: string;
  edited_at: string | null;
  is_deleted: boolean;
  is_bookmarked: boolean;
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
  inlineFileAttachments: FileAttachment[];
  inlineUploading: boolean;
  inlineSubmitting: boolean;
  inlineError: string | null;
  onVote: (id: string, type: "up" | "down") => void;
  onDelete: (id: string) => void;
  onEdited: (id: string, content: string, editedAt: string | null) => void;
  onStartReply: (id: string) => void;
  onSetContent: (v: string) => void;
  onSetAttachments: (imageUrls: string[], fileAttachments: FileAttachment[], uploading: boolean) => void;
  onSubmitInline: (parentId: string) => void;
  onCancelInline: () => void;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function buildTree(posts: Post[], parentId: string): TreeNode[] {
  return posts
    .filter((p) => p.parent_post_id === parentId)
    .map((p) => ({ post: p, children: buildTree(posts, p.id) }));
}

const Ctx = createContext<ThreadCtx | null>(null);

// ── share panel ───────────────────────────────────────────────────────────────

function SharePanel({ postId, shareCount }: { postId: string; shareCount: number }) {
  const [open, setOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [msg, setMsg] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  function close() {
    setOpen(false);
    setUsername("");
    setMsg("");
    setStatus("idle");
    setError(null);
  }

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
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <Share2 className="w-3.5 h-3.5" />
        {shareCount > 0 && <span>{shareCount}</span>}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <>
          <div onClick={close} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200]" />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(360px,90vw)] bg-white rounded-2xl shadow-2xl z-[201] p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold text-sm">Share via message</span>
              <button onClick={close} className="rounded-full p-1 hover:bg-muted text-muted-foreground transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleShare} className="space-y-3">
              <UserSearchInput value={username} onChange={setUsername} onSelect={(u) => setUsername(u)} placeholder="Search by name or username" />
              <input
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                placeholder="Add a message (optional)"
                className="w-full h-9 px-3 text-sm border border-input rounded-md bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              {status === "sent" && <p className="text-xs text-green-600 font-medium">Sent!</p>}
              <div className="flex gap-2">
                <Button type="submit" disabled={status === "sending" || status === "sent" || !username.trim()} className="flex-1">
                  {status === "sending" ? "Sending…" : "Send"}
                </Button>
                <Button type="button" variant="outline" onClick={close}>Cancel</Button>
              </div>
            </form>
          </div>
        </>,
        document.body
      )}
    </>
  );
}

// ── recursive comment node ─────────────────────────────────────────────────────

function CommentNode({ node, depth }: { node: TreeNode; depth: number }) {
  const ctx = useContext(Ctx)!;
  const p = node.post;
  const isOwn = ctx.currentUsername !== null && p.author?.username === ctx.currentUsername;
  const isReplying = ctx.replyingToId === p.id;
  const voted = p.current_user_vote;
  const indent = Math.min(depth, 4) * 14;
  const isCutOff = node.children.length === 0 && p.reply_count > 0;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(p.content);
  const [savingEdit, setSavingEdit] = useState(false);
  const [replyCaret, setReplyCaret] = useState<number | null>(null);

  async function saveEdit() {
    const next = draft.trim();
    if (!next || next === p.content) { setEditing(false); return; }
    setSavingEdit(true);
    try {
      const res = await apiFetch<{ content: string; edited_at: string | null }>(
        `/api/posts/${p.id}`,
        { method: "PATCH", body: JSON.stringify({ content: next }) }
      );
      ctx.onEdited(p.id, res.content, res.edited_at);
      setEditing(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not save edit.");
    } finally {
      setSavingEdit(false);
    }
  }

  return (
    <div className="mb-1">
      <div
        className={cn(depth > 0 && "border-l-2 border-border pl-3")}
        style={{ marginLeft: indent }}
      >
        {p.is_deleted ? (
          <p className="text-muted-foreground/50 italic text-xs py-1">[deleted]</p>
        ) : (
          <>
            {/* Comment header */}
            <div className="flex items-center gap-2 mb-1">
              <Link href={`/profile/${p.author?.username}`} className="flex-shrink-0">
                <MiniAvatar name={p.author?.display_name ?? "?"} url={p.author?.avatar_url ?? null} size={26} />
              </Link>
              <div className="text-xs text-muted-foreground">
                <Link href={`/profile/${p.author?.username}`} className="no-underline hover:underline">
                  <span className="font-semibold text-foreground">{p.author?.display_name ?? "Unknown"}</span>
                  {" "}
                  <span>@{p.author?.username ?? "?"}</span>
                </Link>
                <span> · {timeAgo(p.created_at)}</span>
                {p.edited_at && <span className="italic"> · edited</span>}
              </div>
            </div>

            {/* Comment images */}
            <ImageGrid urls={p.image_urls ?? []} />
            {/* Comment file attachments */}
            {(p.file_attachments ?? []).length > 0 && (
              <div className="px-4 pb-2">
                <FileAttachmentList attachments={p.file_attachments} />
              </div>
            )}

            {/* Comment content — swaps to an inline editor for the author */}
            {editing ? (
              <div className="mb-1.5 space-y-2">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={Math.min(6, Math.max(2, draft.split("\n").length + 1))}
                  autoFocus
                  className="w-full resize-none text-sm leading-relaxed bg-muted rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <div className="flex items-center gap-2 justify-end">
                  <button
                    onClick={() => { setEditing(false); setDraft(p.content); }}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
                  >
                    Cancel
                  </button>
                  <Button size="sm" onClick={saveEdit} disabled={savingEdit || !draft.trim()}>
                    {savingEdit ? "Saving…" : "Save"}
                  </Button>
                </div>
              </div>
            ) : (
              p.content && (
                <p className="text-sm leading-relaxed mb-1.5"><Linkify text={p.content} /></p>
              )
            )}

            {/* Comment actions */}
            <div className="flex items-center gap-0.5 -ml-1.5 mb-2">
              <button
                onClick={() => ctx.onVote(p.id, "up")}
                className={cn(
                  "flex items-center gap-0.5 px-1.5 py-1 rounded-md text-xs font-medium transition-colors",
                  voted === "up" ? "text-orange-500" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <ChevronUp className={cn("w-3.5 h-3.5", voted === "up" && "vote-pop")} />
                {p.upvotes}
              </button>
              <button
                onClick={() => ctx.onVote(p.id, "down")}
                className={cn(
                  "flex items-center gap-0.5 px-1.5 py-1 rounded-md text-xs font-medium transition-colors",
                  voted === "down" ? "text-indigo-500" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <ChevronDown className={cn("w-3.5 h-3.5", voted === "down" && "vote-pop")} />
                {p.downvotes}
              </button>
              <button
                onClick={() => ctx.onStartReply(p.id)}
                className={cn(
                  "flex items-center gap-1 px-1.5 py-1 rounded-md text-xs font-medium transition-colors",
                  isReplying
                    ? "text-primary bg-primary/5"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <MessageCircle className="w-3.5 h-3.5" />
                Reply
              </button>
              <SharePanel postId={p.id} shareCount={p.share_count} />
              {isOwn && (
                <div className="ml-auto flex items-center">
                  {p.content && (
                    <button
                      onClick={() => { setDraft(p.content); setEditing(true); }}
                      aria-label="Edit comment"
                      className="flex items-center px-1.5 py-1 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-colors"
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                  )}
                  <button
                    onClick={() => ctx.onDelete(p.id)}
                    aria-label="Delete comment"
                    className="flex items-center px-1.5 py-1 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/5 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {/* Inline reply form */}
        {isReplying && (
          <div className="mb-3 space-y-2">
            <div className="relative">
              <textarea
                value={ctx.inlineContent}
                onChange={(e) => { ctx.onSetContent(e.target.value); setReplyCaret(e.target.selectionStart); }}
                onKeyUp={(e) => setReplyCaret(e.currentTarget.selectionStart)}
                onClick={(e) => setReplyCaret(e.currentTarget.selectionStart)}
                placeholder={`Reply to ${p.author?.display_name ?? "comment"}…`}
                rows={2}
                autoFocus
                className="w-full resize-none text-sm px-3 py-2 border border-input rounded-xl bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <MentionSuggestions
                value={ctx.inlineContent}
                caret={replyCaret}
                onPick={(v, c) => { ctx.onSetContent(v); setReplyCaret(c); }}
              />
            </div>
            <AttachBar onChange={ctx.onSetAttachments} />
            {ctx.inlineError && <p className="text-xs text-destructive">{ctx.inlineError}</p>}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => ctx.onSubmitInline(p.id)}
                disabled={ctx.inlineSubmitting || ctx.inlineUploading || (!ctx.inlineContent.trim() && !ctx.inlineImageUrls.length && !ctx.inlineFileAttachments.length)}
              >
                {ctx.inlineUploading ? "Uploading…" : ctx.inlineSubmitting ? "Posting…" : "Reply"}
              </Button>
              <Button size="sm" variant="outline" onClick={ctx.onCancelInline}>Cancel</Button>
            </div>
          </div>
        )}

        {/* Nested children */}
        {node.children.length > 0 && (
          <div className="mt-1">
            {node.children.map((child) => (
              <CommentNode key={child.post.id} node={child} depth={depth + 1} />
            ))}
          </div>
        )}

        {/* Thread cut-off — show link to continue in a fresh page rooted at this comment */}
        {isCutOff && (
          <Link
            href={`/feed/${p.id}`}
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-1 mb-2 ml-1"
          >
            <CornerDownRight className="w-3 h-3" />
            Continue this thread
          </Link>
        )}
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function PostDetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  // "Back" returns to the profile you came from, otherwise the feed list.
  // Captured at first render, before this page is pushed onto the nav stack.
  const [backHref] = useState(() => {
    const ref = lastVisitedPath();
    return ref && ref.startsWith("/profile/") ? ref : "/feed";
  });

  const [post, setPost] = useState<Post | null>(null);
  const [allReplies, setAllReplies] = useState<Post[]>([]);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [topContent, setTopContent] = useState("");
  const [topCaret, setTopCaret] = useState<number | null>(null);
  const [topImageUrls, setTopImageUrls] = useState<string[]>([]);
  const [topFileAttachments, setTopFileAttachments] = useState<FileAttachment[]>([]);
  const [topUploading, setTopUploading] = useState(false);
  const [topUploaderKey, setTopUploaderKey] = useState(0);
  const [topSubmitting, setTopSubmitting] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);

  const [editingPost, setEditingPost] = useState(false);
  const [postDraft, setPostDraft] = useState("");
  const [savingPostEdit, setSavingPostEdit] = useState(false);

  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [inlineContent, setInlineContent] = useState("");
  const [inlineImageUrls, setInlineImageUrls] = useState<string[]>([]);
  const [inlineFileAttachments, setInlineFileAttachments] = useState<FileAttachment[]>([]);
  const [inlineUploading, setInlineUploading] = useState(false);
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
      // The feed page's cached snapshot still contains this post — drop it so
      // navigating back shows a fresh feed instead of resurrecting the post.
      clearFeedCache();
      setPost((prev) => (prev?.id === targetId ? { ...prev, is_deleted: true, content: "[deleted]" } : prev));
      setAllReplies((prev) =>
        prev.map((p) => (p.id === targetId ? { ...p, is_deleted: true, content: "[deleted]" } : p))
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  function handleEdited(targetId: string, content: string, editedAt: string | null) {
    setPost((prev) => (prev?.id === targetId ? { ...prev, content, edited_at: editedAt } : prev));
    setAllReplies((prev) => prev.map((p) => (p.id === targetId ? { ...p, content, edited_at: editedAt } : p)));
  }

  async function savePostEdit() {
    if (!post) return;
    const next = postDraft.trim();
    if (!next || next === post.content) { setEditingPost(false); return; }
    setSavingPostEdit(true);
    try {
      const res = await apiFetch<{ content: string; edited_at: string | null }>(
        `/api/posts/${post.id}`,
        { method: "PATCH", body: JSON.stringify({ content: next }) }
      );
      handleEdited(post.id, res.content, res.edited_at);
      setEditingPost(false);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not save edit.");
    } finally {
      setSavingPostEdit(false);
    }
  }

  async function handleTopReply(e: React.FormEvent) {
    e.preventDefault();
    if (!topContent.trim() && !topImageUrls.length && !topFileAttachments.length) return;
    if (topUploading) return;
    setTopSubmitting(true);
    setTopError(null);
    try {
      const newReply = await apiFetch<Post>(`/api/posts/${id}/replies`, {
        method: "POST",
        body: JSON.stringify({ content: topContent.trim(), image_urls: topImageUrls, file_attachments: topFileAttachments }),
      });
      setAllReplies((prev) => [...prev, newReply]);
      setPost((prev) => (prev ? { ...prev, reply_count: prev.reply_count + 1 } : prev));
      setTopContent("");
      setTopImageUrls([]);
      setTopFileAttachments([]);
      setTopUploaderKey((k) => k + 1);
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
    setInlineFileAttachments([]);
    setInlineError(null);
  }

  async function handleInlineReply(parentId: string) {
    if (!inlineContent.trim() && !inlineImageUrls.length && !inlineFileAttachments.length) return;
    if (inlineUploading) return;
    setInlineSubmitting(true);
    setInlineError(null);
    try {
      const newReply = await apiFetch<Post>(`/api/posts/${parentId}/replies`, {
        method: "POST",
        body: JSON.stringify({ content: inlineContent.trim(), image_urls: inlineImageUrls, file_attachments: inlineFileAttachments }),
      });
      setAllReplies((prev) => [...prev, newReply]);
      setPost((prev) => (prev ? { ...prev, reply_count: prev.reply_count + 1 } : prev));
      setReplyingToId(null);
      setInlineContent("");
      setInlineImageUrls([]);
      setInlineFileAttachments([]);
    } catch (err: unknown) {
      setInlineError(err instanceof Error ? err.message : "Failed to reply.");
    } finally {
      setInlineSubmitting(false);
    }
  }

  if (loading) return <p className="p-8 text-center text-muted-foreground text-sm">Loading…</p>;
  if (!post) return null;

  const tree = buildTree(allReplies, post.id);
  const isOwnPost = currentUsername !== null && post.author?.username === currentUsername;
  const postVoted = post.current_user_vote;

  const ctxValue: ThreadCtx = {
    currentUsername,
    replyingToId,
    inlineContent,
    inlineImageUrls,
    inlineFileAttachments,
    inlineUploading,
    inlineSubmitting,
    inlineError,
    onVote: handleVote,
    onDelete: handleDelete,
    onEdited: handleEdited,
    onStartReply: startInlineReply,
    onSetContent: setInlineContent,
    onSetAttachments: (imageUrls, fileAttachments, uploading) => {
      setInlineImageUrls(imageUrls);
      setInlineFileAttachments(fileAttachments);
      setInlineUploading(uploading);
    },
    onSubmitInline: handleInlineReply,
    onCancelInline: () => setReplyingToId(null),
  };

  return (
    <Ctx.Provider value={ctxValue}>
      <main className="max-w-xl mx-auto px-4 pt-4 pb-24">
        {/* Back link — returns to where you came from (profile) or the feed list.
            scroll={false}: the feed restores its own scroll position on return
            (see lib/feedCache.ts) — Next's default scroll-to-top would win the race
            and undo that restoration. */}
        <Link
          href={backHref}
          scroll={false}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4 no-underline"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </Link>

        {/* Original post */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
          {post.is_deleted ? (
            <p className="px-4 py-6 text-muted-foreground italic text-sm">[deleted]</p>
          ) : (
            <>
              {/* Post header */}
              <div className="flex items-center gap-3 px-4 pt-4 pb-3">
                <Link href={`/profile/${post.author?.username}`} className="flex-shrink-0">
                  <MiniAvatar name={post.author?.display_name ?? "?"} url={post.author?.avatar_url ?? null} size={40} />
                </Link>
                <div className="flex-1 min-w-0">
                  <Link href={`/profile/${post.author?.username}`} className="no-underline hover:underline">
                    <span className="font-semibold text-sm text-foreground">
                      {post.author?.display_name ?? "Unknown"}
                    </span>{" "}
                    <span className="text-muted-foreground text-xs">
                      @{post.author?.username ?? "?"}
                    </span>
                  </Link>
                  <span className="text-muted-foreground text-xs"> · {timeAgo(post.created_at)}</span>
                  {post.edited_at && <span className="text-muted-foreground text-xs italic"> · edited</span>}
                </div>
                {post.faculty_tag && (
                  <span className="text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                    {post.faculty_tag}
                  </span>
                )}
              </div>

              {/* Post images */}
              {(post.image_urls ?? []).length > 0 && (
                <div className="px-4 pb-3">
                  <ImageGrid urls={post.image_urls} />
                </div>
              )}

              {/* Post file attachments */}
              {(post.file_attachments ?? []).length > 0 && (
                <div className="px-4 pb-3">
                  <FileAttachmentList attachments={post.file_attachments} />
                </div>
              )}

              {/* Post content — swaps to an inline editor for the author */}
              {editingPost ? (
                <div className="px-4 pb-3 space-y-2">
                  <textarea
                    value={postDraft}
                    onChange={(e) => setPostDraft(e.target.value)}
                    rows={Math.min(8, Math.max(3, postDraft.split("\n").length + 1))}
                    autoFocus
                    className="w-full resize-none text-sm leading-relaxed bg-muted rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-ring text-foreground"
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      onClick={() => setEditingPost(false)}
                      className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
                    >
                      Cancel
                    </button>
                    <Button size="sm" onClick={savePostEdit} disabled={savingPostEdit || !postDraft.trim()}>
                      {savingPostEdit ? "Saving…" : "Save"}
                    </Button>
                  </div>
                </div>
              ) : (
                post.content && (
                  <p className="px-4 pb-3 text-sm leading-relaxed text-foreground">
                    <Linkify text={post.content} />
                  </p>
                )
              )}

              {/* Post actions */}
              <div className="flex items-center px-2 py-1 border-t border-border/60">
                <button
                  onClick={() => handleVote(post.id, "up")}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    postVoted === "up" ? "text-orange-500" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <ChevronUp className="w-4 h-4" />
                  {post.upvotes}
                </button>
                <button
                  onClick={() => handleVote(post.id, "down")}
                  className={cn(
                    "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                    postVoted === "down" ? "text-indigo-500" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <ChevronDown className="w-4 h-4" />
                  {post.downvotes}
                </button>
                <span className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground">
                  <MessageCircle className="w-4 h-4" />
                  {post.reply_count} {post.reply_count === 1 ? "comment" : "comments"}
                </span>
                <SharePanel postId={post.id} shareCount={post.share_count} />
                <BookmarkButton postId={post.id} initialBookmarked={post.is_bookmarked} />
                {isOwnPost && (
                  <div className="ml-auto flex items-center">
                    {post.content && (
                      <button
                        onClick={() => { setPostDraft(post.content); setEditingPost(true); }}
                        aria-label="Edit post"
                        className="flex items-center px-2.5 py-1.5 rounded-lg text-muted-foreground/40 hover:text-foreground hover:bg-muted transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleDelete(post.id)}
                      aria-label="Delete post"
                      className="flex items-center px-2.5 py-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/5 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Inline comment composer */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden mb-4">
          <form onSubmit={handleTopReply} className="px-4 py-3 space-y-3">
            <div className="relative">
              <textarea
                value={topContent}
                onChange={(e) => { setTopContent(e.target.value); setTopCaret(e.target.selectionStart); }}
                onKeyUp={(e) => setTopCaret(e.currentTarget.selectionStart)}
                onClick={(e) => setTopCaret(e.currentTarget.selectionStart)}
                placeholder="Add a comment… Tag people with @username"
                rows={3}
                className="w-full resize-none text-sm placeholder:text-muted-foreground border border-input rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
              <MentionSuggestions
                value={topContent}
                caret={topCaret}
                onPick={(v, c) => { setTopContent(v); setTopCaret(c); }}
              />
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <AttachBar
                key={topUploaderKey}
                onChange={(imageUrls, fileAttachments, uploading) => {
                  setTopImageUrls(imageUrls);
                  setTopFileAttachments(fileAttachments);
                  setTopUploading(uploading);
                }}
              />
              {topError && <p className="text-xs text-destructive">{topError}</p>}
              <Button
                type="submit"
                size="sm"
                className="ml-auto"
                disabled={topSubmitting || topUploading || (!topContent.trim() && !topImageUrls.length && !topFileAttachments.length)}
              >
                {topUploading ? "Uploading…" : topSubmitting ? "Posting…" : "Comment"}
              </Button>
            </div>
          </form>
        </div>

        {/* Comments list */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">
            {post.reply_count} {post.reply_count === 1 ? "comment" : "comments"}
          </h3>
          {tree.map((node) => (
            <CommentNode key={node.post.id} node={node} depth={0} />
          ))}
          {tree.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No comments yet. Be the first!
            </p>
          )}
        </div>
      </main>
    </Ctx.Provider>
  );
}
