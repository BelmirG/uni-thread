"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { SearchOverlay } from "@/components/SearchOverlay";
import { SkeletonRowList } from "@/components/Skeleton";
import { cn } from "@/lib/utils";
import { Plus, X, Lock, Users, ChevronRight, Search as SearchIcon } from "lucide-react";

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
  const [tab, setTab] = useState<"my" | "discover">("my");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formClosing, setFormClosing] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [joiningSlug, setJoiningSlug] = useState<string | null>(null);

  // Play the exit animation, then unmount the sheet.
  function closeForm() {
    setFormClosing(true);
    setTimeout(() => { setShowForm(false); setFormClosing(false); }, 210);
  }

  useEffect(() => {
    if (!showForm) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeForm(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showForm]);

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
          <h1 className="text-xl font-bold text-on-surface">Clubs</h1>
          <div className="flex-1" />
          <button
            onClick={() => setSearchOpen(true)}
            aria-label="Search"
            className="w-9 h-9 mr-1 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors"
          >
            <SearchIcon className="w-5 h-5" />
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Create
          </button>
        </div>
        <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} mode="clubs" />

        {/* Tabs */}
        <div className="flex border-b border-outline-variant mb-4">
          {(["my", "discover"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 py-3 text-sm font-medium transition-colors",
                tab === t
                  ? "text-on-surface border-b-2 border-on-surface -mb-px"
                  : "text-on-surface-variant hover:text-on-surface"
              )}
            >
              {t === "my" ? "My Clubs" : "Discover"}
            </button>
          ))}
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
                    <span className="font-semibold text-sm text-on-surface">{inv.club_name}</span>
                    <span className="text-xs text-on-surface-variant">
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
        {loading && <SkeletonRowList />}
        {!loading && tab === "my" && clubs.filter((c) => c.is_member).length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-8">
            You haven&apos;t joined any clubs yet.{" "}
            <button onClick={() => setTab("discover")} className="underline text-foreground">
              Discover clubs
            </button>
          </p>
        )}
        {!loading && tab === "discover" && clubs.filter((c) => !c.is_member).length === 0 && (
          <p className="text-muted-foreground text-sm text-center py-8">
            You&apos;re a member of all available clubs!
          </p>
        )}

        <div className="space-y-3 stagger-children">
          {clubs.filter((c) => tab === "my" ? c.is_member : !c.is_member).map((club) => (
            <div key={club.id} className="bg-surface rounded-2xl shadow-sm overflow-hidden">
              <Link href={`/clubs/${club.slug}`} className="block px-4 pt-4 pb-3 no-underline">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                      <span className="font-semibold text-sm text-on-surface">{club.name}</span>
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
                    <div className="flex items-center gap-1 text-xs text-on-surface-variant">
                      <Users className="w-3 h-3" />
                      {club.member_count} {club.member_count === 1 ? "member" : "members"}
                    </div>
                    {club.description && (
                      <p className="text-xs text-on-surface-variant mt-1.5 line-clamp-2">
                        {club.description}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40 flex-shrink-0 mt-0.5" />
                </div>
              </Link>

              <div className="flex items-center justify-end px-4 py-2 border-t border-outline-variant/60">
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
                  <span className="text-xs text-on-surface-variant">Request pending…</span>
                )}
                {club.is_member && club.role === "owner" && (
                  <span className="text-xs font-semibold text-purple-600">You own this club</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </main>

      {/* Create club — liquid-glass sheet */}
      {showForm && typeof document !== "undefined" && createPortal(
        <>
          <div
            onClick={closeForm}
            className="fixed inset-0 z-[300]"
            style={{
              background: "rgba(20,20,25,0.30)",
              backdropFilter: "blur(10px)",
              WebkitBackdropFilter: "blur(10px)",
              animation: formClosing ? "backdropOut 0.22s ease both" : "backdropIn 0.28s ease both",
            }}
          />
          <div
            className="fixed left-1/2 bottom-24 w-[min(460px,calc(100vw-1.5rem))] z-[301] rounded-[28px] overflow-hidden"
            style={{
              background: "linear-gradient(165deg, rgba(255,255,255,0.82) 0%, rgba(255,255,255,0.62) 100%)",
              backdropFilter: "blur(40px) saturate(180%)",
              WebkitBackdropFilter: "blur(40px) saturate(180%)",
              border: "1px solid rgba(255,255,255,0.75)",
              boxShadow:
                "inset 0 1.5px 0 rgba(255,255,255,0.95)," +
                "inset 0 -1px 0 rgba(0,0,0,0.04)," +
                "0 24px 60px rgba(0,0,0,0.20)",
              animation: formClosing
                ? "sheetOut 0.22s cubic-bezier(0.4,0,1,1) both"
                : "sheetIn 0.42s cubic-bezier(0.2,0.9,0.3,1.08) both",
            }}
          >
            <form onSubmit={handleCreate} className="px-5 pt-5 pb-5">
              {/* Header: live preview badge + title */}
              <div className="flex items-center gap-3.5 mb-5">
                <div className="w-12 h-12 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center font-bold text-lg uppercase flex-shrink-0 transition-all">
                  {name.trim() ? name.trim().charAt(0) : <Users className="w-5 h-5" />}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-lg font-bold text-on-surface leading-tight">Create a club</h2>
                  <p className="text-xs text-on-surface-variant">Start a community around what you love</p>
                </div>
                <button
                  type="button"
                  onClick={closeForm}
                  className="w-8 h-8 rounded-full bg-black/5 hover:bg-black/10 flex items-center justify-center text-on-surface-variant transition-colors flex-shrink-0"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Club name"
                  maxLength={100}
                  autoFocus
                  className="w-full h-12 px-4 text-sm font-medium rounded-2xl bg-white/70 text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-white transition-all"
                />
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="What's this club about? (optional)"
                  rows={2}
                  maxLength={500}
                  className="w-full px-4 py-3 text-sm rounded-2xl bg-white/70 text-on-surface placeholder:text-on-surface-variant/70 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:bg-white transition-all resize-none"
                />

                {/* Privacy — iOS-style switch */}
                <button
                  type="button"
                  role="switch"
                  aria-checked={isPrivate}
                  onClick={() => setIsPrivate((v) => !v)}
                  className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/50 hover:bg-white/70 transition-colors text-left"
                >
                  <Lock className={cn("w-4 h-4 flex-shrink-0 transition-colors", isPrivate ? "text-primary" : "text-on-surface-variant/60")} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-on-surface">Private club</div>
                    <div className="text-xs text-on-surface-variant">Only members can see posts</div>
                  </div>
                  <span
                    className={cn(
                      "relative w-11 h-[26px] rounded-full flex-shrink-0 transition-colors duration-200",
                      isPrivate ? "bg-primary" : "bg-black/15"
                    )}
                  >
                    <span
                      className="absolute top-[3px] w-5 h-5 rounded-full bg-white shadow-sm transition-all duration-200"
                      style={{ left: isPrivate ? 22 : 3 }}
                    />
                  </span>
                </button>

                {formError && (
                  <p className="text-xs text-error px-1">{formError}</p>
                )}

                <button
                  type="submit"
                  disabled={submitting || !name.trim()}
                  className="w-full h-12 rounded-full bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                >
                  {submitting ? "Creating…" : "Create club"}
                </button>
              </div>
            </form>
          </div>
        </>,
        document.body
      )}
    </>
  );
}
