"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";
import { apiFetch, ApiError } from "@/lib/api";
import { ImageGrid } from "@/components/ImageGrid";
import { FACULTIES, FACULTY_NAMES, FACULTY_PROGRAMS, Faculty } from "@/lib/faculties";

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

// ── helpers ───────────────────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function memberSince(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

function Avatar({ name, avatarUrl, size = 72 }: { name: string; avatarUrl?: string | null; size?: number }) {
  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover", flexShrink: 0, display: "block" }}
      />
    );
  }
  const letter = (name || "?")[0].toUpperCase();
  return (
    <div style={{
      width: size, height: size, borderRadius: "50%",
      background: "#111", color: "#fff",
      display: "flex", alignItems: "center", justifyContent: "center",
      fontSize: size * 0.4, fontWeight: "bold", flexShrink: 0,
    }}>
      {letter}
    </div>
  );
}

// ── canvas crop ───────────────────────────────────────────────────────────────

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

  ctx.drawImage(
    image,
    pixelCrop.x, pixelCrop.y,
    pixelCrop.width, pixelCrop.height,
    0, 0,
    OUTPUT, OUTPUT,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Canvas is empty"))),
      "image/jpeg",
      0.92,
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

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editUsername, setEditUsername] = useState("");
  const [editName, setEditName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editFaculty, setEditFaculty] = useState<Faculty | "">("");
  const [editProgram, setEditProgram] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Followers / following modal
  const [followsModal, setFollowsModal] = useState<"followers" | "following" | null>(null);
  const [followsList, setFollowsList] = useState<FollowUser[]>([]);
  const [followsLoading, setFollowsLoading] = useState(false);
  const [actioningUser, setActioningUser] = useState<string | null>(null);

  // Avatar crop
  const [cropSrc, setCropSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const [cropSaving, setCropSaving] = useState(false);
  const [cropError, setCropError] = useState<string | null>(null);

  // Notifications
  const [notifOpen, setNotifOpen] = useState(false);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [followNotifs, setFollowNotifs] = useState<{
    id: string; actor_username: string; actor_display_name: string;
    actor_avatar_url: string | null; is_read: boolean; created_at: string;
  }[]>([]);

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
            apiFetch<typeof followNotifs>("/api/notifications"),
          ]).then(([invs, notifs]) => {
            setInvitations(invs);
            setFollowNotifs(notifs);
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

  // Step 1: pick file → read as data URL → open crop modal
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

  // Step 2: crop confirmed → canvas → upload → save
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
        username: string;
        display_name: string;
        bio: string | null;
        faculty: string | null;
        program: string | null;
        username_changed: boolean;
        username_changed_at: string | null;
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
      if (updated.username_changed) {
        router.replace(`/profile/${updated.username}`);
      }
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

  if (loading) return <p style={{ padding: "2rem", color: "#888" }}>Loading…</p>;
  if (!profile) return null;

  const usernameNextAllowed = profile.username_changed_at
    ? new Date(new Date(profile.username_changed_at).getTime() + 30 * 24 * 60 * 60 * 1000)
    : null;
  const usernameLocked = usernameNextAllowed !== null && usernameNextAllowed > new Date();

  return (
    <>
      <main style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem 1rem 2rem" }}>

        {/* Profile header */}
        <div style={{ display: "flex", gap: "1.25rem", alignItems: "flex-start", marginBottom: "1.25rem", position: "relative" }}>
          {/* Avatar — own profile shows edit button */}
          <div style={{ position: "relative", flexShrink: 0 }}>
            <Avatar name={profile.display_name} avatarUrl={profile.avatar_url} size={72} />
            {profile.is_own_profile && (
              <>
                <button
                  onClick={() => avatarInputRef.current?.click()}
                  style={{
                    position: "absolute", bottom: -2, right: -2,
                    width: 22, height: 22, borderRadius: "50%",
                    background: "#111", color: "#fff", border: "2px solid #fff",
                    cursor: "pointer", fontSize: "0.7rem",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    padding: 0,
                  }}
                  title="Change photo"
                >
                  ✎
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: "none" }}
                  onChange={handleAvatarFileChange}
                />
              </>
            )}
          </div>

          <div style={{ flex: 1 }}>
            <h1 style={{ margin: "0 0 0.1rem", fontSize: "1.25rem" }}>{profile.display_name}</h1>
            <p style={{ margin: "0 0 0.25rem", color: "#888", fontSize: "0.9rem" }}>@{profile.username}</p>
            {profile.faculty && !editing && (
              <p style={{ margin: "0 0 0.25rem", fontSize: "0.85rem", color: "#555", fontWeight: 500 }}>
                {profile.faculty} · {profile.program ?? FACULTY_NAMES[profile.faculty as Faculty]}
              </p>
            )}
            {profile.bio && !editing && (
              <p style={{ margin: "0 0 0.4rem", fontSize: "0.9rem", lineHeight: 1.4, whiteSpace: "pre-wrap" }}>
                {profile.bio}
              </p>
            )}
            <p style={{ margin: 0, fontSize: "0.78rem", color: "#bbb" }}>
              Joined {memberSince(profile.member_since)}
            </p>
          </div>

          {/* Notification bell — own profile only */}
          {profile.is_own_profile && (() => {
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
            <div style={{ position: "relative", flexShrink: 0 }}>
              <button
                onClick={() => notifOpen ? setNotifOpen(false) : openBell()}
                style={{ background: "none", border: "none", cursor: "pointer", padding: "0.25rem", fontSize: "1.3rem", position: "relative", lineHeight: 1 }}
                title="Notifications"
              >
                🔔
                {totalUnread > 0 && (
                  <span style={{ position: "absolute", top: 0, right: 0, width: 16, height: 16, borderRadius: "50%", background: "crimson", color: "#fff", fontSize: "0.65rem", fontWeight: 700, display: "flex", alignItems: "center", justifyContent: "center", lineHeight: 1 }}>
                    {totalUnread}
                  </span>
                )}
              </button>

              {notifOpen && (
                <>
                  <div onClick={() => setNotifOpen(false)} style={{ position: "fixed", inset: 0, zIndex: 199 }} />
                  <div style={{ position: "absolute", right: 0, top: "calc(100% + 6px)", width: "min(340px, 90vw)", background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, boxShadow: "0 6px 24px rgba(0,0,0,0.13)", zIndex: 200, overflow: "hidden", maxHeight: "70vh", overflowY: "auto" }}>
                    <div style={{ padding: "0.65rem 1rem", fontWeight: 700, fontSize: "0.9rem", borderBottom: "1px solid #f0f0f0", position: "sticky", top: 0, background: "#fff" }}>Notifications</div>
                    {invitations.length === 0 && followNotifs.length === 0 ? (
                      <p style={{ margin: 0, padding: "1.25rem", color: "#aaa", fontSize: "0.88rem", textAlign: "center" }}>No notifications</p>
                    ) : (
                      <>
                        {followNotifs.map((n) => (
                          <div key={n.id} style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #f5f5f5", background: n.is_read ? "#fff" : "#f8f8ff", display: "flex", alignItems: "center", gap: "0.65rem" }}>
                            {n.actor_avatar_url ? (
                              <img src={n.actor_avatar_url} alt="" style={{ width: 34, height: 34, borderRadius: "50%", objectFit: "cover", flexShrink: 0 }} />
                            ) : (
                              <div style={{ width: 34, height: 34, borderRadius: "50%", background: "#e0e0e0", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "1rem", flexShrink: 0 }}>
                                {n.actor_display_name[0]?.toUpperCase()}
                              </div>
                            )}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <p style={{ margin: 0, fontSize: "0.88rem" }}>
                                <Link href={`/profile/${n.actor_username}`} onClick={() => setNotifOpen(false)} style={{ fontWeight: 600, color: "#111", textDecoration: "none" }}>{n.actor_display_name}</Link>
                                {" started following you"}
                              </p>
                              <p style={{ margin: "0.1rem 0 0", fontSize: "0.75rem", color: "#aaa" }}>{timeAgo(n.created_at)}</p>
                            </div>
                            {!n.is_read && <span style={{ width: 8, height: 8, borderRadius: "50%", background: "crimson", flexShrink: 0 }} />}
                          </div>
                        ))}
                        {invitations.map((inv) => (
                          <div key={inv.club_slug} style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #f5f5f5" }}>
                            <p style={{ margin: "0 0 0.35rem", fontSize: "0.88rem" }}>
                              <strong>{inv.invited_by_display_name}</strong> invited you to join <strong>{inv.club_name}</strong>
                            </p>
                            <div style={{ display: "flex", gap: "0.5rem" }}>
                              <button onClick={() => handleAcceptInvite(inv.club_slug)} style={{ padding: "0.2rem 0.7rem", fontSize: "0.8rem", cursor: "pointer", color: "#1a6b3a", border: "1px solid #1a6b3a", background: "none", borderRadius: 4 }}>Accept</button>
                              <button onClick={() => handleDeclineInvite(inv.club_slug)} style={{ padding: "0.2rem 0.7rem", fontSize: "0.8rem", cursor: "pointer", color: "#888", border: "1px solid #ccc", background: "none", borderRadius: 4 }}>Decline</button>
                              <Link href={`/clubs/${inv.club_slug}`} onClick={() => setNotifOpen(false)} style={{ padding: "0.2rem 0.5rem", fontSize: "0.8rem", color: "#555", textDecoration: "none", alignSelf: "center" }}>View →</Link>
                            </div>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </>
              )}
            </div>
            );
          })()}
        </div>

        {/* Stats row */}
        <div style={{ display: "flex", gap: "1.5rem", marginBottom: "1.25rem", fontSize: "0.9rem" }}>
          <span><strong>{profile.post_count}</strong> <span style={{ color: "#888" }}>posts</span></span>
          <span><strong>{profile.club_count}</strong> <span style={{ color: "#888" }}>clubs</span></span>
          <button
            onClick={() => openFollowsModal("followers")}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "0.9rem" }}
          >
            <strong>{profile.follower_count}</strong> <span style={{ color: "#888" }}>followers</span>
          </button>
          <button
            onClick={() => openFollowsModal("following")}
            style={{ background: "none", border: "none", cursor: "pointer", padding: 0, fontSize: "0.9rem" }}
          >
            <strong>{profile.following_count}</strong> <span style={{ color: "#888" }}>following</span>
          </button>
        </div>

        {/* Action buttons */}
        {profile.is_own_profile ? (
          <div style={{ display: "flex", gap: "0.6rem", marginBottom: "1.5rem", alignItems: "center" }}>
            <button
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
              style={{ padding: "0.45rem 1.1rem", borderRadius: 6, border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontSize: "0.9rem" }}
            >
              {editing ? "Cancel" : "Edit profile"}
            </button>
            <button
              onClick={handleLogout}
              style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: "0.85rem", padding: 0 }}
            >
              Log out
            </button>
          </div>
        ) : (
          <div style={{ display: "flex", gap: "0.6rem", marginBottom: "1.5rem" }}>
            <button
              onClick={handleFollow}
              disabled={followLoading}
              style={{
                padding: "0.45rem 1.1rem", borderRadius: 6, fontSize: "0.9rem", cursor: "pointer",
                border: profile.is_following ? "1px solid #ccc" : "none",
                background: profile.is_following ? "#fff" : "#111",
                color: profile.is_following ? "#111" : "#fff",
              }}
            >
              {profile.is_following ? "Following" : "Follow"}
            </button>
            <button
              onClick={handleMessage}
              style={{ padding: "0.45rem 1.1rem", borderRadius: 6, border: "1px solid #ccc", background: "#fff", cursor: "pointer", fontSize: "0.9rem" }}
            >
              Message
            </button>
          </div>
        )}

        {/* Inline edit form */}
        {editing && (
          <form onSubmit={handleSave} style={{ marginBottom: "1.5rem", padding: "1rem", border: "1px solid #e0e0e0", borderRadius: 8, background: "#fafafa", display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", color: "#555" }}>
                Username
                {usernameLocked && usernameNextAllowed && (
                  <span style={{ marginLeft: "0.5rem", fontSize: "0.78rem", color: "#f0ad4e" }}>
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
                style={{ width: "100%", boxSizing: "border-box", padding: "0.45rem 0.6rem", fontSize: "0.95rem", border: "1px solid #ccc", borderRadius: 4, fontFamily: "inherit", opacity: usernameLocked ? 0.5 : 1 }}
              />
              {!usernameLocked && <span style={{ fontSize: "0.75rem", color: "#bbb" }}>3–30 characters · letters, numbers, underscores only · changes locked for 30 days after saving</span>}
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", color: "#555" }}>Display name</label>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                maxLength={100}
                style={{ width: "100%", boxSizing: "border-box", padding: "0.45rem 0.6rem", fontSize: "0.95rem", border: "1px solid #ccc", borderRadius: 4, fontFamily: "inherit" }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", color: "#555" }}>Bio</label>
              <textarea
                value={editBio}
                onChange={(e) => setEditBio(e.target.value)}
                rows={3}
                maxLength={300}
                placeholder="Tell people a bit about yourself…"
                style={{ width: "100%", boxSizing: "border-box", padding: "0.45rem 0.6rem", fontSize: "0.95rem", border: "1px solid #ccc", borderRadius: 4, fontFamily: "inherit", resize: "vertical" }}
              />
              <span style={{ fontSize: "0.75rem", color: "#bbb" }}>{editBio.length}/300</span>
            </div>
            <div>
              <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", color: "#555" }}>Faculty</label>
              <select
                value={editFaculty}
                onChange={(e) => { setEditFaculty(e.target.value as Faculty | ""); setEditProgram(""); }}
                style={{ width: "100%", boxSizing: "border-box", padding: "0.45rem 0.6rem", fontSize: "0.95rem", border: "1px solid #ccc", borderRadius: 4, fontFamily: "inherit" }}
              >
                <option value="">Not specified</option>
                {FACULTIES.map((f) => (
                  <option key={f} value={f}>{f} — {FACULTY_NAMES[f]}</option>
                ))}
              </select>
            </div>
            {editFaculty && (
              <div>
                <label style={{ display: "block", fontSize: "0.85rem", marginBottom: "0.25rem", color: "#555" }}>Program</label>
                <select
                  value={editProgram}
                  onChange={(e) => setEditProgram(e.target.value)}
                  style={{ width: "100%", boxSizing: "border-box", padding: "0.45rem 0.6rem", fontSize: "0.95rem", border: "1px solid #ccc", borderRadius: 4, fontFamily: "inherit" }}
                >
                  <option value="">Select program</option>
                  {FACULTY_PROGRAMS[editFaculty].map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>
            )}
            {saveError && <p style={{ margin: 0, color: "crimson", fontSize: "0.88rem" }}>{saveError}</p>}
            <button
              type="submit"
              disabled={saving || !editName.trim() || editUsername.trim().length < 3}
              style={{ alignSelf: "flex-start", padding: "0.45rem 1.1rem", borderRadius: 6, border: "none", background: "#111", color: "#fff", cursor: "pointer", fontSize: "0.9rem" }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </form>
        )}

        {/* Clubs */}
        {clubs.length > 0 && (
          <>
            <h3 style={{ margin: "0 0 0.6rem", color: "#444", fontSize: "1rem" }}>Clubs</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", marginBottom: "1.5rem" }}>
              {clubs.map((club) => (
                <Link
                  key={club.id}
                  href={`/clubs/${club.slug}`}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.6rem 0.85rem", border: "1px solid #e0e0e0", borderRadius: 8, background: "#fff", textDecoration: "none", color: "inherit" }}
                >
                  <div>
                    <span style={{ fontWeight: 500, fontSize: "0.95rem" }}>{club.name}</span>
                    {club.is_private && (
                      <span style={{ marginLeft: "0.4rem", fontSize: "0.72rem", color: "#888", background: "#f0f0f0", padding: "0.1rem 0.35rem", borderRadius: 4 }}>Private</span>
                    )}
                  </div>
                  <span style={{ fontSize: "0.78rem", color: "#aaa", textTransform: "capitalize" }}>{club.role}</span>
                </Link>
              ))}
            </div>
          </>
        )}

        {/* Posts */}
        <h3 style={{ margin: "0 0 0.75rem", color: "#444", fontSize: "1rem" }}>Posts</h3>
        {posts.length === 0 && <p style={{ color: "#aaa" }}>No posts yet.</p>}
        <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          {posts.map((post) => (
            <Link
              key={post.id}
              href={`/feed/${post.id}`}
              style={{ display: "block", border: "1px solid #e0e0e0", borderRadius: 8, padding: "0.85rem", background: "#fff", textDecoration: "none", color: "inherit" }}
            >
              {post.faculty_tag && (
                <span style={{ fontSize: "0.72rem", fontWeight: "bold", padding: "0.15rem 0.5rem", borderRadius: 12, background: "#f0f0f0", color: "#444", marginBottom: "0.5rem", display: "inline-block" }}>
                  {post.faculty_tag}
                </span>
              )}
              <ImageGrid urls={post.image_urls ?? []} />
              {post.content && (
                <p style={{ margin: "0 0 0.6rem", whiteSpace: "pre-wrap", lineHeight: 1.5, fontSize: "0.95rem" }}>{post.content}</p>
              )}
              <div style={{ display: "flex", gap: "1rem", alignItems: "center", fontSize: "0.85rem", color: "#888" }}>
                <span>▲ {post.upvotes}</span>
                <span>▼ {post.downvotes}</span>
                <span>💬 {post.reply_count}</span>
                <span style={{ marginLeft: "auto" }}>{timeAgo(post.created_at)}</span>
              </div>
            </Link>
          ))}
        </div>
      </main>

      {/* ── Crop modal ─────────────────────────────────────────────────────── */}
      {cropSrc && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", flexDirection: "column", background: "#000" }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.75rem 1rem", background: "#111", flexShrink: 0 }}>
            <button
              onClick={() => setCropSrc(null)}
              style={{ background: "none", border: "none", color: "#fff", cursor: "pointer", fontSize: "0.95rem", padding: "0.25rem 0.5rem" }}
            >
              Cancel
            </button>
            <span style={{ color: "#fff", fontWeight: 600, fontSize: "0.95rem" }}>Crop photo</span>
            <button
              onClick={handleCropSave}
              disabled={cropSaving || !croppedAreaPixels}
              style={{ background: "#fff", border: "none", color: "#111", fontWeight: 600, cursor: "pointer", fontSize: "0.92rem", padding: "0.3rem 0.85rem", borderRadius: 6, opacity: cropSaving ? 0.6 : 1 }}
            >
              {cropSaving ? "Saving…" : "Save"}
            </button>
          </div>

          {/* Crop area — takes all remaining vertical space */}
          <div style={{ position: "relative", flex: 1 }}>
            <Cropper
              image={cropSrc}
              crop={crop}
              zoom={zoom}
              aspect={1}
              cropShape="round"
              showGrid={false}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={(_croppedArea: Area, pixels: Area) => setCroppedAreaPixels(pixels)}
            />
          </div>

          {/* Zoom slider + hint */}
          <div style={{ background: "#111", padding: "0.75rem 1.5rem 1.25rem", flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", maxWidth: 400, margin: "0 auto" }}>
              <span style={{ color: "#888", fontSize: "0.8rem", userSelect: "none" }}>−</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.01}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                style={{ flex: 1, accentColor: "#fff" }}
              />
              <span style={{ color: "#888", fontSize: "0.8rem", userSelect: "none" }}>+</span>
            </div>
            {cropError && (
              <p style={{ color: "#ff6b6b", textAlign: "center", margin: "0.5rem 0 0", fontSize: "0.85rem" }}>{cropError}</p>
            )}
            <p style={{ color: "#555", textAlign: "center", margin: "0.4rem 0 0", fontSize: "0.78rem" }}>
              Drag to reposition · pinch or use slider to zoom
            </p>
          </div>
        </div>
      )}

      {/* ── Followers / Following overlay sheet ───────────────────────────── */}
      {followsModal && (
        <>
          <div
            onClick={() => setFollowsModal(null)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.35)", zIndex: 200 }}
          />
          <div style={{
            position: "fixed", top: "50%", left: "50%",
            transform: "translate(-50%, -50%)",
            background: "#fff", borderRadius: 12,
            zIndex: 201, maxHeight: "60vh", width: "min(340px, 90vw)",
            display: "flex", flexDirection: "column",
            boxShadow: "0 8px 32px rgba(0,0,0,0.18)",
          }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.85rem 1rem 0.6rem", borderBottom: "1px solid #f0f0f0", flexShrink: 0 }}>
              <span style={{ fontWeight: 600, fontSize: "1rem", textTransform: "capitalize" }}>
                {followsModal} · {followsModal === "followers" ? profile.follower_count : profile.following_count}
              </span>
              <button onClick={() => setFollowsModal(null)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: "1.4rem", color: "#999", lineHeight: 1, padding: "0 0.2rem" }}>×</button>
            </div>

            {/* Scrollable list */}
            <div style={{ overflowY: "auto", flex: 1 }}>
              {followsLoading && <p style={{ color: "#888", textAlign: "center", padding: "1.5rem" }}>Loading…</p>}
              {!followsLoading && followsList.length === 0 && (
                <p style={{ color: "#aaa", textAlign: "center", padding: "1.5rem" }}>No {followsModal} yet.</p>
              )}
              {followsList.map((u) => (
                <div key={u.username} style={{ display: "flex", alignItems: "center", gap: "0.75rem", padding: "0.65rem 1rem", borderBottom: "1px solid #f5f5f5" }}>
                  <Link
                    href={`/profile/${u.username}`}
                    onClick={() => setFollowsModal(null)}
                    style={{ display: "flex", alignItems: "center", gap: "0.75rem", textDecoration: "none", color: "inherit", flex: 1, minWidth: 0 }}
                  >
                    <Avatar name={u.display_name} avatarUrl={u.avatar_url} size={40} />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 500, fontSize: "0.93rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{u.display_name}</div>
                      <div style={{ fontSize: "0.8rem", color: "#888" }}>@{u.username}</div>
                    </div>
                  </Link>
                  {profile.is_own_profile && (
                    followsModal === "following" ? (
                      <button
                        onClick={() => handleUnfollow(u.username)}
                        disabled={actioningUser === u.username}
                        style={{ flexShrink: 0, padding: "0.3rem 0.8rem", borderRadius: 6, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: "0.8rem", color: "#333", opacity: actioningUser === u.username ? 0.5 : 1 }}
                      >
                        {actioningUser === u.username ? "…" : "Unfollow"}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleRemoveFollower(u.username)}
                        disabled={actioningUser === u.username}
                        style={{ flexShrink: 0, padding: "0.3rem 0.8rem", borderRadius: 6, border: "1px solid #ddd", background: "#fff", cursor: "pointer", fontSize: "0.8rem", color: "#333", opacity: actioningUser === u.username ? 0.5 : 1 }}
                      >
                        {actioningUser === u.username ? "…" : "Remove"}
                      </button>
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
