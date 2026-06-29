"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { ImageUploader } from "@/components/ImageUploader";
import { ImageGrid } from "@/components/ImageGrid";
import { FACULTIES, FACULTY_NAMES, Faculty } from "@/lib/faculties";
import UserSearchInput from "@/components/UserSearchInput";

interface QAPost {
  id: string;
  content: string;
  faculty_tag: string | null;
  image_urls: string[];
  upvotes: number;
  downvotes: number;
  current_user_vote: "up" | "down" | null;
  reply_count: number;
  created_at: string;
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

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function FacultyBadge({ tag }: { tag: string }) {
  return (
    <span style={{
      fontSize: "0.72rem", fontWeight: "bold", letterSpacing: "0.03em",
      padding: "0.15rem 0.5rem", borderRadius: 12,
      background: "#f0f0f0", color: "#444",
    }}>
      {tag}
    </span>
  );
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
        style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#555", fontSize: "0.9rem" }}
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

export default function QAPage() {
  const router = useRouter();
  const [posts, setPosts] = useState<QAPost[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [facultyTag, setFacultyTag] = useState<Faculty | "">("");
  const [facultyFilter, setFacultyFilter] = useState<Faculty | null>(null);
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imagesUploading, setImagesUploading] = useState(false);
  const [uploaderKey, setUploaderKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    const param = facultyFilter ? `?faculty=${facultyFilter}` : "";
    apiFetch<QAListResponse>(`/api/qa${param}`)
      .then((data) => { setPosts(data.posts); setTotal(data.total); })
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [facultyFilter, router]);

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() && !imageUrls.length) return;
    if (imagesUploading) return;
    setSubmitting(true);
    setPostError(null);
    try {
      const newPost = await apiFetch<QAPost>("/api/qa", {
        method: "POST",
        body: JSON.stringify({
          content: content.trim(),
          faculty_tag: facultyTag || null,
          image_urls: imageUrls,
        }),
      });
      setPosts((prev) => [newPost, ...prev]);
      setTotal((t) => t + 1);
      setContent("");
      setFacultyTag("");
      setImageUrls([]);
      setUploaderKey((k) => k + 1);
      setComposerOpen(false);
    } catch (err: unknown) {
      setPostError(err instanceof Error ? err.message : "Failed to post.");
    } finally {
      setSubmitting(false);
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

  const textareaStyle: React.CSSProperties = {
    width: "100%",
    boxSizing: "border-box",
    padding: "0.6rem",
    fontSize: "0.95rem",
    border: "1px solid #ccc",
    borderRadius: 4,
    fontFamily: "inherit",
    resize: "vertical",
  };

  return (
    <>
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem 1rem 5rem" }}>
      <h1 style={{ margin: "0 0 0.5rem" }}>Anonymous Q&amp;A</h1>

      <p style={{ color: "#666", fontSize: "0.9rem", marginTop: 0, marginBottom: "1.5rem" }}>
        Questions and answers are completely anonymous. Your identity is never
        visible to other students. Administrators can see authorship only for
        moderation purposes.
      </p>

      {/* Faculty filter pills */}
      <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1.25rem", flexWrap: "wrap" }}>
        <button
          onClick={() => setFacultyFilter(null)}
          style={{
            padding: "0.25rem 0.75rem", fontSize: "0.8rem", cursor: "pointer",
            borderRadius: 20, border: "1px solid #ccc",
            background: facultyFilter === null ? "#111" : "#fff",
            color: facultyFilter === null ? "#fff" : "#555",
          }}
        >
          All
        </button>
        {FACULTIES.map((f) => (
          <button
            key={f}
            onClick={() => setFacultyFilter(facultyFilter === f ? null : f)}
            style={{
              padding: "0.25rem 0.75rem", fontSize: "0.8rem", cursor: "pointer",
              borderRadius: 20, border: "1px solid #ccc",
              background: facultyFilter === f ? "#111" : "#fff",
              color: facultyFilter === f ? "#fff" : "#555",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {/* List */}
      {loading && <p style={{ color: "#888" }}>Loading…</p>}
      {!loading && posts.length === 0 && (
        <p style={{ color: "#888" }}>
          {facultyFilter ? `No questions tagged ${facultyFilter} yet.` : "No questions yet. Ask one!"}
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {posts.map((post) => (
          <div
            key={post.id}
            style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: "1rem", background: "#fff" }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.82rem", color: "#999", marginBottom: "0.5rem" }}>
              <span>Anonymous · {timeAgo(post.created_at)}</span>
              {post.faculty_tag && <FacultyBadge tag={post.faculty_tag} />}
            </div>
            <ImageGrid urls={post.image_urls ?? []} />
            {post.content && (
              <p style={{ margin: "0 0 0.75rem", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                {post.content}
              </p>
            )}
            <div style={{ display: "flex", gap: "1rem", alignItems: "center", fontSize: "0.9rem" }}>
              <button
                onClick={() => handleVote(post.id, "up")}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                  color: post.current_user_vote === "up" ? "#e05c00" : "#555",
                  fontWeight: post.current_user_vote === "up" ? "bold" : "normal",
                }}
              >
                ▲ {post.upvotes}
              </button>
              <button
                onClick={() => handleVote(post.id, "down")}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: 0,
                  color: post.current_user_vote === "down" ? "#5555dd" : "#555",
                  fontWeight: post.current_user_vote === "down" ? "bold" : "normal",
                }}
              >
                ▼ {post.downvotes}
              </button>
              <Link href={`/qa/${post.id}`} style={{ color: "#555", textDecoration: "none" }}>
                💬 {post.reply_count} {post.reply_count === 1 ? "answer" : "answers"}
              </Link>
              <SharePanel postId={post.id} />
            </div>
          </div>
        ))}
      </div>

      {total > posts.length && (
        <p style={{ color: "#888", textAlign: "center", marginTop: "1rem" }}>
          Showing {posts.length} of {total} questions
        </p>
      )}
      </main>

      {/* Fixed compose bar */}
      <div style={{ position: "fixed", bottom: 60, left: 0, right: 0, background: "#fff", borderTop: "1px solid #e8e8e8", padding: "0.5rem 1rem", zIndex: 50 }}>
        <div
          onClick={() => setComposerOpen(true)}
          style={{ maxWidth: 640, margin: "0 auto", display: "flex", alignItems: "center", padding: "0.6rem 1rem", borderRadius: 20, background: "#f5f5f5", cursor: "text", color: "#aaa", fontSize: "0.95rem" }}
        >
          Ask a question anonymously…
        </div>
      </div>

      {composerOpen && (
        <>
          <div onClick={() => setComposerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 100 }} />
          <div style={{ position: "fixed", bottom: 60, left: "50%", transform: "translateX(-50%)", width: "min(600px, 94vw)", background: "#fff", borderRadius: 16, padding: "1rem 1rem 1.5rem", zIndex: 101, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 4px 32px rgba(0,0,0,0.18)" }}>
            <div style={{ maxWidth: 640, margin: "0 auto" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                <span style={{ fontWeight: "600", fontSize: "1rem" }}>Ask anonymously</span>
                <button onClick={() => setComposerOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.5rem", color: "#999", lineHeight: 1, padding: "0 0.2rem" }}>×</button>
              </div>
              <form onSubmit={handlePost}>
                <textarea
                  autoFocus
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Ask a question anonymously…"
                  rows={4}
                  style={textareaStyle}
                />
                <ImageUploader
                  key={uploaderKey}
                  onUrlsChange={(urls, uploading) => { setImageUrls(urls); setImagesUploading(uploading); }}
                />
                <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
                  <select
                    value={facultyTag}
                    onChange={(e) => setFacultyTag(e.target.value as Faculty | "")}
                    style={{ padding: "0.4rem 0.6rem", fontSize: "0.88rem", border: "1px solid #ccc", borderRadius: 4, fontFamily: "inherit", color: facultyTag ? "#111" : "#888", background: "#fff" }}
                  >
                    <option value="">Tag faculty (optional)</option>
                    {FACULTIES.map((f) => <option key={f} value={f}>{f} — {FACULTY_NAMES[f]}</option>)}
                  </select>
                  <span style={{ fontSize: "0.82rem", color: "#999" }}>🔒 anonymous</span>
                  <button
                    type="submit"
                    disabled={submitting || imagesUploading || (!content.trim() && !imageUrls.length)}
                    style={{ marginLeft: "auto", padding: "0.5rem 1.2rem", cursor: "pointer" }}
                  >
                    {imagesUploading ? "Uploading…" : submitting ? "Posting…" : "Post anonymously"}
                  </button>
                </div>
                {postError && <p style={{ color: "crimson", margin: "0.4rem 0 0", fontSize: "0.9rem" }}>{postError}</p>}
              </form>
            </div>
          </div>
        </>
      )}
    </>
  );
}
