"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import { applyVote } from "@/lib/vote";
import { compressImage } from "@/lib/imageCompress";
import { InlineComposer } from "@/components/InlineComposer";
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
  Camera,
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
  PenLine,
} from "lucide-react";

interface Club {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  banner_url: string | null;
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
  avatar_url: string | null;
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
  const [bannerUploading, setBannerUploading] = useState(false);
  const [bannerError, setBannerError] = useState<string | null>(null);
  const bannerInputRef = useRef<HTMLInputElement>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [total, setTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const LIMIT = 20;
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
  const [memberSearch, setMemberSearch] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteUsername, setInviteUsername] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteMsg, setInviteMsg] = useState<string | null>(null);

  function buildParams(offset: number) {
    return new URLSearchParams({ limit: String(LIMIT), offset: String(offset) });
  }

  useEffect(() => {
    async function load() {
      try {
        const [clubData, postsData, me] = await Promise.all([
          apiFetch<Club>(`/api/clubs/${slug}`),
          apiFetch<PostListResponse>(`/api/clubs/${slug}/posts?${buildParams(0)}`),
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
  }, [slug, router]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        setPosts((current) => {
          if (loadingMore || current.length >= total || loading) return current;
          setLoadingMore(true);
          apiFetch<PostListResponse>(`/api/clubs/${slug}/posts?${buildParams(current.length)}`)
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
  }, [loading, loadingMore, total, slug]); // eslint-disable-line react-hooks/exhaustive-deps

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

  async function handleBannerChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (bannerInputRef.current) bannerInputRef.current.value = "";
    if (!file) return;

    setBannerUploading(true);
    setBannerError(null);
    try {
      const fd = new FormData();
      fd.append("file", await compressImage(file));
      const res = await fetch("/api/upload", { method: "POST", credentials: "include", body: fd });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { detail?: string };
        throw new Error(body.detail ?? "Upload failed.");
      }
      const { url } = (await res.json()) as { url: string };
      const updated = await apiFetch<Club>(`/api/clubs/${slug}/banner`, {
        method: "PUT",
        body: JSON.stringify({ banner_url: url }),
      });
      setClub(updated);
    } catch (err: unknown) {
      setBannerError(err instanceof Error ? err.message : "Could not update banner.");
    } finally {
      setBannerUploading(false);
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
          poll_public_votes: pollDraft?.publicVotes ?? false,
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
    const before = posts.find((p) => p.id === postId);
    if (!before) return;
    // Instant local update; the server response (or a rollback) reconciles it.
    setPosts((prev) => prev.map((p) => (p.id === postId ? applyVote(p, voteType) : p)));
    try {
      const data = await apiFetch<VoteResponse>(`/api/clubs/${slug}/posts/${postId}/vote`, {
        method: "POST",
        body: JSON.stringify({ vote_type: voteType }),
      });
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, ...data } : p)));
    } catch {
      const revert = { upvotes: before.upvotes, downvotes: before.downvotes, current_user_vote: before.current_user_vote };
      setPosts((prev) => prev.map((p) => (p.id === postId ? { ...p, ...revert } : p)));
    }
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
        <div className="bg-surface rounded-2xl shadow-sm mb-4">
          {/* Banner — clipped to its own rounded top corners, not the whole card,
              so the ⋮ menu below (which overflows this card's bounds) isn't cut off. */}
          <div className="relative h-32 sm:h-40 rounded-t-2xl overflow-hidden bg-gradient-to-br from-secondary/20 to-secondary/5">
            {club.banner_url && (
              <img
                src={club.banner_url}
                alt=""
                className="absolute inset-0 w-full h-full object-cover"
              />
            )}
            {/* Fades the image into the card's background so the header text below
                never fights the banner for a hard edge. */}
            <div className="absolute inset-0 bg-gradient-to-t from-surface via-transparent to-transparent" />
            {isMod && (
              <>
                <input
                  ref={bannerInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/gif,image/webp"
                  className="hidden"
                  onChange={handleBannerChange}
                />
                <button
                  type="button"
                  onClick={() => bannerInputRef.current?.click()}
                  disabled={bannerUploading}
                  className="absolute top-2 right-2 flex items-center gap-1 text-[11px] font-medium px-2.5 py-1.5 rounded-full bg-black/40 text-white backdrop-blur-sm hover:bg-black/55 transition-colors disabled:opacity-60"
                >
                  <Camera className="w-3 h-3" />
                  {bannerUploading ? "Uploading…" : club.banner_url ? "Change banner" : "Add banner"}
                </button>
              </>
            )}
          </div>
          {bannerError && <p className="px-4 pt-2 text-xs text-destructive">{bannerError}</p>}

          <div className="px-4 pt-4 pb-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-0.5">
                  <h1 className="text-lg font-bold text-on-surface">{club.name}</h1>
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
                <div className="flex items-center gap-1 text-xs text-on-surface-variant">
                  <Users className="w-3 h-3" />
                  {club.member_count} {club.member_count === 1 ? "member" : "members"}
                </div>
                {club.description && (
                  <p className="text-sm text-on-surface-variant mt-1.5">{club.description}</p>
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
                      <div className="absolute right-0 top-[calc(100%+4px)] bg-surface border border-border rounded-xl shadow-lg min-w-[170px] z-[200] overflow-hidden">
                        <button
                          onClick={() => {
                            setMenuOpen(false);
                            loadMembers();
                          }}
                          className="flex items-center gap-2 w-full text-left px-4 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                        >
                          <Users className="w-3.5 h-3.5 text-muted-foreground" />
                          Members
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
            <div className="border-t border-outline-variant/60 px-4 py-3">
              <p className="text-xs font-semibold text-on-surface-variant mb-2">Pending join requests</p>
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

        </div>

        {!club.is_member && (
          <p className="text-on-surface-variant text-sm mb-4">Join this club to post here.</p>
        )}

        {/* Inline expanding composer */}
        {club.is_member && (
          <InlineComposer
            open={composerOpen}
            onOpen={() => setComposerOpen(true)}
            icon={<PenLine className="w-4 h-4" />}
            placeholder={`Post in ${club.name}…`}
            className="mb-4"
          >
            <form onSubmit={handlePost} className="px-4 pt-3 pb-3 space-y-3">
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder={`Post in ${club.name}…`}
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
                <PollComposer value={pollDraft} onChange={setPollDraft} allowPublicVotes />
                <div className="flex items-center gap-2">
                  {postError && <p className="text-xs text-destructive">{postError}</p>}
                  <div className="ml-auto flex items-center gap-2">
                    <button type="button" onClick={() => { setComposerOpen(false); setPollDraft(null); }} className="text-xs text-on-surface-variant hover:text-on-surface transition-colors px-2 py-1">Cancel</button>
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
        )}

        {/* Posts */}
        {posts.length === 0 && (
          <p className="text-on-surface-variant text-sm text-center py-8">No posts yet. Be the first!</p>
        )}

        <div className="space-y-3">
          {posts.map((post) => {
            const voted = post.current_user_vote;
            return (
              <div
                key={post.id}
                className={cn(
                  "bg-surface rounded-xl border overflow-hidden",
                  post.is_pinned ? "border-purple-200" : "border-outline-variant"
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
                  <div className="text-xs text-on-surface-variant min-w-0">
                    {post.author ? (
                      <Link
                        href={`/profile/${post.author.username}`}
                        className="no-underline text-on-surface-variant"
                      >
                        <strong className="text-on-surface">{post.author.display_name}</strong>
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
                  <p className="px-4 pb-3 text-body-sm leading-relaxed whitespace-pre-wrap text-on-surface">
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
                    href={`/feed/${post.id}`}
                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low transition-colors no-underline"
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
                          className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium text-on-surface-variant/40 hover:text-on-surface-variant hover:bg-surface-container transition-colors"
                        >
                          <Pin className="w-3.5 h-3.5" />
                        </button>
                      )
                    )}
                    {(post.author?.username === currentUsername || club.role === "owner") && (
                      <button
                        onClick={() => handleDeletePost(post.id)}
                        className="flex items-center px-2 py-1.5 rounded-lg text-on-surface-variant/40 hover:text-error hover:bg-error-container/30 transition-colors"
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

        <div ref={sentinelRef} className="h-4" />
        {loadingMore && (
          <p className="text-on-surface-variant text-xs text-center py-4">Loading more…</p>
        )}
        {!loadingMore && posts.length > 0 && posts.length >= total && (
          <p className="text-on-surface-variant text-xs text-center py-4">You&apos;re all caught up.</p>
        )}
      </main>


      {/* Invite overlay */}
      {inviteOpen && typeof document !== "undefined" && createPortal(
        <>
          <div
            onClick={() => { setInviteOpen(false); setInviteMsg(null); setInviteUsername(""); }}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200]"
          />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(400px,90vw)] bg-surface rounded-2xl shadow-2xl z-[201] p-5">
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
        </>,
        document.body
      )}

      {/* Members modal */}
      {showMembers && typeof document !== "undefined" && createPortal(
        <>
          <div onClick={() => { setShowMembers(false); setMemberSearch(""); }} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200]" />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(360px,92vw)] bg-surface rounded-2xl shadow-2xl z-[201] flex flex-col max-h-[65vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
              <span className="font-semibold text-sm">Members · {club?.member_count ?? members.length}</span>
              <button onClick={() => { setShowMembers(false); setMemberSearch(""); }} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="px-3 py-2 border-b border-border flex-shrink-0">
              <input
                type="text"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
                placeholder="Search members…"
                className="w-full text-sm px-3 py-1.5 rounded-lg bg-muted border-none outline-none placeholder:text-muted-foreground"
              />
            </div>
            <div className="overflow-y-auto flex-1">
              {members.length === 0 ? (
                <p className="text-muted-foreground text-sm text-center py-6">No members yet.</p>
              ) : (() => {
                const q = memberSearch.trim().toLowerCase();
                const filtered = q
                  ? members.filter((m) =>
                      m.display_name.toLowerCase().includes(q) || m.username.toLowerCase().includes(q)
                    )
                  : members;
                return filtered.length === 0 ? (
                  <p className="text-muted-foreground text-sm text-center py-6">No members match &ldquo;{memberSearch}&rdquo;.</p>
                ) : filtered.map((m) => (
                  <div key={m.username} className="px-4 py-3 border-b border-border/50">
                    {/* Top row: avatar + name */}
                    <div className="flex items-center gap-3">
                      <Link
                        href={`/profile/${m.username}`}
                        onClick={() => setShowMembers(false)}
                        className="flex items-center gap-2.5 flex-1 min-w-0 no-underline"
                      >
                        <MiniAvatar name={m.display_name} url={m.avatar_url} size={38} />
                        <div className="min-w-0">
                          <p className="font-medium text-sm text-foreground truncate">{m.display_name}</p>
                          <p className="text-[11px] text-muted-foreground">@{m.username}</p>
                        </div>
                      </Link>
                      {/* Role badge — always visible on the right */}
                      <span className={cn(
                        "text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0",
                        m.role === "owner" ? "bg-purple-100 text-purple-700"
                          : m.role === "moderator" ? "bg-green-100 text-green-700"
                          : "bg-muted text-muted-foreground"
                      )}>
                        {m.role === "owner" ? "Admin" : m.role}
                      </span>
                    </div>
                    {/* Bottom row: action buttons (only for owner managing non-owners) */}
                    {club?.role === "owner" && m.role !== "owner" && (
                      <div className="flex items-center gap-1.5 mt-2 ml-[50px]">
                        {m.role === "member" && (
                          <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-green-700 border-green-600 hover:bg-green-50"
                            onClick={() => handleRoleChange(m.username, "moderator")}>
                            Make Mod
                          </Button>
                        )}
                        {m.role === "moderator" && (
                          <>
                            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2 text-purple-700 border-purple-600 hover:bg-purple-50"
                              onClick={() => handleRoleChange(m.username, "owner")}>
                              Make Admin
                            </Button>
                            <Button size="sm" variant="outline" className="h-6 text-[10px] px-2"
                              onClick={() => handleRoleChange(m.username, "member")}>
                              Demote
                            </Button>
                          </>
                        )}
                        <button onClick={() => handleRemoveMember(m.username)}
                          className="text-[10px] text-muted-foreground hover:text-destructive transition-colors">
                          Remove
                        </button>
                      </div>
                    )}
                  </div>
                ));
              })()}
            </div>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
