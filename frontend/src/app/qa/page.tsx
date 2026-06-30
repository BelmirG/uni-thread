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
  Lock,
  ShieldCheck,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { ImageUploader } from "@/components/ImageUploader";
import { ImageGrid } from "@/components/ImageGrid";
import { FileUploader, FileAttachment } from "@/components/FileUploader";
import { FileAttachmentList } from "@/components/FileAttachmentList";
import { FACULTIES, FACULTY_NAMES, Faculty } from "@/lib/faculties";
import UserSearchInput from "@/components/UserSearchInput";
import { timeAgo } from "@/lib/timeAgo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
        className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <Share2 className="w-4 h-4" />
      </button>
      {open && (
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
        </>
      )}
    </>
  );
}

export default function QAPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<QAPost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const LIMIT = 20;
  const [content, setContent] = useState("");
  const [facultyTag, setFacultyTag] = useState<Faculty | "">("");
  const [facultyFilter, setFacultyFilter] = useState<Faculty | null>(null);
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
    setLoading(true);
    apiFetch<QAListResponse>(`/api/qa?${buildParams(0)}`)
      .then((data) => { setPosts(data.posts); setTotal(data.total); })
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [facultyFilter, router]); // eslint-disable-line react-hooks/exhaustive-deps

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
    try {
      const data = await apiFetch<VoteResponse>(`/api/qa/${postId}/vote`, {
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
        {/* Header */}
        <div className="mb-4">
          <h1 className="text-xl font-bold text-foreground mb-1">Anonymous Q&amp;A</h1>
          <div className="flex items-start gap-2 p-3 rounded-xl bg-primary/5 border border-primary/15">
            <ShieldCheck className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              All posts are fully anonymous. Your identity is never visible to other students — only administrators can see authorship for moderation.
            </p>
          </div>
        </div>

        {/* Faculty filter pills */}
        <div className="flex gap-1.5 mb-4 flex-wrap">
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

        {/* List */}
        {loading && <p className="text-muted-foreground text-sm text-center py-8">Loading…</p>}
        {!loading && posts.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-8">
            {facultyFilter ? `No questions tagged ${facultyFilter} yet.` : "No questions yet. Ask one!"}
          </p>
        )}

        <div className="space-y-3">
          {posts.map((post) => {
            const voted = post.current_user_vote;
            return (
              <div key={post.id} className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
                {/* Anonymous header */}
                <div className="flex items-center gap-2 px-4 pt-4 pb-3">
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-sm text-foreground">Anonymous</span>
                    <span className="text-muted-foreground text-xs"> · {timeAgo(post.created_at)}</span>
                  </div>
                  {post.faculty_tag && (
                    <span className="text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
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
                  <p className="px-4 pb-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                    {post.content}
                  </p>
                )}

                {/* Action bar */}
                <div className="flex items-center px-2 py-1 border-t border-border/60">
                  <button
                    onClick={() => handleVote(post.id, "up")}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      voted === "up" ? "text-orange-500" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    <ChevronUp className="w-4 h-4" />
                    {post.upvotes}
                  </button>
                  <button
                    onClick={() => handleVote(post.id, "down")}
                    className={cn(
                      "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      voted === "down" ? "text-indigo-500" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                    )}
                  >
                    <ChevronDown className="w-4 h-4" />
                    {post.downvotes}
                  </button>
                  <Link
                    href={`/qa/${post.id}`}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors no-underline"
                  >
                    <MessageCircle className="w-4 h-4" />
                    {post.reply_count} {post.reply_count === 1 ? "answer" : "answers"}
                  </Link>
                  <SharePanel postId={post.id} />
                  {post.is_own && (
                    <button
                      onClick={() => handleDelete(post.id)}
                      className="ml-auto flex items-center px-2.5 py-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/5 transition-colors"
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
            <Lock className="w-4 h-4 flex-shrink-0" />
            Ask a question anonymously…
          </button>
        </div>
      </div>

      {/* Compose sheet */}
      {composerOpen && (
        <>
          <div onClick={() => setComposerOpen(false)} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]" />
          <div className="fixed bottom-[4.5rem] left-1/2 -translate-x-1/2 w-[min(600px,94vw)] bg-white rounded-2xl z-[101] shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">Ask anonymously</span>
                <span className="flex items-center gap-1 text-xs text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  <Lock className="w-2.5 h-2.5" />
                  anonymous
                </span>
              </div>
              <button
                onClick={() => setComposerOpen(false)}
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
                  placeholder="Ask a question anonymously…"
                  rows={4}
                  className="w-full resize-none text-sm placeholder:text-muted-foreground border-0 outline-none focus:ring-0 bg-transparent min-h-[90px]"
                />
                <div className="border-t border-border pt-3 space-y-3">
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
                    <Button
                      type="submit"
                      size="sm"
                      className="ml-auto"
                      disabled={submitting || imagesUploading || filesUploading || (!content.trim() && !imageUrls.length && !fileAttachments.length)}
                    >
                      {imagesUploading || filesUploading ? "Uploading…" : submitting ? "Posting…" : "Post anonymously"}
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
