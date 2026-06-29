"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";

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

interface ClubListResponse {
  clubs: Club[];
  total: number;
}

interface Invitation {
  club_name: string;
  club_slug: string;
  invited_by_display_name: string;
  invited_by_username: string;
}

export default function ClubsPage() {
  const router = useRouter();
  const [clubs, setClubs] = useState<Club[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [loading, setLoading] = useState(true);

  // Create form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [joiningSlug, setJoiningSlug] = useState<string | null>(null);
  const [leavingSlug, setLeavingSlug] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      apiFetch<ClubListResponse>("/api/clubs"),
      apiFetch<Invitation[]>("/api/clubs/invitations/me"),
    ])
      .then(([clubData, inviteData]) => {
        setClubs(clubData.clubs);
        setInvitations(inviteData);
      })
      .catch(() => router.replace("/login"))
      .finally(() => setLoading(false));
  }, [router]);

  async function handleAcceptInvite(slug: string) {
    try {
      await apiFetch(`/api/clubs/${slug}/invitations/accept`, { method: "POST" });
      setInvitations((prev) => prev.filter((i) => i.club_slug !== slug));
      const updated = await apiFetch<ClubListResponse>("/api/clubs");
      setClubs(updated.clubs);
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

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    setFormError(null);
    try {
      const newClub = await apiFetch<Club>("/api/clubs", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), description: description.trim(), is_private: isPrivate }),
      });
      setClubs((prev) => [newClub, ...prev]);
      setName("");
      setDescription("");
      setIsPrivate(false);
      setShowForm(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : "Failed to create club.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin(slug: string) {
    setJoiningSlug(slug);
    try {
      const updated = await apiFetch<Club>(`/api/clubs/${slug}/join`, { method: "POST" });
      setClubs((prev) => prev.map((c) => (c.slug === slug ? updated : c)));
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not join club.");
    } finally {
      setJoiningSlug(null);
    }
  }

  async function handleLeave(slug: string) {
    setLeavingSlug(slug);
    try {
      await apiFetch(`/api/clubs/${slug}/leave`, { method: "DELETE" });
      setClubs((prev) =>
        prev.map((c) =>
          c.slug === slug
            ? { ...c, is_member: false, role: null, member_count: c.member_count - 1 }
            : c
        )
      );
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not leave club.");
    } finally {
      setLeavingSlug(null);
    }
  }

  const inputStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: "0.5rem 0.6rem",
    fontSize: "0.95rem", border: "1px solid #ccc", borderRadius: 4,
    fontFamily: "inherit",
  };

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem 1rem" }}>
      <h1 style={{ margin: "0 0 1.5rem" }}>Clubs</h1>

      {/* Create club */}
      {!showForm ? (
        <button
          onClick={() => setShowForm(true)}
          style={{ marginBottom: "1.5rem", padding: "0.5rem 1.2rem", cursor: "pointer" }}
        >
          + Create a club
        </button>
      ) : (
        <form
          onSubmit={handleCreate}
          style={{ border: "1px solid #ddd", borderRadius: 8, padding: "1rem", marginBottom: "1.5rem" }}
        >
          <h3 style={{ margin: "0 0 0.75rem" }}>New club</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Club name (e.g. Book Club)"
              maxLength={100}
              style={inputStyle}
            />
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              maxLength={500}
              style={{ ...inputStyle, resize: "vertical" }}
            />
            <label style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontSize: "0.9rem" }}>
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
              />
              Private club (only members can see posts)
            </label>
          </div>
          {formError && (
            <p style={{ color: "crimson", margin: "0.4rem 0 0", fontSize: "0.9rem" }}>{formError}</p>
          )}
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem" }}>
            <button type="submit" disabled={submitting || !name.trim()} style={{ padding: "0.4rem 1rem", cursor: "pointer" }}>
              {submitting ? "Creating…" : "Create"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} style={{ padding: "0.4rem 1rem", cursor: "pointer" }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Pending invitations */}
      {invitations.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <h3 style={{ margin: "0 0 0.6rem", fontSize: "0.95rem", color: "#555" }}>Pending invitations</h3>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
            {invitations.map((inv) => (
              <div key={inv.club_slug} style={{ border: "1px solid #d0d0e8", borderRadius: 8, padding: "0.75rem 1rem", background: "#f8f8ff", display: "flex", justifyContent: "space-between", alignItems: "center", gap: "1rem" }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{inv.club_name}</span>
                  <span style={{ fontSize: "0.82rem", color: "#888", marginLeft: "0.5rem" }}>
                    invited by {inv.invited_by_display_name}
                  </span>
                </div>
                <div style={{ display: "flex", gap: "0.5rem", flexShrink: 0 }}>
                  <button
                    onClick={() => handleAcceptInvite(inv.club_slug)}
                    style={{ padding: "0.25rem 0.75rem", fontSize: "0.85rem", cursor: "pointer", color: "#1a6b3a", border: "1px solid #1a6b3a", background: "none", borderRadius: 4 }}
                  >
                    Accept
                  </button>
                  <button
                    onClick={() => handleDeclineInvite(inv.club_slug)}
                    style={{ padding: "0.25rem 0.75rem", fontSize: "0.85rem", cursor: "pointer", color: "#888", border: "1px solid #ccc", background: "none", borderRadius: 4 }}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Club list */}
      {loading && <p style={{ color: "#888" }}>Loading…</p>}
      {!loading && clubs.length === 0 && (
        <p style={{ color: "#888" }}>No clubs yet. Create the first one!</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
        {clubs.map((club) => (
          <div
            key={club.id}
            style={{ border: "1px solid #e0e0e0", borderRadius: 8, background: "#fff", overflow: "hidden" }}
          >
            {/* Clickable area — navigates to the club page */}
            <Link
              href={`/clubs/${club.slug}`}
              style={{ display: "block", padding: "1rem", textDecoration: "none", color: "inherit" }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <span style={{ fontWeight: "bold", fontSize: "1.05rem" }}>{club.name}</span>
                  {club.is_private && (
                    <span style={{ marginLeft: "0.5rem", fontSize: "0.78rem", color: "#888", background: "#f0f0f0", padding: "0.1rem 0.4rem", borderRadius: 4 }}>
                      Private
                    </span>
                  )}
                  <div style={{ fontSize: "0.85rem", color: "#888", marginTop: "0.2rem" }}>
                    {club.member_count} {club.member_count === 1 ? "member" : "members"}
                    {club.role && (
                      <span style={{ marginLeft: "0.5rem", color: "#555" }}>· {club.role}</span>
                    )}
                  </div>
                  {club.description && (
                    <p style={{ margin: "0.4rem 0 0", fontSize: "0.9rem", color: "#555" }}>{club.description}</p>
                  )}
                </div>
                <span style={{ fontSize: "0.88rem", color: "#999", flexShrink: 0 }}>View →</span>
              </div>
            </Link>

            {/* Join/Leave — separate from the link so clicks don't navigate */}
            <div style={{ borderTop: "1px solid #f0f0f0", padding: "0.5rem 1rem", display: "flex", justifyContent: "flex-end" }}>
              {!club.is_member && !club.has_pending_request && (
                <button
                  onClick={() => handleJoin(club.slug)}
                  disabled={joiningSlug === club.slug}
                  style={{ padding: "0.3rem 0.9rem", fontSize: "0.88rem", cursor: joiningSlug === club.slug ? "default" : "pointer", opacity: joiningSlug === club.slug ? 0.6 : 1 }}
                >
                  {joiningSlug === club.slug ? "Joining…" : club.is_private ? "Request to join" : "Join"}
                </button>
              )}
              {club.has_pending_request && (
                <span style={{ fontSize: "0.82rem", color: "#888", padding: "0.3rem 0" }}>
                  Request pending…
                </span>
              )}
              {club.is_member && club.role !== "owner" && (
                <button
                  onClick={() => handleLeave(club.slug)}
                  disabled={leavingSlug === club.slug}
                  style={{ padding: "0.3rem 0.9rem", fontSize: "0.88rem", cursor: leavingSlug === club.slug ? "default" : "pointer", color: "#888", opacity: leavingSlug === club.slug ? 0.6 : 1 }}
                >
                  {leavingSlug === club.slug ? "Leaving…" : "Leave"}
                </button>
              )}
              {club.is_member && club.role === "owner" && (
                <span style={{ fontSize: "0.82rem", color: "#9b59b6", padding: "0.3rem 0" }}>You own this club</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}
