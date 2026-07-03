"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronUp,
  ChevronDown,
  MessageCircle,
  Share2,
  Trash2,
  X,
  PenLine,
  Search as SearchIcon,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { InlineComposer } from "@/components/InlineComposer";
import { SearchOverlay } from "@/components/SearchOverlay";
import { SkeletonPostList } from "@/components/Skeleton";
import UserSearchInput from "@/components/UserSearchInput";
import { ImageUploader } from "@/components/ImageUploader";
import { ImageGrid } from "@/components/ImageGrid";
import { FileUploader, FileAttachment } from "@/components/FileUploader";
import { FileAttachmentList } from "@/components/FileAttachmentList";
import MiniAvatar from "@/components/MiniAvatar";
import PollComposer, { PollDraft } from "@/components/PollComposer";
import PollDisplay from "@/components/PollDisplay";
import { FACULTIES, FACULTY_NAMES, Faculty } from "@/lib/faculties";
import { timeAgo } from "@/lib/timeAgo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  file_attachments: FileAttachment[];
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

// ── Main page ─────────────────────────────────────────────────────────────────

export default function FeedPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedTab, setFeedTab] = useState<FeedTab>("discover");
  const [feedRefreshKey] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort, setSort] = useState<"hot" | "new">("hot");
  const [facultyFilter, setFacultyFilter] = useState<Faculty | null>(null);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const [content, setContent] = useState("");
  const [postFacultyTag, setPostFacultyTag] = useState<Faculty | "">("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imagesUploading, setImagesUploading] = useState(false);
  const [uploaderKey, setUploaderKey] = useState(0);
  const [fileAttachments, setFileAttachments] = useState<FileAttachment[]>([]);
  const [filesUploading, setFilesUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [pollDraft, setPollDraft] = useState<PollDraft | null>(null);

  const LIMIT = 20;

  function buildParams(offset: number) {
    const params = new URLSearchParams({ feed: feedTab, limit: String(LIMIT), offset: String(offset) });
    if (feedTab === "discover") params.set("sort", sort);
    if (facultyFilter) params.set("faculty", facultyFilter);
    return params;
  }

  // Initial load / filter change — reset everything
  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch<PostListResponse>(`/api/posts?${buildParams(0)}`),
      apiFetch<{ username: string }>("/api/auth/me"),
    ])
      .then(([postsData, me]) => {
        setPosts(postsData.posts);
        setTotal(postsData.total);
        setCurrentUsername(me.username);
      })
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [feedTab, sort, facultyFilter, feedRefreshKey, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // Infinite scroll — watch the sentinel div
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        setPosts((current) => {
          if (loadingMore || current.length >= total || loading) return current;
          setLoadingMore(true);
          apiFetch<PostListResponse>(`/api/posts?${buildParams(current.length)}`)
            .then((data) => {
              setPosts((prev) => [...prev, ...data.posts]);
              setTotal(data.total);
            })
            .catch(() => {})
            .finally(() => setLoadingMore(false));
          return current;
        });
      },
      { rootMargin: "200px" }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, loadingMore, total, feedTab, sort, facultyFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  function closeComposer() {
    setComposerOpen(false);
    setPollDraft(null);
    setFileAttachments([]);
    setFilesUploading(false);
  }

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() && !imageUrls.length && !pollDraft && !fileAttachments.length) return;
    if (imagesUploading || filesUploading) return;
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
          file_attachments: fileAttachments,
          poll_options: pollDraft ? pollDraft.options.map((o) => o.trim()).filter(Boolean) : [],
          poll_expires_at: pollDraft?.expiresAt ? new Date(pollDraft.expiresAt).toISOString() : null,
        }),
      });
      if (feedTab === "discover") setPosts((prev) => [newPost, ...prev]);
      setTotal((t) => t + 1);
      setContent("");
      setPostFacultyTag("");
      setImageUrls([]);
      setFileAttachments([]);
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
        prev.map((p) =>
          p.id === postId
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

  const pillCls = (active: boolean) =>
    cn(
      "text-xs font-medium px-3.5 py-1.5 rounded-full transition-colors whitespace-nowrap",
      active
        ? "bg-primary text-primary-foreground"
        : "bg-surface shadow-sm text-on-surface-variant hover:bg-surface-container"
    );

  return (
    <>
      <main className="max-w-xl mx-auto px-4 pt-4 pb-8">
        {/* Brand header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold tracking-tight text-on-surface">UniConnect</h1>
          <button
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <SearchIcon className="w-5 h-5" />
          </button>
        </div>
        <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} mode="global" postType="feed" />

        {/* Tabs — iOS-style segmented control */}
        <div className="flex gap-1 p-1 bg-surface-container rounded-full mb-4">
          {(["discover", "friends"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFeedTab(tab)}
              className={cn(
                "flex-1 py-2 text-sm font-semibold rounded-full transition-all",
                feedTab === tab
                  ? "bg-surface text-on-surface shadow-sm"
                  : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              {tab === "discover" ? "Discover" : "Friends"}
            </button>
          ))}
        </div>

        {/* Sort + faculty filter chips — horizontal scroll */}
        <div className="flex overflow-x-auto gap-2 mb-4 no-scrollbar pb-1 -mx-4 px-4">
          {feedTab === "discover" && (
            <>
              <button onClick={() => setSort("hot")} className={pillCls(sort === "hot")}>Hot</button>
              <button onClick={() => setSort("new")} className={pillCls(sort === "new")}>New</button>
              <span className="w-px h-6 self-center bg-outline-variant flex-shrink-0" />
            </>
          )}
          <button onClick={() => setFacultyFilter(null)} className={pillCls(facultyFilter === null)}>
            All
          </button>
          {FACULTIES.map((f) => (
            <button
              key={f}
              onClick={() => setFacultyFilter(facultyFilter === f ? null : f)}
              className={pillCls(facultyFilter === f)}
            >
              {f}
            </button>
          ))}
        </div>

        {/* Inline expanding composer */}
        <InlineComposer
          open={composerOpen}
          onOpen={() => setComposerOpen(true)}
          icon={<PenLine className="w-4 h-4" />}
          placeholder="What's on your mind?"
          className="mb-4"
        >
          <form onSubmit={handlePost} className="px-4 pt-3 pb-3 space-y-3">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="What's on your mind?"
              rows={4}
              className="w-full resize-none text-sm bg-transparent focus:outline-none text-on-surface placeholder:text-on-surface-variant/60"
            />
            <div className="border-t border-outline-variant/40 pt-2 space-y-3">
              <ImageUploader
                key={uploaderKey}
                onUrlsChange={(urls, uploading) => { setImageUrls(urls); setImagesUploading(uploading); }}
              />
              <FileUploader
                key={uploaderKey + 1000}
                onChange={(attachments, uploading) => { setFileAttachments(attachments); setFilesUploading(uploading); }}
              />
              <PollComposer value={pollDraft} onChange={setPollDraft} />
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={postFacultyTag}
                  onChange={(e) => setPostFacultyTag(e.target.value as Faculty | "")}
                  className="text-xs border border-input rounded-md px-2.5 py-1.5 bg-background text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Tag faculty (optional)</option>
                  {FACULTIES.map((f) => (
                    <option key={f} value={f}>{f} — {FACULTY_NAMES[f]}</option>
                  ))}
                </select>
                {postError && <p className="text-xs text-destructive">{postError}</p>}
                <div className="ml-auto flex items-center gap-2">
                  <button type="button" onClick={closeComposer} className="text-xs text-on-surface-variant hover:text-on-surface transition-colors px-2 py-1">Cancel</button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={submitting || imagesUploading || filesUploading || (!content.trim() && !imageUrls.length && !pollDraft && !fileAttachments.length)}
                  >
                    {imagesUploading || filesUploading ? "Uploading…" : submitting ? "Posting…" : "Post"}
                  </Button>
                </div>
              </div>
            </div>
          </form>
        </InlineComposer>

        {/* Post list */}
        {loading && <SkeletonPostList />}
        {!loading && posts.length === 0 && (
          <p className="text-on-surface-variant text-sm text-center py-8">
            {feedTab === "friends"
              ? "No posts from people you follow yet. Follow someone above to see their posts here."
              : facultyFilter
                ? `No posts tagged ${facultyFilter} yet.`
                : "No posts yet. Be the first!"}
          </p>
        )}

        <div className="space-y-3 mt-1 stagger-children">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUsername={currentUsername}
              onVote={handleVote}
              onDelete={handleDelete}
              onPollUpdate={(id, poll) =>
                setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, poll } : p)))
              }
            />
          ))}
        </div>

        {/* Sentinel — IntersectionObserver triggers next page load when this comes into view */}
        <div ref={sentinelRef} className="h-4" />
        {loadingMore && (
          <p className="text-muted-foreground text-xs text-center py-4">Loading more…</p>
        )}
        {!loadingMore && posts.length > 0 && posts.length >= total && (
          <p className="text-muted-foreground text-xs text-center py-4">You&apos;re all caught up.</p>
        )}
      </main>


    </>
  );
}

// ── Share panel ───────────────────────────────────────────────────────────────

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
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors"
      >
        <Share2 className="w-4 h-4" />
        {shareCount > 0 && <span>{shareCount}</span>}
      </button>

      {open && (
        <>
          <div onClick={close} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200]" />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(360px,90vw)] bg-white rounded-2xl shadow-2xl z-[201] p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold text-sm">Share via message</span>
              <button
                onClick={close}
                className="rounded-full p-1 hover:bg-muted text-muted-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleShare} className="space-y-3">
              <UserSearchInput
                value={username}
                onChange={setUsername}
                onSelect={(u) => setUsername(u)}
                placeholder="Search by name or username"
              />
              <input
                value={msg}
                onChange={(e) => setMsg(e.target.value)}
                placeholder="Add a message (optional)"
                className="w-full h-9 px-3 text-sm border border-input rounded-md bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {error && <p className="text-xs text-destructive">{error}</p>}
              {status === "sent" && <p className="text-xs text-green-600 font-medium">Sent!</p>}
              <div className="flex gap-2">
                <Button
                  type="submit"
                  disabled={status === "sending" || status === "sent" || !username.trim()}
                  className="flex-1"
                >
                  {status === "sending" ? "Sending…" : "Send"}
                </Button>
                <Button type="button" variant="outline" onClick={close}>Cancel</Button>
              </div>
            </form>
          </div>
        </>
      )}
    </>
  );
}

// ── Post card ─────────────────────────────────────────────────────────────────

function PostCard({
  post,
  currentUsername,
  onVote,
  onDelete,
  onPollUpdate,
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
    <div className="bg-surface rounded-2xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-3">
        <Link href={`/profile/${post.author?.username}`} className="flex-shrink-0">
          <MiniAvatar
            name={post.author?.display_name ?? "?"}
            url={post.author?.avatar_url ?? null}
            size={40}
          />
        </Link>
        <div className="flex-1 min-w-0">
          <Link href={`/profile/${post.author?.username}`} className="no-underline">
            <span className="font-semibold text-sm text-on-surface leading-tight">
              {post.author?.display_name ?? "Unknown"}
            </span>
          </Link>
          <p className="text-[11px] text-on-surface-variant mt-0.5">
            {timeAgo(post.created_at)}
            {post.faculty_tag && (
              <span> · {post.faculty_tag}</span>
            )}
          </p>
        </div>
      </div>

      {/* Content */}
      {post.content && (
        <p className="px-4 pb-3 text-body-sm leading-relaxed whitespace-pre-wrap text-on-surface">
          {post.content}
        </p>
      )}

      {/* Images */}
      {(post.image_urls ?? []).length > 0 && (
        <div className="px-4 pb-3">
          <ImageGrid urls={post.image_urls} />
        </div>
      )}

      {/* File attachments */}
      {(post.file_attachments ?? []).length > 0 && (
        <div className="px-4 pb-3">
          <FileAttachmentList attachments={post.file_attachments} />
        </div>
      )}

      {/* Poll */}
      {post.poll && (
        <div className="px-4 pb-3">
          <PollDisplay
            postId={post.id}
            poll={post.poll}
            onUpdate={(p) => onPollUpdate(post.id, p)}
          />
        </div>
      )}

      {/* Action bar */}
      <div className="flex items-center gap-1 px-3 py-2 border-t border-surface-variant">
        {/* Vote pill */}
        <div className="flex items-center bg-surface-container-low rounded-full overflow-hidden">
          <button
            onClick={() => onVote(post.id, "up")}
            className={cn(
              "flex items-center gap-1 px-2 py-1.5 text-xs font-semibold transition-colors",
              voted === "up" ? "text-blue-500" : "text-on-surface-variant hover:text-blue-500"
            )}
          >
            <ChevronUp className={cn("w-3.5 h-3.5", voted === "up" && "vote-pop")} />
            <span className="tabular-nums">{post.upvotes}</span>
          </button>
          <span className="w-px h-4 bg-outline-variant flex-shrink-0" />
          <button
            onClick={() => onVote(post.id, "down")}
            className={cn(
              "flex items-center gap-1 px-2 py-1.5 text-xs font-semibold transition-colors",
              voted === "down" ? "text-yellow-500" : "text-on-surface-variant hover:text-yellow-500"
            )}
          >
            <ChevronDown className={cn("w-3.5 h-3.5", voted === "down" && "vote-pop")} />
            <span className="tabular-nums">{post.downvotes}</span>
          </button>
        </div>

        {/* Replies */}
        <Link
          href={`/feed/${post.id}`}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors no-underline"
        >
          <MessageCircle className="w-4 h-4" />
          {post.reply_count}
        </Link>

        {/* Share */}
        <SharePanel postId={post.id} shareCount={post.share_count} />

        {/* Delete (own posts) */}
        {isOwn && (
          <button
            onClick={() => onDelete(post.id)}
            className="ml-auto flex items-center px-2 py-1.5 rounded-lg text-on-surface-variant/40 hover:text-error hover:bg-error-container/30 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
