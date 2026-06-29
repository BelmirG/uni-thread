"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

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
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }

  return (
    <div className="space-y-2 my-2">
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
      </div>
    </div>
  );
}
