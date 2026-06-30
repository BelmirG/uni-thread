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
} from "lucide-react";
import { apiFetch } from "@/lib/api";
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

interface SearchUser {
  username: string;
  display_name: string;
  avatar_url: string | null;
  faculty: string | null;
  program: string | null;
  is_following: boolean;
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
    <div className="mb-5">
      <p className="text-xs font-medium text-muted-foreground mb-2">Find people to follow</p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onBlur={() => setTimeout(() => { setQuery(""); setResults([]); }, 150)}
        placeholder="Search by name or username…"
        className="w-full h-10 px-3 text-sm rounded-xl border border-input bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
      />
      {results.length > 0 && (
        <div onMouseDown={(e) => e.preventDefault()} className="mt-1.5 space-y-1.5">
          {results.map((u) => (
            <div key={u.username} className="flex items-center gap-3 p-3 rounded-xl border border-border bg-white">
              <MiniAvatar name={u.display_name} url={u.avatar_url} size={38} />
              <Link href={`/profile/${u.username}`} className="flex-1 min-w-0 no-underline text-foreground">
                <div className="font-medium text-sm truncate">{u.display_name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  @{u.username}
                  {u.faculty && (
                    <span className="ml-1">
                      · {u.faculty}{u.program ? ` · ${u.program}` : ""}
                    </span>
                  )}
                </div>
              </Link>
              <button
                onClick={() => handleFollow(u.username)}
                disabled={loadingFollow === u.username}
                className={cn(
                  "flex-shrink-0 text-xs px-3 py-1.5 rounded-md font-medium transition-colors disabled:opacity-50",
                  following[u.username]
                    ? "border border-border bg-background text-foreground hover:bg-muted"
                    : "bg-primary text-primary-foreground hover:bg-primary/90"
                )}
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
  const [loadingMore, setLoadingMore] = useState(false);
  const [feedTab, setFeedTab] = useState<FeedTab>("discover");
  const [feedRefreshKey, setFeedRefreshKey] = useState(0);
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
      "text-xs font-medium px-3 py-1 rounded-full border transition-colors",
      active
        ? "bg-primary text-primary-foreground border-primary"
        : "border-border text-muted-foreground hover:border-foreground hover:text-foreground bg-background"
    );

  return (
    <>
      <main className="max-w-xl mx-auto px-4 pt-4 pb-36">
        {/* Tabs */}
        <div className="flex border-b border-border mb-4">
          {(["discover", "friends"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setFeedTab(tab)}
              className={cn(
                "flex-1 py-3 text-sm font-medium transition-colors",
                feedTab === tab
                  ? "text-primary border-b-2 border-primary -mb-px"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {tab === "discover" ? "Discover" : "Friends"}
            </button>
          ))}
        </div>

        {/* Sort pills — Discover only */}
        {feedTab === "discover" && (
          <div className="flex gap-2 mb-3">
            <button onClick={() => setSort("hot")} className={pillCls(sort === "hot")}>
              Hot
            </button>
            <button onClick={() => setSort("new")} className={pillCls(sort === "new")}>
              New
            </button>
          </div>
        )}

        {/* Faculty filter pills */}
        <div className="flex gap-1.5 mb-4 flex-wrap">
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

        {/* People search — Friends tab */}
        {feedTab === "friends" && (
          <PeopleSearch onFollowChange={() => setFeedRefreshKey((k) => k + 1)} />
        )}

        {/* Post list */}
        {loading && (
          <p className="text-muted-foreground text-sm text-center py-8">Loading…</p>
        )}
        {!loading && posts.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-8">
            {feedTab === "friends"
              ? "No posts from people you follow yet. Follow someone above to see their posts here."
              : facultyFilter
                ? `No posts tagged ${facultyFilter} yet.`
                : "No posts yet. Be the first!"}
          </p>
        )}

        <div className="space-y-3">
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

      {/* Fixed compose bar */}
      <div className="fixed bottom-16 left-0 right-0 px-4 py-2 bg-white/95 backdrop-blur-sm border-t border-border z-40">
        <div className="max-w-xl mx-auto">
          <button
            onClick={() => setComposerOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-full bg-muted hover:bg-muted/80 transition-colors text-sm text-muted-foreground"
          >
            <PenLine className="w-4 h-4 flex-shrink-0" />
            What&apos;s on your mind?
          </button>
        </div>
      </div>

      {/* Compose sheet */}
      {composerOpen && (
        <>
          <div
            onClick={closeComposer}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
          />
          <div className="fixed bottom-[4.5rem] left-1/2 -translate-x-1/2 w-[min(600px,94vw)] bg-white rounded-2xl z-[101] shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
              <span className="font-semibold text-sm">Create post</span>
              <button
                onClick={closeComposer}
                className="rounded-full p-1 hover:bg-muted text-muted-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              <form onSubmit={handlePost} className="px-4 py-3 space-y-3">
                <textarea
                  autoFocus
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="What's on your mind?"
                  rows={4}
                  className="w-full resize-none text-sm placeholder:text-muted-foreground border-0 outline-none focus:ring-0 bg-transparent min-h-[90px]"
                />
                <div className="border-t border-border pt-3 space-y-3">
                  <ImageUploader
                    key={uploaderKey}
                    onUrlsChange={(urls, uploading) => {
                      setImageUrls(urls);
                      setImagesUploading(uploading);
                    }}
                  />
                  <FileUploader
                    key={uploaderKey + 1000}
                    onChange={(attachments, uploading) => {
                      setFileAttachments(attachments);
                      setFilesUploading(uploading);
                    }}
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
                        <option key={f} value={f}>
                          {f} — {FACULTY_NAMES[f]}
                        </option>
                      ))}
                    </select>
                    {postError && <p className="text-xs text-destructive">{postError}</p>}
                    <Button
                      type="submit"
                      size="sm"
                      className="ml-auto"
                      disabled={
                        submitting ||
                        imagesUploading ||
                        filesUploading ||
                        (!content.trim() && !imageUrls.length && !pollDraft && !fileAttachments.length)
                      }
                    >
                      {imagesUploading || filesUploading ? "Uploading…" : submitting ? "Posting…" : "Post"}
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
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
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
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
    <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-4 pb-3">
        <Link href={`/profile/${post.author?.username}`} className="flex-shrink-0">
          <MiniAvatar
            name={post.author?.display_name ?? "?"}
            url={post.author?.avatar_url ?? null}
            size={40}
          />
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
        </div>
        {post.faculty_tag && (
          <span className="text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
            {post.faculty_tag}
          </span>
        )}
      </div>

      {/* Content */}
      {post.content && (
        <p className="px-4 pb-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
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
      <div className="flex items-center px-2 py-1 border-t border-border/60">
        <button
          onClick={() => onVote(post.id, "up")}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
            voted === "up"
              ? "text-orange-500"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          <ChevronUp className="w-4 h-4" />
          {post.upvotes}
        </button>
        <button
          onClick={() => onVote(post.id, "down")}
          className={cn(
            "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
            voted === "down"
              ? "text-indigo-500"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          <ChevronDown className="w-4 h-4" />
          {post.downvotes}
        </button>
        <Link
          href={`/feed/${post.id}`}
          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors no-underline"
        >
          <MessageCircle className="w-4 h-4" />
          {post.reply_count}
        </Link>
        <SharePanel postId={post.id} shareCount={post.share_count} />
        {isOwn && (
          <button
            onClick={() => onDelete(post.id)}
            className="ml-auto flex items-center px-2.5 py-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/5 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}
