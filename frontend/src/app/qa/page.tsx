"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ChevronUp,
  ChevronDown,
  MessageCircle,
  Share2,
  Trash2,
  X,
  Lock,
  ShieldCheck,
  Search as SearchIcon,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { applyVote } from "@/lib/vote";
import BookmarkButton from "@/components/BookmarkButton";
import { InlineComposer } from "@/components/InlineComposer";
import { SearchOverlay } from "@/components/SearchOverlay";
import { SkeletonPostList } from "@/components/Skeleton";
import { ImageUploader } from "@/components/ImageUploader";
import { ImageGrid } from "@/components/ImageGrid";
import { FileUploader, FileAttachment } from "@/components/FileUploader";
import { FileAttachmentList } from "@/components/FileAttachmentList";
import { FACULTIES, FACULTY_NAMES, Faculty } from "@/lib/faculties";
import UserSearchInput from "@/components/UserSearchInput";
import { timeAgo } from "@/lib/timeAgo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getQACache, saveQACache } from "@/lib/qaCache";

interface QAPost {
  id: string;
  content: string;
  faculty_tag: string | null;
  image_urls: string[];
  file_attachments: FileAttachment[];
  upvotes: number;
  downvotes: number;
  current_user_vote: "up" | "down" | null;
  reply_count: number;
  created_at: string;
  is_own: boolean;
  is_bookmarked: boolean;
}

interface QAListResponse {
  posts: QAPost[];
  total: number;
}

interface VoteResponse {
  upvotes: number;
  downvotes: number;
  current_user_vote: "up" | "down" | null;
}

function SharePanel({ postId }: { postId: string }) {
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
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors"
      >
        <Share2 className="w-4 h-4" />
      </button>
      {open && typeof document !== "undefined" && createPortal(
        <>
          <div onClick={close} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200]" />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(360px,90vw)] bg-surface rounded-2xl shadow-2xl z-[201] p-5">
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

export default function QAPage() {
  const router = useRouter();
  // Returning from a question's answers restores the exact board state
  // (already-loaded posts, filter, scroll position) instead of re-fetching
  // from the top — see the mount effect below and lib/qaCache.ts.
  const [cachedOnMount] = useState(() => getQACache<QAPost>());
  const [posts, setPosts] = useState<QAPost[]>(() => cachedOnMount?.posts ?? []);
  const [total, setTotal] = useState(() => cachedOnMount?.total ?? 0);
  const [loading, setLoading] = useState(() => !cachedOnMount);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const LIMIT = 20;
  const [content, setContent] = useState("");
  const [facultyTag, setFacultyTag] = useState<Faculty | "">("");
  const [facultyFilter, setFacultyFilter] = useState<Faculty | null>(() => (cachedOnMount?.facultyFilter as Faculty | null) ?? null);
  // Guards the initial-load effect so a restored cache isn't immediately
  // overwritten by a fresh fetch on first mount.
  const skipNextLoadRef = useRef(!!cachedOnMount);
  const restoredScrollRef = useRef(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imagesUploading, setImagesUploading] = useState(false);
  const [uploaderKey, setUploaderKey] = useState(0);
  const [fileAttachments, setFileAttachments] = useState<FileAttachment[]>([]);
  const [filesUploading, setFilesUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  function buildParams(offset: number) {
    const params = new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
    if (facultyFilter) params.set("faculty", facultyFilter);
    return params;
  }

  useEffect(() => {
    // First run after restoring from cache: posts/total are already correct
    // and the session was valid moments ago — skip the re-fetch.
    if (skipNextLoadRef.current) {
      skipNextLoadRef.current = false;
      return;
    }
    setLoading(true);
    apiFetch<QAListResponse>(`/api/qa?${buildParams(0)}`)
      .then((data) => { setPosts(data.posts); setTotal(data.total); })
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [facultyFilter, router]); // eslint-disable-line react-hooks/exhaustive-deps

  // Restore scroll position after a cache-backed mount. Runs once; a second,
  // delayed pass corrects for late-loading images shifting page height.
  useEffect(() => {
    if (!cachedOnMount || restoredScrollRef.current) return;
    restoredScrollRef.current = true;
    const y = cachedOnMount.scrollY;
    window.scrollTo(0, y);
    const t = setTimeout(() => window.scrollTo(0, y), 120);
    return () => clearTimeout(t);
  }, [cachedOnMount]);

  // Keep a live snapshot so the unmount handler below can save the exact
  // state the user leaves with.
  const liveStateRef = useRef({ posts, total, facultyFilter });
  useEffect(() => {
    liveStateRef.current = { posts, total, facultyFilter };
  });

  // Snapshot scroll position on every click, in the capture phase — before
  // Next.js's own navigation handling resets window.scrollY for the incoming
  // route. See the identical comment in feed/page.tsx for why this can't be
  // a plain scroll listener or a read at unmount time.
  const lastScrollYRef = useRef(0);
  useEffect(() => {
    function onClickCapture() { lastScrollYRef.current = window.scrollY; }
    window.addEventListener("click", onClickCapture, true);
    return () => window.removeEventListener("click", onClickCapture, true);
  }, []);

  useEffect(() => {
    return () => {
      const s = liveStateRef.current;
      saveQACache({
        facultyFilter: s.facultyFilter,
        posts: s.posts,
        total: s.total,
        scrollY: lastScrollYRef.current,
      });
    };
  }, []);

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        setPosts((current) => {
          if (loadingMore || current.length >= total || loading) return current;
          setLoadingMore(true);
          apiFetch<QAListResponse>(`/api/qa?${buildParams(current.length)}`)
            .then((data) => { setPosts((prev) => [...prev, ...data.posts]); setTotal(data.total); })
            .catch(() => {})
            .finally(() => setLoadingMore(false));
          return current;
        });
      },
      { rootMargin: "200px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loading, loadingMore, total, facultyFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() && !imageUrls.length && !fileAttachments.length) return;
    if (imagesUploading || filesUploading) return;
    setSubmitting(true);
    setPostError(null);
    try {
      const newPost = await apiFetch<QAPost>("/api/qa", {
        method: "POST",
        body: JSON.stringify({ content: content.trim(), faculty_tag: facultyTag || null, image_urls: imageUrls, file_attachments: fileAttachments }),
      });
      setPosts((prev) => [newPost, ...prev]);
      setTotal((t) => t + 1);
      setContent("");
      setFacultyTag("");
      setImageUrls([]);
      setFileAttachments([]);
      setUploaderKey((k) => k + 1);
      setComposerOpen(false);
    } catch (err: unknown) {
      setPostError(err instanceof Error ? err.message : "Failed to post.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete(postId: string) {
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    try {
      await apiFetch(`/api/qa/${postId}`, { method: "DELETE" });
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      setTotal((t) => t - 1);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not delete post.");
    }
  }

  async function handleVote(postId: string, voteType: "up" | "down") {
    const before = posts.find((p) => p.id === postId);
    if (!before) return;
    // Instant local update; the server response (or a rollback) reconciles it.
    setPosts((prev) => prev.map((p) => (p.id === postId ? applyVote(p, voteType) : p)));
    try {
      const data = await apiFetch<VoteResponse>(`/api/qa/${postId}/vote`, {
        method: "POST",
        body: JSON.stringify({ vote_type: voteType }),
      });
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, ...data } : p)));
    } catch {
      const revert = { upvotes: before.upvotes, downvotes: before.downvotes, current_user_vote: before.current_user_vote };
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, ...revert } : p)));
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
        {/* Header */}
        <div className="mb-4">
          <div className="flex items-center justify-between mb-1">
            <h1 className="text-xl font-bold text-on-surface">Anonymous Q&amp;A</h1>
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Search"
              className="w-9 h-9 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors"
            >
              <SearchIcon className="w-5 h-5" />
            </button>
          </div>
          <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} mode="global" postType="anonymous_qa" />
          <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/15">
            <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-xs text-on-surface-variant leading-relaxed">
              All posts are fully anonymous. Your identity is never visible to other students — only administrators can see authorship for moderation.
            </p>
          </div>
        </div>

        {/* Faculty filter chips — horizontal scroll */}
        <div className="flex overflow-x-auto gap-2 mb-4 no-scrollbar pb-1 -mx-4 px-4">
          <button onClick={() => setFacultyFilter(null)} className={pillCls(facultyFilter === null)}>All</button>
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
          icon={<Lock className="w-4 h-4" />}
          placeholder="Ask a question anonymously…"
          className="mb-4"
        >
          <form onSubmit={handlePost} className="px-4 pt-3 pb-3 space-y-3">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Ask a question anonymously…"
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
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={facultyTag}
                  onChange={(e) => setFacultyTag(e.target.value as Faculty | "")}
                  className="text-xs border border-input rounded-md px-2.5 py-1.5 bg-background text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Tag faculty (optional)</option>
                  {FACULTIES.map((f) => (
                    <option key={f} value={f}>{f} — {FACULTY_NAMES[f]}</option>
                  ))}
                </select>
                {postError && <p className="text-xs text-destructive">{postError}</p>}
                <div className="ml-auto flex items-center gap-2">
                  <span className="flex items-center gap-1 text-xs text-on-surface-variant">
                    <Lock className="w-3 h-3" />
                    anonymous
                  </span>
                  <button type="button" onClick={() => setComposerOpen(false)} className="text-xs text-on-surface-variant hover:text-on-surface transition-colors px-2 py-1">Cancel</button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={submitting || imagesUploading || filesUploading || (!content.trim() && !imageUrls.length && !fileAttachments.length)}
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
            {facultyFilter ? `No questions tagged ${facultyFilter} yet.` : "No questions yet. Ask one!"}
          </p>
        )}

        <div className="space-y-3 stagger-children">
          {posts.map((post) => {
            const voted = post.current_user_vote;
            return (
              <div key={post.id} className="bg-surface rounded-2xl shadow-sm overflow-hidden">
                {/* Anonymous header */}
                <div className="flex items-center gap-2 px-4 pt-4 pb-3">
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-sm text-on-surface">Anonymous</span>
                    <span className="text-on-surface-variant text-xs"> · {timeAgo(post.created_at)}</span>
                  </div>
                  {post.faculty_tag && (
                    <span className="text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full bg-surface-container text-on-surface-variant flex-shrink-0">
                      {post.faculty_tag}
                    </span>
                  )}
                </div>

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

                {/* Content */}
                {post.content && (
                  <p className="px-4 pb-3 text-body-sm leading-relaxed whitespace-pre-wrap text-on-surface">
                    {post.content}
                  </p>
                )}

                {/* Action bar */}
                <div className="flex items-center gap-1 px-3 py-2 border-t border-surface-variant">
                  {/* Vote pill */}
                  <div className="flex items-center bg-surface-container-low rounded-full overflow-hidden">
                    <button
                      onClick={() => handleVote(post.id, "up")}
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
                      onClick={() => handleVote(post.id, "down")}
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
                    href={`/qa/${post.id}`}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors no-underline"
                  >
                    <MessageCircle className="w-4 h-4" />
                    {post.reply_count} {post.reply_count === 1 ? "answer" : "answers"}
                  </Link>

                  {/* Share */}
                  <SharePanel postId={post.id} />

                  {/* Save — written back into state so the back-navigation
                      cache (qaCache) restores the correct bookmark state. */}
                  <BookmarkButton
                    postId={post.id}
                    initialBookmarked={post.is_bookmarked}
                    onToggled={(b) =>
                      setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, is_bookmarked: b } : p)))
                    }
                  />

                  {/* Delete (own posts) */}
                  {post.is_own && (
                    <button
                      onClick={() => handleDelete(post.id)}
                      className="ml-auto flex items-center px-2 py-1.5 rounded-lg text-on-surface-variant/40 hover:text-error hover:bg-error-container/30 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        <div ref={sentinelRef} className="h-4" />
        {loadingMore && (
          <p className="text-on-surface-variant text-xs text-center py-4">Loading more…</p>
        )}
        {!loadingMore && posts.length > 0 && posts.length >= total && (
          <p className="text-on-surface-variant text-xs text-center py-4">You&apos;re all caught up.</p>
        )}
      </main>

    </>
  );
}
