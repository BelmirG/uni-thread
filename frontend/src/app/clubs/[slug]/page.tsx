"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { ImageUploader } from "@/components/ImageUploader";
import { ImageGrid } from "@/components/ImageGrid";
import UserSearchInput from "@/components/UserSearchInput";
import PollComposer, { PollDraft } from "@/components/PollComposer";
import PollDisplay from "@/components/PollDisplay";

interface Club {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_private: boolean;
  member_count: number;
  is_member: boolean;
  role: string | null;
  has_pending_request: boolean;
}

interface JoinRequest {
  username: string;
  display_name: string;
  requested_at: string;
}

interface Author {
  username: string;
  display_name: string;
  avatar_url: string | null;
}

function MiniAvatar({ name, url }: { name: string; url: string | null }) {
  if (url) return <img src={url} alt="" style={{ width: 30, height: 30, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />;
  return (
    <div style={{ width: 30, height: 30, borderRadius: "50%", background: "#111", color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "0.75rem", fontWeight: "bold", flexShrink: 0 }}>
      {(name || "?")[0].toUpperCase()}
    </div>
  );
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
  image_urls: string[];
  author: Author | null;
  upvotes: number;
  downvotes: number;
  current_user_vote: "up" | "down" | null;
  reply_count: number;
  poll: Poll | null;
  created_at: string;
  is_deleted: boolean;
  is_pinned: boolean;
}

interface Member {
  username: string;
  display_name: string;
  role: string;
  joined_at: string;
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

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function ClubDetailPage() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();

  const [club, setClub] = useState<Club | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [members, setMembers] = useState<Member[]>([]);
  const [showMembers, setShowMembers] = useState(false);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [showRequests, setShowRequests] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState<string | null>(null);

  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [imageUrls, setImageUrls] = useState<string[]>([]);
  const [imagesUploading, setImagesUploading] = useState(false);
  const [uploaderKey, setUploaderKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [postError, setPostError] = useState<string | null>(null);
  const [composerOpen, setComposerOpen] = useState(false);
  const [pollDraft, setPollDraft] = useState<PollDraft | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const [clubData, postsData, me] = await Promise.all([
          apiFetch<Club>(`/api/clubs/${slug}`),
          apiFetch<PostListResponse>(`/api/clubs/${slug}/posts`),
          apiFetch<{ username: string }>("/api/auth/me"),
        ]);
        setClub(clubData);
        setPosts(postsData.posts);
        setTotal(postsData.total);
        setCurrentUsername(me.username);
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
        } else {
          setPageError(err instanceof Error ? err.message : "Could not load club.");
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [slug, router]);

  async function loadMembers() {
    try {
      const data = await apiFetch<Member[]>(`/api/clubs/${slug}/members`);
      setMembers(data);
      setShowMembers(true);
    } catch { /* non-critical */ }
  }

  async function handleRemoveMember(username: string) {
    if (!confirm(`Remove @${username} from this club?`)) return;
    try {
      await apiFetch(`/api/clubs/${slug}/members/${username}`, { method: "DELETE" });
      setMembers((prev) => prev.filter((m) => m.username !== username));
      setClub((prev) => prev ? { ...prev, member_count: prev.member_count - 1 } : prev);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not remove member.");
    }
  }

  async function loadJoinRequests() {
    try {
      const data = await apiFetch<JoinRequest[]>(`/api/clubs/${slug}/requests`);
      setJoinRequests(data);
      setShowRequests(true);
    } catch { /* non-critical */ }
  }

  async function handleApprove(username: string) {
    try {
      await apiFetch(`/api/clubs/${slug}/requests/${username}/approve`, { method: "POST" });
      setJoinRequests((prev) => prev.filter((r) => r.username !== username));
      setClub((prev) => prev ? { ...prev, member_count: prev.member_count + 1 } : prev);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not approve request.");
    }
  }

  async function handleReject(username: string) {
    try {
      await apiFetch(`/api/clubs/${slug}/requests/${username}`, { method: "DELETE" });
      setJoinRequests((prev) => prev.filter((r) => r.username !== username));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not reject request.");
    }
  }

  async function handleCancelRequest() {
    if (!currentUsername) return;
    try {
      await apiFetch(`/api/clubs/${slug}/requests/${currentUsername}`, { method: "DELETE" });
      setClub((prev) => prev ? { ...prev, has_pending_request: false } : prev);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not cancel request.");
    }
  }

  async function handleJoin() {
    try {
      const updated = await apiFetch<Club>(`/api/clubs/${slug}/join`, { method: "POST" });
      setClub(updated);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not join.");
    }
  }

  async function handleLeave() {
    try {
      await apiFetch(`/api/clubs/${slug}/leave`, { method: "DELETE" });
      setClub((prev) =>
        prev ? { ...prev, is_member: false, role: null, member_count: prev.member_count - 1 } : prev
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not leave.");
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete "${club?.name}"? This will permanently remove the club and all its posts.`)) return;
    try {
      await apiFetch(`/api/clubs/${slug}`, { method: "DELETE" });
      router.replace("/clubs");
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not delete club.");
    }
  }

  async function handlePost(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim() && !imageUrls.length && !pollDraft) return;
    if (imagesUploading) return;
    setSubmitting(true);
    setPostError(null);
    try {
      const newPost = await apiFetch<Post>(`/api/clubs/${slug}/posts`, {
        method: "POST",
        body: JSON.stringify({
          content: content.trim(),
          image_urls: imageUrls,
          poll_options: pollDraft ? pollDraft.options.map((o) => o.trim()).filter(Boolean) : [],
          poll_expires_at: pollDraft?.expiresAt ? new Date(pollDraft.expiresAt).toISOString() : null,
        }),
      });
      setPosts((prev) => [newPost, ...prev]);
      setTotal((t) => t + 1);
      setContent("");
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

  async function handleDeletePost(postId: string) {
    try {
      await apiFetch(`/api/posts/${postId}`, { method: "DELETE" });
      setPosts((prev) => prev.filter((p) => p.id !== postId));
      setTotal((t) => t - 1);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not delete post.");
    }
  }

  async function handleVote(postId: string, voteType: "up" | "down") {
    try {
      const data = await apiFetch<VoteResponse>(`/api/clubs/${slug}/posts/${postId}/vote`, {
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

  function sortPosts(list: Post[]) {
    return [...list.filter((p) => p.is_pinned), ...list.filter((p) => !p.is_pinned)];
  }

  async function handlePinPost(postId: string) {
    try {
      await apiFetch(`/api/clubs/${slug}/posts/${postId}/pin`, { method: "POST" });
      setPosts((prev) => sortPosts(prev.map((p) => p.id === postId ? { ...p, is_pinned: true } : p)));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not pin post.");
    }
  }

  async function handleUnpinPost(postId: string) {
    try {
      await apiFetch(`/api/clubs/${slug}/posts/${postId}/pin`, { method: "DELETE" });
      setPosts((prev) => sortPosts(prev.map((p) => p.id === postId ? { ...p, is_pinned: false } : p)));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not unpin post.");
    }
  }

  async function handleRoleChange(username: string, role: string) {
    try {
      await apiFetch(`/api/clubs/${slug}/members/${username}/role`, {
        method: "PUT",
        body: JSON.stringify({ role }),
      });
      setMembers((prev) => prev.map((m) => m.username === username ? { ...m, role } : m));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not change role.");
    }
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviteUsername.trim()) return;
    setInviting(true);
    setInviteMsg(null);
    try {
      await apiFetch(`/api/clubs/${slug}/invite/${inviteUsername.trim()}`, { method: "POST" });
      setInviteMsg(`Invitation sent to @${inviteUsername.trim()}`);
      setInviteUsername("");
    } catch (err: unknown) {
      setInviteMsg(err instanceof Error ? err.message : "Could not send invitation.");
    } finally {
      setInviting(false);
    }
  }

  if (loading) return <p style={{ padding: "2rem", color: "#888" }}>Loading…</p>;

  if (pageError) {
    return (
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem 1rem" }}>
        <Link href="/clubs" style={{ fontSize: "0.9rem" }}>← Clubs</Link>
        <div style={{ marginTop: "1.5rem", padding: "1rem", border: "1px solid #f5c6cb", borderRadius: 8, background: "#fff5f5", color: "crimson" }}>
          <strong>Could not load club:</strong> {pageError}
        </div>
      </main>
    );
  }

  if (!club) return null;

  const roleColor: Record<string, string> = { owner: "#7b2d8b", moderator: "#1a6b3a", member: "#555" };

  return (
    <>
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem 1rem 5rem" }}>
      {/* Back link + chat shortcut */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <Link href="/clubs" style={{ fontSize: "0.9rem" }}>← Clubs</Link>
        {club.is_member && (
          <Link
            href={`/clubs/${slug}/chat`}
            style={{ fontSize: "0.9rem", padding: "0.3rem 0.8rem", border: "1px solid #ccc", borderRadius: 16, textDecoration: "none", color: "#333" }}
          >
            💬 Chat
          </Link>
        )}
      </div>

      {/* Club header */}
      <div style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: "1rem", margin: "1rem 0 1.5rem", background: "#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
          <div style={{ flex: 1 }}>
            <h1 style={{ margin: "0 0 0.25rem", fontSize: "1.4rem" }}>
              {club.name}
              {club.is_private && (
                <span style={{ marginLeft: "0.5rem", fontSize: "0.75rem", color: "#888", background: "#f0f0f0", padding: "0.15rem 0.4rem", borderRadius: 4, fontWeight: "normal" }}>
                  Private
                </span>
              )}
            </h1>
            <div style={{ fontSize: "0.85rem", color: "#888" }}>
              {club.member_count} {club.member_count === 1 ? "member" : "members"}
              {club.role && (
                <span style={{ marginLeft: "0.5rem", color: roleColor[club.role] ?? "#555" }}>
                  · {club.role}
                </span>
              )}
            </div>
            {club.description && (
              <p style={{ margin: "0.5rem 0 0", color: "#555", fontSize: "0.95rem" }}>{club.description}</p>
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
            {!club.is_member && !club.has_pending_request && (
              <button onClick={handleJoin} style={{ padding: "0.4rem 1rem", cursor: "pointer" }}>
                {club.is_private ? "Request to join" : "Join"}
              </button>
            )}
            {club.has_pending_request && (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: "0.25rem" }}>
                <span style={{ fontSize: "0.85rem", color: "#888" }}>Request pending…</span>
                <button onClick={handleCancelRequest} style={{ fontSize: "0.8rem", color: "#aaa", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  Cancel
                </button>
              </div>
            )}

            {/* ⋮ menu */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setMenuOpen((o) => !o)}
                style={{ background: "none", border: "1px solid #e0e0e0", borderRadius: 6, cursor: "pointer", padding: "0.3rem 0.6rem", fontSize: "1.1rem", color: "#555", lineHeight: 1 }}
              >
                ⋮
              </button>

              {menuOpen && (
                <>
                  <div onClick={() => setMenuOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 199 }} />
                  <div style={{ position: "absolute", right: 0, top: "calc(100% + 4px)", background: "#fff", border: "1px solid #e0e0e0", borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.12)", minWidth: 170, zIndex: 200, overflow: "hidden" }}>
                    <button
                      onClick={() => { setMenuOpen(false); showMembers ? setShowMembers(false) : loadMembers(); }}
                      style={{ display: "block", width: "100%", textAlign: "left", padding: "0.65rem 1rem", background: "none", border: "none", cursor: "pointer", fontSize: "0.9rem", color: "#333" }}
                    >
                      {showMembers ? "Hide members" : "Members"}
                    </button>

                    {club.role && ["owner", "moderator"].includes(club.role) && (
                      <>
                        <button
                          onClick={() => { setMenuOpen(false); showRequests ? setShowRequests(false) : loadJoinRequests(); }}
                          style={{ display: "block", width: "100%", textAlign: "left", padding: "0.65rem 1rem", background: "none", border: "none", cursor: "pointer", fontSize: "0.9rem", color: "#333", borderTop: "1px solid #f0f0f0" }}
                        >
                          {showRequests ? "Hide requests" : "Join requests"}
                        </button>
                        <button
                          onClick={() => { setMenuOpen(false); setInviteOpen((o) => !o); setInviteMsg(null); }}
                          style={{ display: "block", width: "100%", textAlign: "left", padding: "0.65rem 1rem", background: "none", border: "none", cursor: "pointer", fontSize: "0.9rem", color: "#333", borderTop: "1px solid #f0f0f0" }}
                        >
                          Invite member
                        </button>
                      </>
                    )}

                    {club.is_member && (
                      <button
                        onClick={() => { setMenuOpen(false); handleLeave(); }}
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "0.65rem 1rem", background: "none", border: "none", cursor: "pointer", fontSize: "0.9rem", color: "#555", borderTop: "1px solid #f0f0f0" }}
                      >
                        Leave club
                      </button>
                    )}

                    {club.role === "owner" && (
                      <button
                        onClick={() => { setMenuOpen(false); handleDelete(); }}
                        style={{ display: "block", width: "100%", textAlign: "left", padding: "0.65rem 1rem", background: "none", border: "none", cursor: "pointer", fontSize: "0.9rem", color: "crimson", borderTop: "1px solid #f0f0f0" }}
                      >
                        Delete club
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Join requests (owner/moderator only) */}
        {showRequests && (
          <div style={{ marginTop: "0.75rem", borderTop: "1px solid #eee", paddingTop: "0.75rem" }}>
            <strong style={{ fontSize: "0.88rem" }}>Pending join requests</strong>
            {joinRequests.length === 0 ? (
              <p style={{ color: "#aaa", margin: "0.4rem 0 0", fontSize: "0.88rem" }}>No pending requests.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginTop: "0.4rem" }}>
                {joinRequests.map((r) => (
                  <div key={r.username} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.88rem" }}>
                    <span><strong>{r.display_name}</strong> @{r.username}</span>
                    <div style={{ display: "flex", gap: "0.5rem" }}>
                      <button
                        onClick={() => handleApprove(r.username)}
                        style={{ padding: "0.2rem 0.6rem", fontSize: "0.82rem", cursor: "pointer", color: "#1a6b3a", border: "1px solid #1a6b3a", background: "none", borderRadius: 4 }}
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => handleReject(r.username)}
                        style={{ padding: "0.2rem 0.6rem", fontSize: "0.82rem", cursor: "pointer", color: "#888", border: "1px solid #ccc", background: "none", borderRadius: 4 }}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Member list */}
        {showMembers && (
          <div style={{ marginTop: "0.75rem", borderTop: "1px solid #eee", paddingTop: "0.75rem" }}>
            {members.length === 0 ? (
              <p style={{ color: "#aaa", margin: 0, fontSize: "0.88rem" }}>No members yet.</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                {members.map((m) => (
                  <div key={m.username} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.88rem" }}>
                    <span><strong>{m.display_name}</strong> @{m.username}</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span style={{ color: roleColor[m.role] ?? "#888" }}>{m.role === "owner" ? "Admin" : m.role}</span>
                      {club.role === "owner" && m.role !== "owner" && (
                        <>
                          {m.role === "member" && (
                            <button
                              onClick={() => handleRoleChange(m.username, "moderator")}
                              style={{ background: "none", border: "1px solid #1a6b3a", borderRadius: 4, cursor: "pointer", color: "#1a6b3a", fontSize: "0.75rem", padding: "0.1rem 0.4rem" }}
                            >
                              Make Mod
                            </button>
                          )}
                          {m.role === "moderator" && (
                            <>
                              <button
                                onClick={() => handleRoleChange(m.username, "owner")}
                                style={{ background: "none", border: "1px solid #7b2d8b", borderRadius: 4, cursor: "pointer", color: "#7b2d8b", fontSize: "0.75rem", padding: "0.1rem 0.4rem" }}
                              >
                                Make Admin
                              </button>
                              <button
                                onClick={() => handleRoleChange(m.username, "member")}
                                style={{ background: "none", border: "1px solid #ccc", borderRadius: 4, cursor: "pointer", color: "#888", fontSize: "0.75rem", padding: "0.1rem 0.4rem" }}
                              >
                                Demote
                              </button>
                            </>
                          )}
                          <button
                            onClick={() => handleRemoveMember(m.username)}
                            style={{ background: "none", border: "none", cursor: "pointer", color: "#ccc", fontSize: "0.82rem", padding: 0 }}
                          >
                            Remove
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {!club.is_member && (
        <p style={{ color: "#888", fontSize: "0.9rem", marginBottom: "1.5rem" }}>
          Join this club to post here.
        </p>
      )}

      {/* Posts */}
      {posts.length === 0 && <p style={{ color: "#888" }}>No posts yet. Be the first!</p>}

      <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        {posts.map((post) => (
          <div
            key={post.id}
            style={{ border: post.is_pinned ? "1px solid #d0a0e0" : "1px solid #e0e0e0", borderRadius: 8, padding: "1rem", background: "#fff" }}
          >
            {post.is_pinned && (
              <div style={{ fontSize: "0.75rem", color: "#7b2d8b", fontWeight: 600, marginBottom: "0.35rem" }}>📌 Pinned</div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.5rem" }}>
              {post.author
                ? <Link href={`/profile/${post.author.username}`} style={{ flexShrink: 0 }}><MiniAvatar name={post.author.display_name} url={post.author.avatar_url} /></Link>
                : <MiniAvatar name="?" url={null} />}
              <div style={{ fontSize: "0.82rem", color: "#888" }}>
                {post.author
                  ? <><Link href={`/profile/${post.author.username}`} style={{ color: "inherit", textDecoration: "none" }}><strong style={{ color: "#444" }}>{post.author.display_name}</strong> @{post.author.username}</Link></>
                  : <em>Unknown</em>}
                {" · "}{timeAgo(post.created_at)}
              </div>
            </div>
            <ImageGrid urls={post.image_urls ?? []} />
            {post.content && (
              <p style={{ margin: "0 0 0.75rem", whiteSpace: "pre-wrap", lineHeight: 1.5 }}>
                {post.content}
              </p>
            )}
            {post.poll && (
              <PollDisplay
                postId={post.id}
                poll={post.poll}
                onUpdate={(p) => setPosts((prev) => prev.map((x) => x.id === post.id ? { ...x, poll: p } : x))}
              />
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
              <Link href={`/feed/${post.id}`} style={{ color: "#555", textDecoration: "none" }}>
                💬 {post.reply_count} {post.reply_count === 1 ? "reply" : "replies"}
              </Link>
              <div style={{ marginLeft: "auto", display: "flex", gap: "0.75rem", alignItems: "center" }}>
                {club.role && ["owner", "moderator"].includes(club.role) && (
                  post.is_pinned
                    ? <button onClick={() => handleUnpinPost(post.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#7b2d8b", fontSize: "0.85rem" }}>Unpin</button>
                    : <button onClick={() => handlePinPost(post.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#aaa", fontSize: "0.85rem" }}>📌 Pin</button>
                )}
                {(post.author?.username === currentUsername || club.role === "owner") && (
                  <button
                    onClick={() => handleDeletePost(post.id)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "#ccc", fontSize: "0.85rem" }}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {total > posts.length && (
        <p style={{ color: "#888", textAlign: "center", marginTop: "1rem" }}>
          Showing {posts.length} of {total} posts
        </p>
      )}
    </main>

    {club.is_member && (
      <>
        {/* Fixed compose bar */}
        <div style={{ position: "fixed", bottom: 60, left: 0, right: 0, background: "#fff", borderTop: "1px solid #e8e8e8", padding: "0.5rem 1rem", zIndex: 50 }}>
          <div
            onClick={() => setComposerOpen(true)}
            style={{ maxWidth: 640, margin: "0 auto", display: "flex", alignItems: "center", padding: "0.6rem 1rem", borderRadius: 20, background: "#f5f5f5", cursor: "text", color: "#aaa", fontSize: "0.95rem" }}
          >
            Post in {club.name}…
          </div>
        </div>

        {composerOpen && (
          <>
            <div onClick={() => setComposerOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 100 }} />
            <div style={{ position: "fixed", bottom: 60, left: "50%", transform: "translateX(-50%)", width: "min(600px, 94vw)", background: "#fff", borderRadius: 16, padding: "1rem 1rem 1.5rem", zIndex: 101, maxHeight: "80vh", overflowY: "auto", boxShadow: "0 4px 32px rgba(0,0,0,0.18)" }}>
              <div style={{ maxWidth: 640, margin: "0 auto" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
                  <span style={{ fontWeight: "600", fontSize: "1rem" }}>Post in {club.name}</span>
                  <button onClick={() => setComposerOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.5rem", color: "#999", lineHeight: 1, padding: "0 0.2rem" }}>×</button>
                </div>
                <form onSubmit={handlePost}>
                  <textarea
                    autoFocus
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    placeholder={`Post in ${club.name}…`}
                    rows={4}
                    style={{ width: "100%", boxSizing: "border-box", padding: "0.6rem", fontSize: "0.95rem", border: "1px solid #ccc", borderRadius: 4, fontFamily: "inherit", resize: "vertical" }}
                  />
                  <ImageUploader
                    key={uploaderKey}
                    onUrlsChange={(urls, uploading) => { setImageUrls(urls); setImagesUploading(uploading); }}
                  />
                  <PollComposer value={pollDraft} onChange={setPollDraft} />
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.5rem" }}>
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
    )}

    {/* Invite overlay */}
    {inviteOpen && (
      <>
        <div onClick={() => { setInviteOpen(false); setInviteMsg(null); setInviteUsername(""); }} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 200 }} />
        <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%, -50%)", width: "min(400px, 90vw)", background: "#fff", borderRadius: 12, padding: "1.25rem", zIndex: 201, boxShadow: "0 8px 32px rgba(0,0,0,0.18)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
            <span style={{ fontWeight: 700, fontSize: "1rem" }}>Invite a member</span>
            <button onClick={() => { setInviteOpen(false); setInviteMsg(null); setInviteUsername(""); }} style={{ background: "none", border: "none", cursor: "pointer", color: "#999", fontSize: "1.4rem", lineHeight: 1 }}>×</button>
          </div>
          <form onSubmit={handleInvite}>
            <UserSearchInput
              value={inviteUsername}
              onChange={setInviteUsername}
              onSelect={(u) => setInviteUsername(u)}
              placeholder="Search by name or username…"
            />
            <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.75rem" }}>
              <button type="submit" disabled={inviting || !inviteUsername.trim()} style={{ padding: "0.4rem 1rem", cursor: "pointer", fontSize: "0.9rem" }}>
                {inviting ? "Sending…" : "Send invite"}
              </button>
              {inviteMsg && (
                <span style={{ fontSize: "0.85rem", color: inviteMsg.startsWith("Invitation sent") ? "#1a6b3a" : "crimson" }}>
                  {inviteMsg}
                </span>
              )}
            </div>
          </form>
        </div>
      </>
    )}
    </>
  );
}
