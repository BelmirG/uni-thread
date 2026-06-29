"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Plus, X, Lock, Users, ChevronRight } from "lucide-react";

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

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [joiningSlug, setJoiningSlug] = useState<string | null>(null);

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

  return (
    <>
      <main className="max-w-xl mx-auto px-4 pt-4 pb-36">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-foreground">Clubs</h1>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Create
          </button>
        </div>

        {/* Pending invitations */}
        {invitations.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              Invitations
            </p>
            <div className="space-y-2">
              {invitations.map((inv) => (
                <div
                  key={inv.club_slug}
                  className="bg-primary/5 border border-primary/15 rounded-xl px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <span className="font-semibold text-sm text-foreground">{inv.club_name}</span>
                    <span className="text-xs text-muted-foreground">
                      {" · "}invited by {inv.invited_by_display_name}
                    </span>
                  </div>
                  <div className="flex gap-2 flex-shrink-0">
                    <Button size="sm" onClick={() => handleAcceptInvite(inv.club_slug)}>
                      Accept
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => handleDeclineInvite(inv.club_slug)}>
                      Decline
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* List */}
        {loading && <p className="text-muted-foreground text-sm text-center py-8">Loading…</p>}
        {!loading && clubs.length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-8">
            No clubs yet. Create the first one!
          </p>
        )}

        <div className="space-y-3">
          {clubs.map((club) => (
            <div key={club.id} className="bg-white border border-border rounded-xl shadow-sm overflow-hidden">
              <Link href={`/clubs/${club.slug}`} className="block px-4 pt-4 pb-3 no-underline">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="font-semibold text-sm text-foreground">{club.name}</span>
                      {club.is_private && (
                        <span className="flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                          <Lock className="w-2.5 h-2.5" />
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
                      <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
                        {club.description}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0 mt-0.5" />
                </div>
              </Link>

              <div className="flex items-center justify-end px-4 py-2 border-t border-border/60">
                {!club.is_member && !club.has_pending_request && (
                  <Button
                    size="sm"
                    variant={club.is_private ? "outline" : "default"}
                    onClick={() => handleJoin(club.slug)}
                    disabled={joiningSlug === club.slug}
                  >
                    {joiningSlug === club.slug
                      ? "Joining…"
                      : club.is_private
                      ? "Request to join"
                      : "Join"}
                  </Button>
                )}
                {club.has_pending_request && (
                  <span className="text-xs text-muted-foreground">Request pending…</span>
                )}
                {club.is_member && club.role === "owner" && (
                  <span className="text-xs font-semibold text-purple-600">You own this club</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Create club sheet */}
      {showForm && (
        <>
          <div
            onClick={() => setShowForm(false)}
            className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
          />
          <div className="fixed bottom-[4.5rem] left-1/2 -translate-x-1/2 w-[min(600px,94vw)] bg-white rounded-2xl z-[101] shadow-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border flex-shrink-0">
              <span className="font-semibold text-sm">New club</span>
              <button
                onClick={() => setShowForm(false)}
                className="rounded-full p-1 hover:bg-muted text-muted-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="overflow-y-auto flex-1">
              <form onSubmit={handleCreate} className="px-4 py-3 space-y-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Club name (e.g. Book Club)"
                  maxLength={100}
                  className="w-full h-9 px-3 text-sm border border-input rounded-md bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description (optional)"
                  rows={2}
                  maxLength={500}
                  className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring resize-none"
                />
                <label className="flex items-center gap-2 text-sm text-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isPrivate}
                    onChange={(e) => setIsPrivate(e.target.checked)}
                    className="rounded border-input"
                  />
                  <Lock className="w-3.5 h-3.5 text-muted-foreground" />
                  Private club (only members can see posts)
                </label>
                {formError && <p className="text-xs text-destructive">{formError}</p>}
                <div className="flex gap-2 pt-1">
                  <Button
                    type="submit"
                    disabled={submitting || !name.trim()}
                    className="flex-1"
                  >
                    {submitting ? "Creating…" : "Create club"}
                  </Button>
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                </div>
              </form>
            </div>
          </div>
        </>
      )}
    </>
  );
}
