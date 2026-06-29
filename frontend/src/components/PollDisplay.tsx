"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";

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
    <div style={{ margin: "0.75rem 0 0.25rem", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
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
              style={{
                position: "relative", overflow: "hidden",
                padding: "0.5rem 0.75rem", borderRadius: 7,
                border: isChosen ? "1.5px solid #111" : "1px solid #e0e0e0",
                background: "#f9f9f9", cursor: poll.is_expired ? "default" : "pointer",
                textAlign: "left", fontFamily: "inherit", fontSize: "0.88rem",
              }}
            >
              <div
                style={{
                  position: "absolute", inset: 0, left: 0,
                  width: `${pct}%`,
                  background: isChosen ? "rgba(0,0,0,0.08)" : "rgba(0,0,0,0.04)",
                  transition: "width 0.4s ease",
                }}
              />
              <span style={{ position: "relative", display: "flex", justifyContent: "space-between", gap: "0.5rem" }}>
                <span>{isChosen ? <strong>{opt.text}</strong> : opt.text}</span>
                <span style={{ color: "#888", fontSize: "0.82rem", flexShrink: 0 }}>{pct}% · {opt.votes}</span>
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
            style={{
              padding: "0.5rem 0.75rem", borderRadius: 7,
              border: "1px solid #e0e0e0", background: "#fff",
              cursor: "pointer", textAlign: "left",
              fontFamily: "inherit", fontSize: "0.88rem",
              transition: "border-color 0.15s",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "#111")}
            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "#e0e0e0")}
          >
            {opt.text}
          </button>
        );
      })}

      <div style={{ fontSize: "0.78rem", color: "#aaa", display: "flex", gap: "0.75rem" }}>
        <span>{poll.total_votes} vote{poll.total_votes !== 1 ? "s" : ""}</span>
        {poll.expires_at && <span>{poll.is_expired ? "Poll ended" : timeUntil(poll.expires_at)}</span>}
        {!poll.is_expired && poll.user_vote_option_id && (
          <button
            type="button"
            onClick={() => handleVote(poll.user_vote_option_id!)}
            style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: "0.78rem", padding: 0, textDecoration: "underline" }}
          >
            Undo vote
          </button>
        )}
      </div>
    </div>
  );
}
