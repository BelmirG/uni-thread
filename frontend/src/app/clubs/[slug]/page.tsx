"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { ImageUploader } from "@/components/ImageUploader";
import { ImageGrid } from "@/components/ImageGrid";
import { FileUploader, FileAttachment } from "@/components/FileUploader";
import { FileAttachmentList } from "@/components/FileAttachmentList";
import UserSearchInput from "@/components/UserSearchInput";
import PollComposer, { PollDraft } from "@/components/PollComposer";
import PollDisplay from "@/components/PollDisplay";
import MiniAvatar from "@/components/MiniAvatar";
import { timeAgo } from "@/lib/timeAgo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ChevronUp,
  ChevronDown,
  MessageCircle,
  Trash2,
  MoreVertical,
  X,
  Users,
  UserPlus,
  Pin,
  MessageSquare,
} from "lucide-react";

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
  file_attachments: FileAttachment[];
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
  const [fileAttachments, setFileAttachments] = useState<FileAttachment[]>([]);
  const [filesUploading, setFilesUploading] = useState(false);
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
      const newPost = await apiFetch<Post>(`/api/clubs/${slug}/posts`, {
        method: "POST",
        body: JSON.stringify({
          content: content.trim(),
          image_urls: imageUrls,
          file_attachments: fileAttachments,
          poll_options: pollDraft ? pollDraft.options.map((o) => o.trim()).filter(Boolean) : [],
          poll_expires_at: pollDraft?.expiresAt ? new Date(pollDraft.expiresAt).toISOString() : null,
        }),
      });
      setPosts((prev) => [newPost, ...prev]);
      setTotal((t) => t + 1);
      setContent("");
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

  if (loading) {
    return <p className="text-muted-foreground text-sm text-center py-16">Loading…</p>;
  }

  if (pageError) {
    return (
      <main className="max-w-xl mx-auto px-4 pt-4">
        <Link href="/clubs" className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors no-underline mb-4">
          <ArrowLeft className="w-4 h-4" />
          Clubs
        </Link>
        <div className="p-4 rounded-xl border border-destructive/30 bg-destructive/5 text-destructive text-sm">
          <strong>Could not load club:</strong> {pageError}
        </div>
      </main>
    );
  }

  if (!club) return null;

  const isMod = club.role && ["owner", "moderator"].includes(club.role);

  return (
    <>
      <main className="max-w-xl mx-auto px-4 pt-4 pb-36">
        {/* Back link + chat */}
        <div className="flex items-center justify-between mb-4">
          <Link
            href="/clubs"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors no-underline"
          >
            <ArrowLeft className="w-4 h-4" />
            Clubs
          </Link>
          {club.is_member && (
            <Link
              href={`/clubs/${slug}/chat`}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full border border-border hover:bg-muted transition-colors no-underline text-foreground"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              Chat
            </Link>
          )}
        </div>

        {/* Club header card */}
        <div className="bg-white border border-border rounded-xl shadow-sm mb-4">
          <div className="px-4 pt-4 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <h1 className="text-lg font-bold text-foreground">{club.name}</h1>
                  {club.is_private && (
                    <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                      Private
                    </span>
                  )}
                  {club.role && (
                    <span
                      className={cn(
                        "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                        club.role === "owner"
                          ? "bg-purple-100 text-purple-700"
                          : club.role === "moderator"
                          ? "bg-green-100 text-green-700"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {club.role}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Users className="w-3 h-3" />
                  {club.member_count} {club.member_count === 1 ? "member" : "members"}
                </div>
                {club.description && (
                  <p className="text-sm text-muted-foreground mt-1.5">{club.description}</p>
                )}
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                {!club.is_member && !club.has_pending_request && (
                  <Button size="sm" onClick={handleJoin}>
                    {club.is_private ? "Request to join" : "Join"}
                  </Button>
                )}
                {club.has_pending_request && (
                  <div className="flex flex-col items-end gap-0.5">
                    <span className="text-xs text-muted-foreground">Request pending…</span>
                    <button
                      onClick={handleCancelRequest}
                      className="text-[10px] text-muted-foreground/60 hover:text-foreground transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* ⋮ menu */}
                <div className="relative">
                  <button
                    onClick={() => setMenuOpen((o) => !o)}
                    className="p-1.5 rounded-lg border border-border hover:bg-muted text-muted-foreground transition-colors"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                  {menuOpen && (
                    <>
                      <div onClick={() => setMenuOpen(false)} className="fixed inset-0 z-[199]" />
                      <div className="absolute right-0 top-[calc(100%+4px)] bg-white border border-border rounded-xl shadow-lg min-w-[170px] z-[200] overflow-hidden">
                        <button
                          onClick={() => {
                            setMenuOpen(false);
                            showMembers ? setShowMembers(false) : loadMembers();
                          }}
                          className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                        >
                          <Users className="w-3.5 h-3.5 text-muted-foreground" />
                          {showMembers ? "Hide members" : "Members"}
                        </button>
                        {isMod && (
                          <>
                            <button
                              onClick={() => {
                                setMenuOpen(false);
                                showRequests ? setShowRequests(false) : loadJoinRequests();
                              }}
                              className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-muted border-t border-border/60 transition-colors"
                            >
                              <Users className="w-3.5 h-3.5 text-muted-foreground" />
                              {showRequests ? "Hide requests" : "Join requests"}
                            </button>
                            <button
                              onClick={() => {
                                setMenuOpen(false);
                                setInviteOpen((o) => !o);
                                setInviteMsg(null);
                              }}
                              className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-muted border-t border-border/60 transition-colors"
                            >
                              <UserPlus className="w-3.5 h-3.5 text-muted-foreground" />
                              Invite member
                            </button>
                          </>
                        )}
                        {club.is_member && (
                          <button
                            onClick={() => { setMenuOpen(false); handleLeave(); }}
                            className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-destructive hover:bg-destructive/5 border-t border-border/60 transition-colors"
                          >
                            Leave club
                          </button>
                        )}
                        {club.role === "owner" && (
                          <button
                            onClick={() => { setMenuOpen(false); handleDelete(); }}
                            className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-destructive hover:bg-destructive/5 border-t border-border/60 transition-colors"
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
          </div>

          {/* Join requests */}
          {showRequests && (
            <div className="border-t border-border/60 px-4 py-3">
              <p className="text-xs font-semibold text-muted-foreground mb-2">Pending join requests</p>
              {joinRequests.length === 0 ? (
                <p className="text-xs text-muted-foreground">No pending requests.</p>
              ) : (
                <div className="space-y-2">
                  {joinRequests.map((r) => (
                    <div key={r.username} className="flex items-center justify-between gap-2 text-sm">
                      <span>
                        <strong>{r.display_name}</strong>{" "}
                        <span className="text-muted-foreground">@{r.username}</span>
                      </span>
                      <div className="flex gap-1.5">
                        <Button size="sm" onClick={() => handleApprove(r.username)}>Approve</Button>
                        <Button size="sm" variant="outline" onClick={() => handleReject(r.username)}>Reject</Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Members list */}
          {showMembers && (
            <div className="border-t border-border/60 px-4 py-3">
              {members.length === 0 ? (
                <p className="text-xs text-muted-foreground">No members yet.</p>
              ) : (
                <div className="space-y-2">
                  {members.map((m) => (
                    <div key={m.username} className="flex items-center justify-between gap-2">
                      <span className="text-sm">
                        <strong>{m.display_name}</strong>{" "}
                        <span className="text-muted-foreground">@{m.username}</span>
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "text-[10px] font-semibold px-1.5 py-0.5 rounded",
                            m.role === "owner"
                              ? "bg-purple-100 text-purple-700"
                              : m.role === "moderator"
                              ? "bg-green-100 text-green-700"
                              : "bg-muted text-muted-foreground"
                          )}
                        >
                          {m.role === "owner" ? "Admin" : m.role}
                        </span>
                        {club.role === "owner" && m.role !== "owner" && (
                          <>
                            {m.role === "member" && (
                              <button
                                onClick={() => handleRoleChange(m.username, "moderator")}
                                className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-green-600 text-green-700 hover:bg-green-50 transition-colors"
                              >
                                Make Mod
                              </button>
                            )}
                            {m.role === "moderator" && (
                              <>
                                <button
                                  onClick={() => handleRoleChange(m.username, "owner")}
                                  className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-purple-600 text-purple-700 hover:bg-purple-50 transition-colors"
                                >
                                  Make Admin
                                </button>
                                <button
                                  onClick={() => handleRoleChange(m.username, "member")}
                                  className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:bg-muted transition-colors"
                                >
                                  Demote
                                </button>
                              </>
                            )}
                            <button
                              onClick={() => handleRemoveMember(m.username)}
                              className="text-[10px] text-muted-foreground/40 hover:text-destructive transition-colors"
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
          <p className="text-muted-foreground text-sm mb-4">Join this club to post here.</p>
        )}

        {/* Posts */}
        {posts.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-8">No posts yet. Be the first!</p>
        )}

        <div className="space-y-3">
          {posts.map((post) => {
            const voted = post.current_user_vote;
            return (
              <div
                key={post.id}
                className={cn(
                  "bg-white border rounded-xl shadow-sm overflow-hidden",
                  post.is_pinned ? "border-purple-200" : "border-border"
                )}
              >
                {post.is_pinned && (
                  <div className="flex items-center gap-1 px-4 pt-2.5 text-[11px] font-semibold text-purple-600">
                    <Pin className="w-3 h-3" />
                    Pinned
                  </div>
                )}

                {/* Author */}
                <div className="flex items-center gap-2.5 px-4 pt-3 pb-2">
                  {post.author ? (
                    <Link href={`/profile/${post.author.username}`} className="flex-shrink-0">
                      <MiniAvatar name={post.author.display_name} url={post.author.avatar_url} />
                    </Link>
                  ) : (
                    <MiniAvatar name="?" url={null} />
                  )}
                  <div className="text-xs text-muted-foreground min-w-0">
                    {post.author ? (
                      <Link
                        href={`/profile/${post.author.username}`}
                        className="no-underline text-muted-foreground"
                      >
                        <strong className="text-foreground">{post.author.display_name}</strong>
                        {" @"}{post.author.username}
                      </Link>
                    ) : (
                      <em>Unknown</em>
                    )}
                    {" · "}{timeAgo(post.created_at)}
                  </div>
                </div>

                {/* Images */}
                {(post.image_urls ?? []).length > 0 && (
                  <div className="px-4 pb-2">
                    <ImageGrid urls={post.image_urls} />
                  </div>
                )}

                {/* File attachments */}
                {(post.file_attachments ?? []).length > 0 && (
                  <div className="px-4 pb-2">
                    <FileAttachmentList attachments={post.file_attachments} />
                  </div>
                )}

                {/* Content */}
                {post.content && (
                  <p className="px-4 pb-3 text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                    {post.content}
                  </p>
                )}

                {/* Poll */}
                {post.poll && (
                  <div className="px-4 pb-3">
                    <PollDisplay
                      postId={post.id}
                      poll={post.poll}
                      onUpdate={(p) =>
                        setPosts((prev) => prev.map((x) => x.id === post.id ? { ...x, poll: p } : x))
                      }
                    />
                  </div>
                )}

                {/* Action bar */}
                <div className="flex items-center px-2 py-1 border-t border-border/60">
                  <button
                    onClick={() => handleVote(post.id, "up")}
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
                    onClick={() => handleVote(post.id, "down")}
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
                    {post.reply_count} {post.reply_count === 1 ? "reply" : "replies"}
                  </Link>

                  <div className="ml-auto flex items-center gap-1">
                    {isMod && (
                      post.is_pinned ? (
                        <button
                          onClick={() => handleUnpinPost(post.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-purple-600 hover:bg-purple-50 transition-colors"
                        >
                          <Pin className="w-3.5 h-3.5" />
                          Unpin
                        </button>
                      ) : (
                        <button
                          onClick={() => handlePinPost(post.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-muted-foreground/40 hover:text-muted-foreground hover:bg-muted transition-colors"
                        >
                          <Pin className="w-3.5 h-3.5" />
                        </button>
                      )
                    )}
                    {(post.author?.username === currentUsername || club.role === "owner") && (
                      <button
                        onClick={() => handleDeletePost(post.id)}
                        className="flex items-center px-2.5 py-1.5 rounded-lg text-muted-foreground/40 hover:text-destructive hover:bg-destructive/5 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {total > posts.length && (
          <p className="text-muted-foreground text-xs text-center mt-4">
            Showing {posts.length} of {total} posts
          </p>
        )}
      </main>

      {/* Fixed compose bar */}
      {club.is_member && (
        <>
          <div className="fixed bottom-16 left-0 right-0 px-4 py-2 bg-white/95 backdrop-blur-sm border-t border-border z-40">
            <div className="max-w-xl mx-auto">
              <button
                onClick={() => setComposerOpen(true)}
                className="w-full flex items-center gap-3 px-4 py-2.5 rounded-full bg-muted hover:bg-muted/80 transition-colors text-sm text-muted-foreground"
              >
                Post in {club.name}…
              </button>
            </div>
          </div>

          {composerOpen && (
            <>
              <div
                onClick={() => { setComposerOpen(false); setPollDraft(null); }}
                className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
              />
              <div className="fixed bottom-[4.5rem] left-1/2 -translate-x-1/2 w-[min(600px,94vw)] bg-white rounded-2xl z-[101] shadow-2xl max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
                  <span className="font-semibold text-sm">Post in {club.name}</span>
                  <button
                    onClick={() => { setComposerOpen(false); setPollDraft(null); }}
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
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          (e.currentTarget.closest("form") as HTMLFormElement)?.requestSubmit();
                        }
                      }}
                      placeholder={`Post in ${club.name}…`}
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
                      <PollComposer value={pollDraft} onChange={setPollDraft} />
                      <div className="flex items-center gap-2">
                        {postError && <p className="text-xs text-destructive">{postError}</p>}
                        <Button
                          type="submit"
                          size="sm"
                          className="ml-auto"
                          disabled={submitting || imagesUploading || filesUploading || (!content.trim() && !imageUrls.length && !pollDraft && !fileAttachments.length)}
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
      )}

      {/* Invite overlay */}
      {inviteOpen && (
        <>
          <div
            onClick={() => { setInviteOpen(false); setInviteMsg(null); setInviteUsername(""); }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200]"
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(400px,90vw)] bg-white rounded-2xl shadow-2xl z-[201] p-5">
            <div className="flex items-center justify-between mb-4">
              <span className="font-semibold text-sm">Invite a member</span>
              <button
                onClick={() => { setInviteOpen(false); setInviteMsg(null); setInviteUsername(""); }}
                className="rounded-full p-1 hover:bg-muted text-muted-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleInvite} className="space-y-3">
              <UserSearchInput
                value={inviteUsername}
                onChange={setInviteUsername}
                onSelect={(u) => setInviteUsername(u)}
                placeholder="Search by name or username…"
              />
              <div className="flex items-center gap-2">
                <Button type="submit" disabled={inviting || !inviteUsername.trim()}>
                  {inviting ? "Sending…" : "Send invite"}
                </Button>
                {inviteMsg && (
                  <span
                    className={cn(
                      "text-xs font-medium",
                      inviteMsg.startsWith("Invitation sent") ? "text-green-600" : "text-destructive"
                    )}
                  >
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
