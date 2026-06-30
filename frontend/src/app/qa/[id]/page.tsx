"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";
import {
  ChevronUp,
  ChevronDown,
  MessageCircle,
  Share2,
  Trash2,
  X,
  ArrowLeft,
  Lock,
  CornerDownRight,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { ImageUploader } from "@/components/ImageUploader";
import { ImageGrid } from "@/components/ImageGrid";
import { FileAttachmentList } from "@/components/FileAttachmentList";
import type { FileAttachment } from "@/components/FileUploader";
import UserSearchInput from "@/components/UserSearchInput";
import { timeAgo } from "@/lib/timeAgo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── types ─────────────────────────────────────────────────────────────────────

interface QAPost {
  id: string;
  content: string;
  faculty_tag: string | null;
  image_urls: string[];
  file_attachments: FileAttachment[];
  parent_post_id: string | null;
  upvotes: number;
  downvotes: number;
  current_user_vote: "up" | "down" | null;
  reply_count: number;
  created_at: string;
  is_deleted: boolean;
  is_own: boolean;
}

interface VoteResponse {
  upvotes: number;
  downvotes: number;
  current_user_vote: "up" | "down" | null;
}

interface TreeNode {
  post: QAPost;
  children: TreeNode[];
}

interface ThreadCtx {
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

function buildTree(posts: QAPost[], parentId: string): TreeNode[] {
  return posts
    .filter((p) => p.parent_post_id === parentId)
    .map((p) => ({ post: p, children: buildTree(posts, p.id) }));
}

const Ctx = createContext<ThreadCtx | null>(null);

// ── share panel ───────────────────────────────────────────────────────────────

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
        className="flex items-center gap-1 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <Share2 className="w-3.5 h-3.5" />
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

// ── recursive answer node ──────────────────────────────────────────────────────

function AnswerNode({ node, depth }: { node: TreeNode; depth: number }) {
  const ctx = useContext(Ctx)!;
  const p = node.post;
  const isReplying = ctx.replyingToId === p.id;
  const voted = p.current_user_vote;
  const indent = Math.min(depth, 4) * 14;
  const isCutOff = node.children.length === 0 && p.reply_count > 0;

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
            {/* Answer header */}
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs text-muted-foreground">
                <span className="font-medium text-foreground">Anonymous</span>
                {" · "}{timeAgo(p.created_at)}
              </span>
            </div>

            {/* Images */}
            <ImageGrid urls={p.image_urls ?? []} />
            {/* File attachments */}
            {(p.file_attachments ?? []).length > 0 && (
              <div className="mb-1.5">
                <FileAttachmentList attachments={p.file_attachments} />
              </div>
            )}

            {/* Content */}
            {p.content && (
              <p className="text-sm leading-relaxed whitespace-pre-wrap mb-1.5">{p.content}</p>
            )}

            {/* Actions */}
            <div className="flex items-center gap-0.5 -ml-1.5 mb-2">
              <button
                onClick={() => ctx.onVote(p.id, "up")}
                className={cn(
                  "flex items-center gap-0.5 px-1.5 py-1 rounded-md text-xs font-medium transition-colors",
                  voted === "up" ? "text-orange-500" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <ChevronUp className="w-3.5 h-3.5" />
                {p.upvotes}
              </button>
              <button
                onClick={() => ctx.onVote(p.id, "down")}
                className={cn(
                  "flex items-center gap-0.5 px-1.5 py-1 rounded-md text-xs font-medium transition-colors",
                  voted === "down" ? "text-indigo-500" : "text-muted-foreground hover:text-foreground hover:bg-muted"
                )}
              >
                <ChevronDown className="w-3.5 h-3.5" />
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
              <SharePanel postId={p.id} />
              {p.is_own && (
                <button
                  onClick={() => ctx.onDelete(p.id)}
                  className="ml-auto flex items-center px-1.5 py-1 rounded-md text-muted-foreground/40 hover:text-destructive hover:bg-destructive/5 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          </>
        )}

        {/* Inline reply */}
        {isReplying && (
          <div className="mb-3 space-y-2">
            <textarea
              value={ctx.inlineContent}
              onChange={(e) => ctx.onSetContent(e.target.value)}
              placeholder="Reply anonymously…"
              rows={2}
              autoFocus
              className="w-full resize-none text-sm px-3 py-2 border border-input rounded-xl bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <ImageUploader key={ctx.inlineUploaderKey} onUrlsChange={ctx.onSetUrls} />
            {ctx.inlineError && <p className="text-xs text-destructive">{ctx.inlineError}</p>}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={() => ctx.onSubmitInline(p.id)}
                disabled={ctx.inlineSubmitting || ctx.inlineImagesUploading || (!ctx.inlineContent.trim() && !ctx.inlineImageUrls.length)}
              >
                {ctx.inlineImagesUploading ? "Uploading…" : ctx.inlineSubmitting ? "Posting…" : "Reply"}
              </Button>
              <Button size="sm" variant="outline" onClick={ctx.onCancelInline}>Cancel</Button>
              <span className="flex items-center gap-1 text-xs text-muted-foreground ml-1">
                <Lock className="w-3 h-3" />
                anonymous
              </span>
            </div>
          </div>
        )}

        {/* Children */}
        {node.children.length > 0 && (
          <div className="mt-1">
            {node.children.map((child) => (
              <AnswerNode key={child.post.id} node={child} depth={depth + 1} />
            ))}
          </div>
        )}

        {/* Thread cut-off */}
        {isCutOff && (
          <a
            href={`/qa/${p.id}`}
            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline mt-1 mb-2 ml-1"
          >
            <CornerDownRight className="w-3 h-3" />
            Continue this thread
          </a>
        )}
      </div>
    </div>
  );
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function QADetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [question, setQuestion] = useState<QAPost | null>(null);
  const [allAnswers, setAllAnswers] = useState<QAPost[]>([]);
  const [loading, setLoading] = useState(true);

  const [topContent, setTopContent] = useState("");
  const [topImageUrls, setTopImageUrls] = useState<string[]>([]);
  const [topImagesUploading, setTopImagesUploading] = useState(false);
  const [topUploaderKey, setTopUploaderKey] = useState(0);
  const [topSubmitting, setTopSubmitting] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [inlineContent, setInlineContent] = useState("");
  const [inlineImageUrls, setInlineImageUrls] = useState<string[]>([]);
  const [inlineImagesUploading, setInlineImagesUploading] = useState(false);
  const [inlineUploaderKey, setInlineUploaderKey] = useState(0);
  const [inlineSubmitting, setInlineSubmitting] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ question: QAPost; answers: QAPost[] }>(`/api/qa/${id}`)
      .then((data) => { setQuestion(data.question); setAllAnswers(data.answers); })
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [id, router]);

  async function handleVote(targetId: string, voteType: "up" | "down") {
    try {
      const data = await apiFetch<VoteResponse>(`/api/qa/${targetId}/vote`, {
        method: "POST",
        body: JSON.stringify({ vote_type: voteType }),
      });
      setQuestion((prev) => (prev?.id === targetId ? { ...prev, ...data } : prev));
      setAllAnswers((prev) => prev.map((p) => (p.id === targetId ? { ...p, ...data } : p)));
    } catch { /* non-critical */ }
  }

  async function handleDelete(targetId: string) {
    if (!window.confirm("Delete this post? This cannot be undone.")) return;
    try {
      await apiFetch(`/api/qa/${targetId}`, { method: "DELETE" });
      setAllAnswers((prev) =>
        prev.map((p) => (p.id === targetId ? { ...p, is_deleted: true, content: "[deleted]" } : p))
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not delete.");
    }
  }

  async function handleTopAnswer(e: React.FormEvent) {
    e.preventDefault();
    if (!topContent.trim() && !topImageUrls.length) return;
    if (topImagesUploading) return;
    setTopSubmitting(true);
    setTopError(null);
    try {
      const newAnswer = await apiFetch<QAPost>(`/api/qa/${id}/answers`, {
        method: "POST",
        body: JSON.stringify({ content: topContent.trim(), image_urls: topImageUrls }),
      });
      setAllAnswers((prev) => [...prev, newAnswer]);
      setQuestion((prev) => (prev ? { ...prev, reply_count: prev.reply_count + 1 } : prev));
      setTopContent("");
      setTopImageUrls([]);
      setTopUploaderKey((k) => k + 1);
      setComposerOpen(false);
    } catch (err: unknown) {
      setTopError(err instanceof Error ? err.message : "Failed to post answer.");
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
      const newReply = await apiFetch<QAPost>(`/api/qa/${parentId}/answers`, {
        method: "POST",
        body: JSON.stringify({ content: inlineContent.trim(), image_urls: inlineImageUrls }),
      });
      setAllAnswers((prev) => [...prev, newReply]);
      setQuestion((prev) => (prev ? { ...prev, reply_count: prev.reply_count + 1 } : prev));
      setReplyingToId(null);
      setInlineContent("");
      setInlineImageUrls([]);
    } catch (err: unknown) {
      setInlineError(err instanceof Error ? err.message : "Failed to reply.");
    } finally {
      setInlineSubmitting(false);
    }
  }

  if (loading) return <p className="p-8 text-center text-muted-foreground text-sm">Loading…</p>;
  if (!question) return null;

  const tree = buildTree(allAnswers, question.id);
  const qVoted = question.current_user_vote;

  const ctxValue: ThreadCtx = {
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
      <main className="max-w-xl mx-auto px-4 pt-4 pb-36">
        {/* Back link */}
        <button
          onClick={() => router.back()}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {/* Question card */}
        <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden mb-4">
          <div className="flex items-center gap-2 px-4 pt-4 pb-3">
            <div className="flex-1 min-w-0">
              <span className="font-semibold text-sm text-foreground">Anonymous</span>
              <span className="text-muted-foreground text-xs"> · {timeAgo(question.created_at)}</span>
            </div>
            {question.faculty_tag && (
              <span className="text-[11px] font-semibold tracking-wide px-2 py-0.5 rounded-full bg-muted text-muted-foreground flex-shrink-0">
                {question.faculty_tag}
              </span>
            )}
          </div>

          {(question.image_urls ?? []).length > 0 && (
            <div className="px-4 pb-3">
              <ImageGrid urls={question.image_urls} />
            </div>
          )}

          {(question.file_attachments ?? []).length > 0 && (
            <div className="px-4 pb-3">
              <FileAttachmentList attachments={question.file_attachments} />
            </div>
          )}

          {question.content && (
            <p className="px-4 pb-3 text-base leading-relaxed whitespace-pre-wrap text-foreground font-medium">
              {question.content}
            </p>
          )}

          <div className="flex items-center px-2 py-1 border-t border-border/60">
            <button
              onClick={() => handleVote(question.id, "up")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                qVoted === "up" ? "text-orange-500" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <ChevronUp className="w-4 h-4" />
              {question.upvotes}
            </button>
            <button
              onClick={() => handleVote(question.id, "down")}
              className={cn(
                "flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors",
                qVoted === "down" ? "text-indigo-500" : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <ChevronDown className="w-4 h-4" />
              {question.downvotes}
            </button>
            <span className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-muted-foreground">
              <MessageCircle className="w-4 h-4" />
              {question.reply_count} {question.reply_count === 1 ? "answer" : "answers"}
            </span>
            <SharePanel postId={question.id} />
            {question.is_own && (
              <button
                onClick={() => handleDelete(question.id)}
                className="ml-auto flex items-center px-2.5 py-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/5 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Answers */}
        <div>
          <h3 className="text-sm font-semibold text-muted-foreground mb-3">
            {question.reply_count} {question.reply_count === 1 ? "answer" : "answers"}
          </h3>
          {tree.map((node) => (
            <AnswerNode key={node.post.id} node={node} depth={0} />
          ))}
          {tree.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-6">
              No answers yet. Be the first to answer!
            </p>
          )}
        </div>
      </main>

      {/* Fixed compose bar */}
      <div className="fixed bottom-16 left-0 right-0 px-4 py-2 bg-white/95 backdrop-blur-sm border-t border-border z-40">
        <div className="max-w-xl mx-auto">
          <button
            onClick={() => setComposerOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-full bg-muted hover:bg-muted/80 transition-colors text-sm text-muted-foreground"
          >
            <Lock className="w-4 h-4 flex-shrink-0" />
            Write an anonymous answer…
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
                <span className="font-semibold text-sm">Answer anonymously</span>
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
              <form onSubmit={handleTopAnswer} className="px-4 py-3 space-y-3">
                <textarea
                  autoFocus
                  value={topContent}
                  onChange={(e) => setTopContent(e.target.value)}
                  placeholder="Write an anonymous answer…"
                  rows={4}
                  className="w-full resize-none text-sm placeholder:text-muted-foreground border-0 outline-none focus:ring-0 bg-transparent min-h-[90px]"
                />
                <div className="border-t border-border pt-3 space-y-3">
                  <ImageUploader
                    key={topUploaderKey}
                    onUrlsChange={(urls, uploading) => { setTopImageUrls(urls); setTopImagesUploading(uploading); }}
                  />
                  {topError && <p className="text-xs text-destructive">{topError}</p>}
                  <div className="flex justify-end">
                    <Button
                      type="submit"
                      size="sm"
                      disabled={topSubmitting || topImagesUploading || (!topContent.trim() && !topImageUrls.length)}
                    >
                      {topImagesUploading ? "Uploading…" : topSubmitting ? "Posting…" : "Answer anonymously"}
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </Ctx.Provider>
  );
}
