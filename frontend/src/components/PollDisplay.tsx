"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Eye, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";
import MiniAvatar from "@/components/MiniAvatar";

interface PollOption {
  id: string;
  text: string;
  votes: number;
}

interface Poll {
  options: PollOption[];
  total_votes: number;
  user_vote_option_id: string | null;
  expires_at: string | null;
  is_expired: boolean;
  public_votes?: boolean;
}

interface VoterInfo {
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface VotersByOption {
  option_id: string;
  text: string;
  voters: VoterInfo[];
}

interface Props {
  postId: string;
  poll: Poll;
  onUpdate: (updated: Poll) => void;
}

function timeUntil(iso: string): string {
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return "Ended";
  const h = Math.floor(diff / 3600000);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d left`;
  if (h > 0) return `${h}h left`;
  return `${Math.floor(diff / 60000)}m left`;
}

export default function PollDisplay({ postId, poll, onUpdate }: Props) {
  const [loading, setLoading] = useState(false);
  const [votersOpen, setVotersOpen] = useState(false);
  const [voters, setVoters] = useState<VotersByOption[] | null>(null);
  const showResults = poll.is_expired || poll.user_vote_option_id !== null;

  async function handleVote(optionId: string) {
    if (loading || poll.is_expired) return;
    setLoading(true);
    try {
      const updated = await apiFetch<Poll>(`/api/posts/${postId}/poll-vote`, {
        method: "POST",
        body: JSON.stringify({ option_id: optionId }),
      });
      onUpdate(updated);
      // Any cached voter list is stale the moment a vote changes.
      setVoters(null);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  async function openVoters() {
    setVotersOpen(true);
    if (voters) return;
    try {
      setVoters(await apiFetch<VotersByOption[]>(`/api/posts/${postId}/poll-voters`));
    } catch {
      setVotersOpen(false);
    }
  }

  return (
    <div className="space-y-2 my-2">
      {/* Disclosure BEFORE voting — nobody should discover their vote was
          visible only after casting it. */}
      {poll.public_votes && (
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <Eye className="w-3.5 h-3.5 flex-shrink-0" />
          Votes are visible to everyone in this club
        </p>
      )}

      {poll.options.map((opt) => {
        const pct = poll.total_votes > 0 ? Math.round((opt.votes / poll.total_votes) * 100) : 0;
        const isChosen = poll.user_vote_option_id === opt.id;

        if (showResults) {
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => !poll.is_expired && handleVote(opt.id)}
              disabled={poll.is_expired || loading}
              className={cn(
                "relative w-full overflow-hidden rounded-lg px-3 py-2.5 text-left text-sm transition-colors",
                poll.is_expired ? "cursor-default" : "cursor-pointer",
                isChosen
                  ? "border-2 border-primary"
                  : "border border-border"
              )}
            >
              <div
                className={cn(
                  "absolute inset-y-0 left-0 transition-all duration-500",
                  isChosen ? "bg-primary/10" : "bg-muted"
                )}
                style={{ width: `${pct}%` }}
              />
              <span className="relative flex justify-between gap-2">
                <span className={cn("font-medium", isChosen && "text-primary")}>
                  {opt.text}
                </span>
                <span className="text-muted-foreground text-xs flex-shrink-0 self-center">
                  {pct}%
                </span>
              </span>
            </button>
          );
        }

        return (
          <button
            key={opt.id}
            type="button"
            onClick={() => handleVote(opt.id)}
            disabled={loading}
            className="w-full rounded-lg border border-border px-3 py-2.5 text-left text-sm hover:border-primary hover:bg-primary/5 transition-colors disabled:opacity-60"
          >
            {opt.text}
          </button>
        );
      })}

      <div className="flex items-center gap-3 text-xs text-muted-foreground pt-0.5">
        <span>{poll.total_votes} vote{poll.total_votes !== 1 ? "s" : ""}</span>
        {poll.expires_at && (
          <span>{poll.is_expired ? "Poll ended" : timeUntil(poll.expires_at)}</span>
        )}
        {!poll.is_expired && poll.user_vote_option_id && (
          <button
            type="button"
            onClick={() => handleVote(poll.user_vote_option_id!)}
            className="underline hover:text-foreground transition-colors"
          >
            Undo
          </button>
        )}
        {poll.public_votes && showResults && poll.total_votes > 0 && (
          <button
            type="button"
            onClick={openVoters}
            className="underline hover:text-foreground transition-colors"
          >
            View votes
          </button>
        )}
      </div>

      {votersOpen && typeof document !== "undefined" && createPortal(
        <>
          <div
            onClick={() => setVotersOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)", zIndex: 200 }}
          />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(420px, 90vw)", maxHeight: "70vh", zIndex: 201, background: "white", borderRadius: 20, display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 12px", borderBottom: "1px solid #e5e7eb", flexShrink: 0 }}>
              <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Votes</span>
              <button
                onClick={() => setVotersOpen(false)}
                style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: "#f3f4f6", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-4">
              {voters === null ? (
                <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>
              ) : (
                voters.map((group) => (
                  <div key={group.option_id}>
                    <p className="text-xs font-semibold text-muted-foreground mb-1.5">
                      {group.text} · {group.voters.length}
                    </p>
                    {group.voters.length === 0 ? (
                      <p className="text-xs text-muted-foreground/70 italic">No votes yet</p>
                    ) : (
                      <div className="space-y-1.5">
                        {group.voters.map((v) => (
                          <Link
                            key={v.username}
                            href={`/profile/${v.username}`}
                            onClick={() => setVotersOpen(false)}
                            className="flex items-center gap-2.5 no-underline hover:bg-muted/60 rounded-lg px-1.5 py-1 -mx-1.5 transition-colors"
                          >
                            <MiniAvatar name={v.display_name} url={v.avatar_url} size={28} />
                            <span className="text-sm text-foreground truncate">{v.display_name}</span>
                            <span className="text-xs text-muted-foreground truncate">@{v.username}</span>
                          </Link>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
