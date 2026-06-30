"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";
import { apiFetch, ApiError } from "@/lib/api";
import { ImageGrid } from "@/components/ImageGrid";
import MiniAvatar from "@/components/MiniAvatar";
import { FACULTIES, FACULTY_NAMES, FACULTY_PROGRAMS, Faculty } from "@/lib/faculties";
import { timeAgo } from "@/lib/timeAgo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  Bell, ChevronUp, ChevronDown, MessageCircle, Pencil,
  LogOut, X, Check, Camera, Lock,
} from "lucide-react";

// ── types ─────────────────────────────────────────────────────────────────────

interface Profile {
  username: string;
  display_name: string;
  bio: string | null;
  faculty: string | null;
  program: string | null;
  avatar_url: string | null;
  member_since: string;
  post_count: number;
  club_count: number;
  follower_count: number;
  following_count: number;
  is_following: boolean;
  is_own_profile: boolean;
  username_changed_at: string | null;
}

interface UserClub {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  is_private: boolean;
  role: string;
}

interface Author {
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface Post {
  id: string;
  content: string;
  faculty_tag: string | null;
  image_urls: string[];
  author: Author | null;
  upvotes: number;
  downvotes: number;
  reply_count: number;
  created_at: string;
  is_deleted: boolean;
}

interface FollowUser {
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface Invitation {
  club_name: string;
  club_slug: string;
  invited_by_display_name: string;
  invited_by_username: string;
}

type FollowNotif = {
  id: string;
  actor_username: string;
  actor_display_name: string;
  actor_avatar_url: string | null;
  is_read: boolean;
  created_at: string;
};

// ── helpers ───────────────────────────────────────────────────────────────────

function memberSince(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

async function getCroppedBlob(imageSrc: string, pixelCrop: Area): Promise<Blob> {
  const image = new Image();
  image.src = imageSrc;
  await new Promise<void>((resolve, reject) => {
    image.onload = () => resolve();
    image.onerror = reject;
  });
  const OUTPUT = Math.min(pixelCrop.width, pixelCrop.height, 600);
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT;
  canvas.height = OUTPUT;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, pixelCrop.x, pixelCrop.y, pixelCrop.width, pixelCrop.height, 0, 0, OUTPUT, OUTPUT);
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas is empty"))),
      "image/jpeg", 0.92,
    );
  });
}

// ── page ──────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter();
  const { username } = useParams<{ username: string }>();
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [profile, setProfile] = useState<Profile | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [clubs, setClubs] = useState<UserClub[]>([]);
  const [loading, setLoading] = useState(true);
  const [followLoading, setFollowLoading] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editFaculty, setEditFaculty] = useState<Faculty | "">("");
  const [editProgram, setEditProgram] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [followsModal, setFollowsModal] = useState<"followers" | "following" | null>(null);
  const [followsList, setFollowsList] = useState<FollowUser[]>([]);
  const [followsLoading, setFollowsLoading] = useState(false);
  const [actioningUser, setActioningUser] = useState<string | null>(null);

  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cropSaving, setCropSaving] = useState(false);
  const [cropError, setCropError] = useState<string | null>(null);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportSubmitting, setReportSubmitting] = useState(false);
  const [reportDone, setReportDone] = useState(false);

  const [notifOpen, setNotifOpen] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [followNotifs, setFollowNotifs] = useState<FollowNotif[]>([]);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      apiFetch<Profile>(`/api/users/${username}`),
      apiFetch<Post[]>(`/api/users/${username}/posts`),
      apiFetch<UserClub[]>(`/api/users/${username}/clubs`),
    ])
      .then(([p, userPosts, userClubs]) => {
        setProfile(p);
        setPosts(userPosts);
        setClubs(userClubs);
        setEditUsername(p.username);
        setEditName(p.display_name);
        setEditBio(p.bio ?? "");
        setEditFaculty((p.faculty as Faculty) ?? "");
        setEditProgram(p.program ?? "");
        if (p.is_own_profile) {
          Promise.all([
            apiFetch<Invitation[]>("/api/clubs/invitations/me"),
            apiFetch<{ total: number; notifications: FollowNotif[] }>("/api/notifications"),
          ]).then(([invs, notifData]) => {
            setInvitations(invs);
            setFollowNotifs(notifData.notifications);
          }).catch(() => {});
        }
      })
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
        else if (err instanceof ApiError && err.status === 404) router.replace("/feed");
      })
      .finally(() => setLoading(false));
  }, [username, router]);

  async function handleAcceptInvite(slug: string) {
    try {
      await apiFetch(`/api/clubs/${slug}/invitations/accept`, { method: "POST" });
      setInvitations((prev) => prev.filter((i) => i.club_slug !== slug));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not accept invitation.");
    }
  }

  async function handleDeclineInvite(slug: string) {
    try {
      await apiFetch(`/api/clubs/${slug}/invitations/decline`, { method: "DELETE" });
      setInvitations((prev) => prev.filter((i) => i.club_slug !== slug));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not decline invitation.");
    }
  }

  async function openFollowsModal(type: "followers" | "following") {
    setFollowsModal(type);
    setFollowsList([]);
    setFollowsLoading(true);
    try {
      const data = await apiFetch<FollowUser[]>(`/api/users/${username}/${type}`);
      setFollowsList(data);
    } catch { /* ignore */ }
    finally { setFollowsLoading(false); }
  }

  async function handleUnfollow(targetUsername: string) {
    setActioningUser(targetUsername);
    try {
      await apiFetch(`/api/users/${targetUsername}/follow`, { method: "DELETE" });
      setFollowsList((prev) => prev.filter((u) => u.username !== targetUsername));
      setProfile((prev) => prev ? { ...prev, following_count: prev.following_count - 1 } : prev);
    } catch { /* ignore */ }
    finally { setActioningUser(null); }
  }

  async function handleRemoveFollower(followerUsername: string) {
    setActioningUser(followerUsername);
    try {
      await apiFetch(`/api/users/me/followers/${followerUsername}`, { method: "DELETE" });
      setFollowsList((prev) => prev.filter((u) => u.username !== followerUsername));
      setProfile((prev) => prev ? { ...prev, follower_count: prev.follower_count - 1 } : prev);
    } catch { /* ignore */ }
    finally { setActioningUser(null); }
  }

  function handleAvatarFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (avatarInputRef.current) avatarInputRef.current.value = "";
    const reader = new FileReader();
    reader.onload = () => {
      setCropSrc(reader.result as string);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setCroppedAreaPixels(null);
      setCropError(null);
    };
    reader.readAsDataURL(file);
  }

  async function handleCropSave() {
    if (!cropSrc || !croppedAreaPixels || !profile) return;
    setCropSaving(true);
    setCropError(null);
    try {
      const blob = await getCroppedBlob(cropSrc, croppedAreaPixels);
      const fd = new FormData();
      fd.append("file", blob, "avatar.jpg");
      const uploadRes = await fetch("/api/upload", { method: "POST", credentials: "include", body: fd });
      if (!uploadRes.ok) throw new Error("Upload failed");
      const { url } = await uploadRes.json() as { url: string };
      const updated = await apiFetch<{ avatar_url: string | null }>("/api/users/me", {
        method: "PUT",
        body: JSON.stringify({
          display_name: profile.display_name,
          bio: profile.bio ?? "",
          faculty: profile.faculty ?? null,
          program: profile.program ?? null,
          avatar_url: url,
        }),
      });
      setProfile((prev) => prev ? { ...prev, avatar_url: updated.avatar_url ?? null } : prev);
      setCropSrc(null);
    } catch (err: unknown) {
      setCropError(err instanceof Error ? err.message : "Failed to save photo.");
    } finally {
      setCropSaving(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!editName.trim()) return;
    setSaving(true);
    setSaveError(null);
    try {
      const updated = await apiFetch<{
        username: string; display_name: string; bio: string | null;
        faculty: string | null; program: string | null;
        username_changed: boolean; username_changed_at: string | null;
      }>("/api/users/me", {
        method: "PUT",
        body: JSON.stringify({
          username: editUsername.trim() || undefined,
          display_name: editName.trim(),
          bio: editBio.trim(),
          faculty: editFaculty || null,
          program: editProgram.trim() || null,
        }),
      });
      setProfile((prev) => prev ? {
        ...prev,
        username: updated.username,
        display_name: updated.display_name,
        bio: updated.bio,
        faculty: updated.faculty,
        program: updated.program,
        username_changed_at: updated.username_changed_at,
      } : prev);
      setEditing(false);
      if (updated.username_changed) router.replace(`/profile/${updated.username}`);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    await apiFetch("/api/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  async function handleMessage() {
    if (!profile) return;
    try {
      const data = await apiFetch<{ conversation_id: string }>("/api/messages/open", {
        method: "POST",
        body: JSON.stringify({ username: profile.username }),
      });
      router.push(`/messages/${data.conversation_id}`);
    } catch { /* ignore */ }
  }

  async function handleFollow() {
    if (!profile || followLoading) return;
    setFollowLoading(true);
    try {
      if (profile.is_following) {
        await apiFetch(`/api/users/${profile.username}/follow`, { method: "DELETE" });
        setProfile((prev) => prev ? { ...prev, is_following: false, follower_count: prev.follower_count - 1 } : prev);
      } else {
        await apiFetch(`/api/users/${profile.username}/follow`, { method: "POST" });
        setProfile((prev) => prev ? { ...prev, is_following: true, follower_count: prev.follower_count + 1 } : prev);
      }
    } catch { /* ignore */ }
    finally { setFollowLoading(false); }
  }

  async function handleReport(e: React.FormEvent) {
    e.preventDefault();
    if (!profile || reportSubmitting) return;
    setReportSubmitting(true);
    try {
      await apiFetch(`/api/users/${profile.username}/report`, {
        method: "POST",
        body: JSON.stringify({ reason: reportReason }),
      });
      setReportDone(true);
      setTimeout(() => { setReportOpen(false); setReportDone(false); setReportReason(""); }, 2000);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not submit report.");
    } finally {
      setReportSubmitting(false);
    }
  }

  if (loading) {
    return (
      <main className="max-w-xl mx-auto px-4 pt-12 pb-36 flex justify-center">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </main>
    );
  }
  if (!profile) return null;

  const usernameNextAllowed = profile.username_changed_at
    ? new Date(new Date(profile.username_changed_at).getTime() + 30 * 24 * 60 * 60 * 1000)
    : null;
  const usernameLocked = usernameNextAllowed !== null && usernameNextAllowed > new Date();

  const unreadFollows = followNotifs.filter((n) => !n.is_read).length;
  const totalUnread = invitations.length + unreadFollows;

  function openBell() {
    setNotifOpen(true);
    if (unreadFollows > 0) {
      apiFetch("/api/notifications/mark-read", { method: "POST" })
        .then(() => setFollowNotifs((prev) => prev.map((n) => ({ ...n, is_read: true }))))
        .catch(() => {});
    }
  }

  return (
    <>
      <main className="max-w-xl mx-auto px-4 pt-4 pb-36">

        {/* Profile header card */}
        <div className="bg-white border border-border rounded-xl shadow-sm p-4 mb-4">
          <div className="flex items-start gap-4">
            {/* Avatar */}
            <div className="relative flex-shrink-0">
              <MiniAvatar name={profile.display_name} url={profile.avatar_url} size={72} />
              {profile.is_own_profile && (
                <>
                  <button
                    onClick={() => avatarInputRef.current?.click()}
                    className="absolute bottom-0 right-0 w-6 h-6 rounded-full bg-foreground text-background border-2 border-white flex items-center justify-center hover:bg-foreground/80 transition-colors"
                    title="Change photo"
                  >
                    <Camera className="w-3 h-3" />
                  </button>
                  <input
                    ref={avatarInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleAvatarFileChange}
                  />
                </>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <h1 className="text-lg font-bold text-foreground leading-tight">{profile.display_name}</h1>
              <p className="text-sm text-muted-foreground mb-1">@{profile.username}</p>
              {profile.faculty && !editing && (
                <p className="text-xs font-medium text-foreground/70 mb-1">
                  {profile.faculty} · {profile.program ?? FACULTY_NAMES[profile.faculty as Faculty]}
                </p>
              )}
              {profile.bio && !editing && (
                <p className="text-sm text-foreground/80 leading-snug whitespace-pre-wrap mb-1">{profile.bio}</p>
              )}
              <p className="text-[11px] text-muted-foreground">Joined {memberSince(profile.member_since)}</p>
            </div>

            {/* Notification bell — own profile only */}
            {profile.is_own_profile && (
              <div className="relative flex-shrink-0">
                <button
                  onClick={() => notifOpen ? setNotifOpen(false) : openBell()}
                  className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors relative"
                >
                  <Bell className="w-5 h-5" />
                  {totalUnread > 0 && (
                    <span className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-destructive text-white text-[10px] font-bold flex items-center justify-center border border-white">
                      {totalUnread > 9 ? "9+" : totalUnread}
                    </span>
                  )}
                </button>

                {notifOpen && (
                  <>
                    <div onClick={() => setNotifOpen(false)} className="fixed inset-0 z-[199]" />
                    <div className="absolute right-0 top-[calc(100%+6px)] w-[min(340px,90vw)] bg-white border border-border rounded-xl shadow-xl z-[200] overflow-hidden max-h-[70vh] flex flex-col">
                      <div className="px-4 py-2.5 font-semibold text-sm border-b border-border sticky top-0 bg-white flex-shrink-0">
                        Notifications
                      </div>
                      <div className="overflow-y-auto flex-1">
                        {invitations.length === 0 && followNotifs.length === 0 ? (
                          <p className="text-muted-foreground text-sm text-center py-6">No notifications</p>
                        ) : (
                          <>
                            {followNotifs.map((n) => (
                              <div
                                key={n.id}
                                className={cn(
                                  "flex items-center gap-2.5 px-4 py-3 border-b border-border/50 text-sm",
                                  !n.is_read && "bg-primary/5"
                                )}
                              >
                                <MiniAvatar name={n.actor_display_name} url={n.actor_avatar_url} size={34} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm leading-snug">
                                    <Link href={`/profile/${n.actor_username}`} onClick={() => setNotifOpen(false)} className="font-semibold text-foreground no-underline hover:underline">
                                      {n.actor_display_name}
                                    </Link>
                                    {" started following you"}
                                  </p>
                                  <p className="text-[11px] text-muted-foreground mt-0.5">{timeAgo(n.created_at)}</p>
                                </div>
                                {!n.is_read && <span className="w-2 h-2 rounded-full bg-destructive flex-shrink-0" />}
                              </div>
                            ))}
                            {invitations.map((inv) => (
                              <div key={inv.club_slug} className="px-4 py-3 border-b border-border/50">
                                <p className="text-sm mb-2">
                                  <strong>{inv.invited_by_display_name}</strong> invited you to join{" "}
                                  <strong>{inv.club_name}</strong>
                                </p>
                                <div className="flex items-center gap-2">
                                  <Button size="sm" onClick={() => handleAcceptInvite(inv.club_slug)}>Accept</Button>
                                  <Button size="sm" variant="outline" onClick={() => handleDeclineInvite(inv.club_slug)}>Decline</Button>
                                  <Link href={`/clubs/${inv.club_slug}`} onClick={() => setNotifOpen(false)} className="text-xs text-muted-foreground hover:text-foreground no-underline ml-1">
                                    View →
                                  </Link>
                                </div>
                              </div>
                            ))}
                          </>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Stats row */}
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/60 text-sm">
            <span><strong className="text-foreground">{profile.post_count}</strong> <span className="text-muted-foreground">posts</span></span>
            <span><strong className="text-foreground">{profile.club_count}</strong> <span className="text-muted-foreground">clubs</span></span>
            <button onClick={() => openFollowsModal("followers")} className="bg-transparent border-0 p-0 cursor-pointer text-sm">
              <strong className="text-foreground">{profile.follower_count}</strong> <span className="text-muted-foreground">followers</span>
            </button>
            <button onClick={() => openFollowsModal("following")} className="bg-transparent border-0 p-0 cursor-pointer text-sm">
              <strong className="text-foreground">{profile.following_count}</strong> <span className="text-muted-foreground">following</span>
            </button>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-3">
            {profile.is_own_profile ? (
              <>
                <Button
                  size="sm"
                  variant={editing ? "outline" : "default"}
                  onClick={() => {
                    if (!editing && profile) {
                      setEditUsername(profile.username);
                      setEditName(profile.display_name);
                      setEditBio(profile.bio ?? "");
                      setEditFaculty((profile.faculty as Faculty) ?? "");
                      setEditProgram(profile.program ?? "");
                    }
                    setEditing((v) => !v);
                    setSaveError(null);
                  }}
                  className="flex items-center gap-1.5"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  {editing ? "Cancel" : "Edit profile"}
                </Button>
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors ml-1"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Log out
                </button>
              </>
            ) : (
              <>
                <Button
                  size="sm"
                  variant={profile.is_following ? "outline" : "default"}
                  onClick={handleFollow}
                  disabled={followLoading}
                >
                  {profile.is_following ? "Following" : "Follow"}
                </Button>
                <Button size="sm" variant="outline" onClick={handleMessage}>
                  Message
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setReportOpen(true); setReportDone(false); setReportReason(""); }}
                  className="text-destructive border-destructive/30 hover:bg-destructive/5 ml-auto"
                >
                  Report
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Edit form */}
        {editing && (
          <div className="bg-white border border-border rounded-xl shadow-sm p-4 mb-4">
            <form onSubmit={handleSave} className="flex flex-col gap-3">
              <div>
                <label className="block text-xs font-medium text-foreground mb-1">
                  Username
                  {usernameLocked && usernameNextAllowed && (
                    <span className="ml-2 text-[11px] text-amber-500 font-normal">
                      (can change again on {usernameNextAllowed.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" })})
                    </span>
                  )}
                </label>
                <input
                  value={editUsername}
                  onChange={(e) => setEditUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ""))}
                  disabled={usernameLocked}
                  maxLength={30}
                  placeholder="letters, numbers, underscores"
                  className="w-full h-9 px-3 text-sm border border-input rounded-lg bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50"
                />
                {!usernameLocked && (
                  <p className="text-[11px] text-muted-foreground mt-1">3–30 characters · letters, numbers, underscores only · changes locked for 30 days</p>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Display name</label>
                <input
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  maxLength={100}
                  className="w-full h-9 px-3 text-sm border border-input rounded-lg bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Bio</label>
                <textarea
                  value={editBio}
                  onChange={(e) => setEditBio(e.target.value)}
                  rows={3}
                  maxLength={300}
                  placeholder="Tell people a bit about yourself…"
                  className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
                <p className="text-[11px] text-muted-foreground text-right">{editBio.length}/300</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-foreground mb-1">Faculty</label>
                <select
                  value={editFaculty}
                  onChange={(e) => { setEditFaculty(e.target.value as Faculty | ""); setEditProgram(""); }}
                  className="w-full h-9 px-3 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                >
                  <option value="">Not specified</option>
                  {FACULTIES.map((f) => (
                    <option key={f} value={f}>{f} — {FACULTY_NAMES[f]}</option>
                  ))}
                </select>
              </div>

              {editFaculty && (
                <div>
                  <label className="block text-xs font-medium text-foreground mb-1">Program</label>
                  <select
                    value={editProgram}
                    onChange={(e) => setEditProgram(e.target.value)}
                    className="w-full h-9 px-3 text-sm border border-input rounded-lg bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    <option value="">Select program</option>
                    {FACULTY_PROGRAMS[editFaculty].map((p) => (
                      <option key={p} value={p}>{p}</option>
                    ))}
                  </select>
                </div>
              )}

              {saveError && <p className="text-xs text-destructive">{saveError}</p>}

              <Button
                type="submit"
                size="sm"
                disabled={saving || !editName.trim() || editUsername.trim().length < 3}
                className="self-start flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                {saving ? "Saving…" : "Save changes"}
              </Button>
            </form>
          </div>
        )}

        {/* Clubs */}
        {clubs.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Clubs</p>
            <div className="flex flex-col gap-1.5">
              {clubs.map((club) => (
                <Link
                  key={club.id}
                  href={`/clubs/${club.slug}`}
                  className="flex items-center justify-between px-3.5 py-2.5 bg-white border border-border rounded-xl hover:bg-muted/40 transition-colors no-underline"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="font-medium text-sm text-foreground truncate">{club.name}</span>
                    {club.is_private && (
                      <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground flex-shrink-0">
                        <Lock className="w-2.5 h-2.5" />
                        Private
                      </span>
                    )}
                  </div>
                  <span className={cn(
                    "text-[10px] font-semibold px-1.5 py-0.5 rounded flex-shrink-0 capitalize",
                    club.role === "owner" ? "bg-purple-100 text-purple-700"
                      : club.role === "moderator" ? "bg-green-100 text-green-700"
                      : "bg-muted text-muted-foreground"
                  )}>
                    {club.role}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* Posts */}
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Posts</p>
        {posts.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">No posts yet.</p>
        )}
        <div className="flex flex-col gap-3">
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/feed/${post.id}`}
              className="block bg-white border border-border rounded-xl px-4 py-3 hover:bg-muted/20 transition-colors no-underline"
            >
              {post.faculty_tag && (
                <span className="inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground mb-2">
                  {post.faculty_tag}
                </span>
              )}
              <ImageGrid urls={post.image_urls ?? []} />
              {post.content && (
                <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap mb-2">{post.content}</p>
              )}
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span className="flex items-center gap-0.5"><ChevronUp className="w-3.5 h-3.5" />{post.upvotes}</span>
                <span className="flex items-center gap-0.5"><ChevronDown className="w-3.5 h-3.5" />{post.downvotes}</span>
                <span className="flex items-center gap-0.5"><MessageCircle className="w-3.5 h-3.5" />{post.reply_count}</span>
                <span className="ml-auto">{timeAgo(post.created_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      </main>

      {/* ── Report modal ──────────────────────────────────────────────────────── */}
      {reportOpen && (
        <>
          <div onClick={() => setReportOpen(false)} className="fixed inset-0 bg-black/45 backdrop-blur-sm z-[300]" />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(420px,92vw)] bg-white rounded-2xl shadow-2xl z-[301] p-6">
            <div className="flex items-center justify-between mb-1">
              <h3 className="font-bold text-base text-foreground">Report @{profile?.username}</h3>
              <button onClick={() => setReportOpen(false)} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-muted-foreground mb-4">Describe the issue. Minimum 10 characters.</p>
            {reportDone ? (
              <p className="text-green-600 font-semibold text-center py-4">Report submitted. Thank you.</p>
            ) : (
              <form onSubmit={handleReport} className="flex flex-col gap-3">
                <textarea
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                  placeholder="e.g. Harassment, spam, impersonation…"
                  rows={4}
                  maxLength={500}
                  className="w-full px-3 py-2 text-sm border border-input rounded-lg bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setReportOpen(false)}>Cancel</Button>
                  <Button
                    type="submit"
                    size="sm"
                    variant="destructive"
                    disabled={reportReason.trim().length < 10 || reportSubmitting}
                  >
                    {reportSubmitting ? "Submitting…" : "Submit report"}
                  </Button>
                </div>
              </form>
            )}
          </div>
        </>
      )}

      {/* ── Crop modal (full-screen) ───────────────────────────────────────── */}
      {cropSrc && (
        <div className="fixed inset-0 z-[300] flex flex-col bg-black">
          <div className="flex items-center justify-between px-4 py-3 bg-black/90 flex-shrink-0">
            <button
              onClick={() => setCropSrc(null)}
              className="text-white/80 hover:text-white text-sm px-2 py-1 rounded transition-colors"
            >
              Cancel
            </button>
            <span className="text-white font-semibold text-sm">Crop photo</span>
            <button
              onClick={handleCropSave}
              disabled={cropSaving || !croppedAreaPixels}
              className="bg-white text-black font-semibold text-sm px-3 py-1 rounded-lg disabled:opacity-50 hover:bg-white/90 transition-colors"
            >
              {cropSaving ? "Saving…" : "Save"}
            </button>
          </div>

          <div className="relative flex-1">
            <Cropper
              image={cropSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_: Area, pixels: Area) => setCroppedAreaPixels(pixels)}
            />
          </div>

          <div className="bg-black/90 px-6 pt-3 pb-6 flex-shrink-0">
            <div className="flex items-center gap-3 max-w-sm mx-auto">
              <span className="text-white/50 text-sm select-none">−</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1 accent-white"
              />
              <span className="text-white/50 text-sm select-none">+</span>
            </div>
            {cropError && <p className="text-red-400 text-center text-sm mt-2">{cropError}</p>}
            <p className="text-white/30 text-center text-xs mt-2">Drag to reposition · pinch or slide to zoom</p>
          </div>
        </div>
      )}

      {/* ── Followers / Following modal ────────────────────────────────────── */}
      {followsModal && (
        <>
          <div onClick={() => setFollowsModal(null)} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[200]" />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(360px,92vw)] bg-white rounded-2xl shadow-2xl z-[201] flex flex-col max-h-[65vh]">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
              <span className="font-semibold text-sm capitalize">
                {followsModal} · {followsModal === "followers" ? profile.follower_count : profile.following_count}
              </span>
              <button onClick={() => setFollowsModal(null)} className="text-muted-foreground hover:text-foreground p-1 rounded-lg hover:bg-muted transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              {followsLoading && <p className="text-muted-foreground text-sm text-center py-6">Loading…</p>}
              {!followsLoading && followsList.length === 0 && (
                <p className="text-muted-foreground text-sm text-center py-6">No {followsModal} yet.</p>
              )}
              {followsList.map((u) => (
                <div key={u.username} className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50">
                  <Link
                    href={`/profile/${u.username}`}
                    onClick={() => setFollowsModal(null)}
                    className="flex items-center gap-2.5 flex-1 min-w-0 no-underline"
                  >
                    <MiniAvatar name={u.display_name} url={u.avatar_url} size={38} />
                    <div className="min-w-0">
                      <p className="font-medium text-sm text-foreground truncate">{u.display_name}</p>
                      <p className="text-[11px] text-muted-foreground">@{u.username}</p>
                    </div>
                  </Link>
                  {profile.is_own_profile && (
                    followsModal === "following" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleUnfollow(u.username)}
                        disabled={actioningUser === u.username}
                        className="flex-shrink-0"
                      >
                        {actioningUser === u.username ? "…" : "Unfollow"}
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleRemoveFollower(u.username)}
                        disabled={actioningUser === u.username}
                        className="flex-shrink-0"
                      >
                        {actioningUser === u.username ? "…" : "Remove"}
                      </Button>
                    )
                  )}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
