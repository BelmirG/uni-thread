"use client";

import { createContext, useContext, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { ImageUploader } from "@/components/ImageUploader";
import { ImageGrid } from "@/components/ImageGrid";
import UserSearchInput from "@/components/UserSearchInput";
import { timeAgo } from "@/lib/timeAgo";

// ── types ─────────────────────────────────────────────────────────────────────

interface QAPost {
  id: string;
  content: string;
  faculty_tag: string | null;
  image_urls: string[];
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

// ── thread context ─────────────────────────────────────────────────────────────

const Ctx = createContext<ThreadCtx | null>(null);

// ── recursive answer node ──────────────────────────────────────────────────────

function AnswerNode({ node, depth }: { node: TreeNode; depth: number }) {
  const ctx = useContext(Ctx)!;
  const p = node.post;
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
            <div style={{ fontSize: "0.8rem", color: "#888", marginBottom: "0.25rem" }}>
              Anonymous · {timeAgo(p.created_at)}
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
              <SharePanel postId={p.id} />
              {p.is_own && (
                <button
                  onClick={() => ctx.onDelete(p.id)}
                  style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", padding: 0, color: "#ccc", fontSize: "0.82rem" }}
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
              placeholder="Reply anonymously…"
              rows={2}
              autoFocus
              style={{ width: "100%", boxSizing: "border-box", padding: "0.45rem 0.6rem", fontSize: "0.9rem", border: "1px solid #ccc", borderRadius: 4, fontFamily: "inherit", resize: "vertical" }}
            />
            <ImageUploader key={ctx.inlineUploaderKey} onUrlsChange={ctx.onSetUrls} />
            {ctx.inlineError && (
              <p style={{ color: "crimson", margin: "0.2rem 0", fontSize: "0.82rem" }}>{ctx.inlineError}</p>
            )}
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.35rem" }}>
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
              <span style={{ fontSize: "0.78rem", color: "#aaa" }}>🔒 anonymous</span>
            </div>
          </div>
        )}

        {node.children.length > 0 && (
          <div style={{ marginTop: "0.5rem" }}>
            {node.children.map((child) => (
              <AnswerNode key={child.post.id} node={child} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

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
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#888", fontSize: "0.82rem" }}
      >
        ↗ Share
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

// ── page ──────────────────────────────────────────────────────────────────────

export default function QADetailPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [question, setQuestion] = useState<QAPost | null>(null);
  const [allAnswers, setAllAnswers] = useState<QAPost[]>([]);
  const [loading, setLoading] = useState(true);

  // Top-level answer form
  const [topContent, setTopContent] = useState("");
  const [topImageUrls, setTopImageUrls] = useState<string[]>([]);
  const [topImagesUploading, setTopImagesUploading] = useState(false);
  const [topUploaderKey, setTopUploaderKey] = useState(0);
  const [topSubmitting, setTopSubmitting] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  // Inline reply form
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
      setAllAnswers((prev) => prev.map((p) => (p.id === targetId ? { ...p, is_deleted: true, content: "[deleted]" } : p)));
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

  if (loading) return <p style={{ padding: "2rem", color: "#888" }}>Loading…</p>;
  if (!question) return null;

  const tree = buildTree(allAnswers, question.id);

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
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem 1rem 5rem" }}>
        <Link href="/qa" style={{ fontSize: "0.9rem" }}>← Back to Q&amp;A</Link>

        {/* Question */}
        <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: "1rem", margin: "1rem 0 1.5rem", background: "#fff" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem", color: "#999", marginBottom: "0.5rem" }}>
            <span>Anonymous · {timeAgo(question.created_at)}</span>
            {question.faculty_tag && (
              <span style={{ fontSize: "0.72rem", fontWeight: "bold", padding: "0.15rem 0.5rem", borderRadius: 12, background: "#f0f0f0", color: "#444" }}>
                {question.faculty_tag}
              </span>
            )}
          </div>
          <ImageGrid urls={question.image_urls ?? []} />
          {question.content && (
            <p style={{ margin: "0 0 0.75rem", whiteSpace: "pre-wrap", lineHeight: 1.5, fontSize: "1.05rem" }}>{question.content}</p>
          )}
          <div style={{ display: "flex", gap: "1rem", fontSize: "0.9rem", alignItems: "center" }}>
            <button onClick={() => handleVote(question.id, "up")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: question.current_user_vote === "up" ? "#e05c00" : "#555", fontWeight: question.current_user_vote === "up" ? "bold" : "normal" }}>▲ {question.upvotes}</button>
            <button onClick={() => handleVote(question.id, "down")} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: question.current_user_vote === "down" ? "#5555dd" : "#555", fontWeight: question.current_user_vote === "down" ? "bold" : "normal" }}>▼ {question.downvotes}</button>
            <SharePanel postId={question.id} />
          </div>
        </div>

        {/* Answer count + thread */}
        <div style={{ borderTop: "1px solid #eee", paddingTop: "0.75rem" }}>
          <h3 style={{ color: "#444", marginTop: 0, marginBottom: "1rem" }}>
            {allAnswers.length} {allAnswers.length === 1 ? "answer" : "answers"}
          </h3>
          {tree.map((node) => (
            <AnswerNode key={node.post.id} node={node} depth={0} />
          ))}
        </div>
      </main>

      {/* Fixed compose bar */}
      <div style={{ position: "fixed", bottom: 60, left: 0, right: 0, background: "#fff", borderTop: "1px solid #e8e8e8", padding: "0.5rem 1rem", zIndex: 50 }}>
        <div
          onClick={() => setComposerOpen(true)}
          style={{ maxWidth: 640, margin: "0 auto", display: "flex", alignItems: "center", padding: "0.6rem 1rem", borderRadius: 20, background: "#f5f5f5", cursor: "text", color: "#aaa", fontSize: "0.95rem" }}
        >
          Write an anonymous answer…
        </div>
      </div>

      {composerOpen && (
        <>
          <div onClick={() => setComposerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 100 }} />
          <div style={{ position: "fixed", bottom: 60, left: "50%", transform: "translateX(-50%)", width: "min(600px, 94vw)", background: "#fff", borderRadius: 16, padding: "1rem 1rem 1.5rem", zIndex: 101, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 4px 32px rgba(0,0,0,0.18)" }}>
            <div style={{ maxWidth: 640, margin: "0 auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <span style={{ fontWeight: "600", fontSize: "1rem" }}>Answer anonymously</span>
                <button onClick={() => setComposerOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.5rem", color: "#999", lineHeight: 1, padding: "0 0.2rem" }}>×</button>
              </div>
              <form onSubmit={handleTopAnswer}>
                <textarea
                  autoFocus
                  value={topContent}
                  onChange={(e) => setTopContent(e.target.value)}
                  placeholder="Write an anonymous answer…"
                  rows={4}
                  style={{ width: "100%", boxSizing: "border-box", padding: "0.6rem", fontSize: "0.95rem", border: "1px solid #ccc", borderRadius: 4, fontFamily: "inherit", resize: "vertical" }}
                />
                <ImageUploader
                  key={topUploaderKey}
                  onUrlsChange={(urls, uploading) => { setTopImageUrls(urls); setTopImagesUploading(uploading); }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginTop: "0.5rem" }}>
                  <button
                    type="submit"
                    disabled={topSubmitting || topImagesUploading || (!topContent.trim() && !topImageUrls.length)}
                    style={{ padding: "0.5rem 1.2rem", cursor: "pointer" }}
                  >
                    {topImagesUploading ? "Uploading…" : topSubmitting ? "Posting…" : "Answer anonymously"}
                  </button>
                  <span style={{ fontSize: "0.82rem", color: "#999" }}>🔒 anonymous</span>
                </div>
                {topError && <p style={{ color: "crimson", margin: "0.4rem 0 0", fontSize: "0.9rem" }}>{topError}</p>}
              </form>
            </div>
          </div>
        </>
      )}
    </Ctx.Provider>
  );
}
