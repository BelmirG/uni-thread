"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { CalendarDays, MapPin, X } from "lucide-react";
import MiniAvatar from "@/components/MiniAvatar";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

export interface EventInfo {
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  going_count: number;
  interested_count: number;
  user_status: "going" | "interested" | null;
  is_past: boolean;
}

interface Attendee {
  username: string;
  display_name: string;
  avatar_url: string | null;
}

interface RsvpLists {
  going: Attendee[];
  interested: Attendee[];
}

interface Props {
  postId: string;
  event: EventInfo;
  onUpdate: (updated: EventInfo) => void;
}

/** "Thu, 14 Mar · 18:00" — weekday and time are what people actually scan for.
 *  The year only appears when the event isn't in the current year. */
function formatWhen(startIso: string, endIso: string | null): string {
  const start = new Date(startIso);
  const sameYear = start.getFullYear() === new Date().getFullYear();
  const date = start.toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const time = start.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  if (!endIso) return `${date} · ${time}`;

  const end = new Date(endIso);
  const endTime = end.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  // Same-day events show one date and a time range; multi-day spell out both.
  if (end.toDateString() === start.toDateString()) return `${date} · ${time}–${endTime}`;
  const endDate = end.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });
  return `${date} ${time} → ${endDate} ${endTime}`;
}

function AttendeeGroup({ label, people, onNavigate }: { label: string; people: Attendee[]; onNavigate: () => void }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground mb-1.5">
        {label} · {people.length}
      </p>
      {people.length === 0 ? (
        <p className="text-xs text-muted-foreground/70 italic">Nobody yet</p>
      ) : (
        <div className="space-y-1.5">
          {people.map((p) => (
            <Link
              key={p.username}
              href={`/profile/${p.username}`}
              onClick={onNavigate}
              className="flex items-center gap-2.5 no-underline hover:bg-muted/60 rounded-lg px-1.5 py-1 -mx-1.5 transition-colors"
            >
              <MiniAvatar name={p.display_name} url={p.avatar_url} size={28} />
              <span className="text-sm text-foreground truncate">{p.display_name}</span>
              <span className="text-xs text-muted-foreground truncate">@{p.username}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function EventDisplay({ postId, event, onUpdate }: Props) {
  const [loading, setLoading] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [lists, setLists] = useState<RsvpLists | null>(null);

  async function respond(status: "going" | "interested") {
    if (loading) return;
    setLoading(true);
    try {
      const updated = await apiFetch<EventInfo>(`/api/posts/${postId}/rsvp`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      onUpdate(updated);
      // A fresh RSVP invalidates any attendee list we'd already fetched.
      setLists(null);
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : "Could not save your RSVP.");
    } finally {
      setLoading(false);
    }
  }

  async function openList() {
    setListOpen(true);
    if (lists) return;
    try {
      setLists(await apiFetch<RsvpLists>(`/api/posts/${postId}/rsvps`));
    } catch {
      setLists({ going: [], interested: [] });
    }
  }

  const total = event.going_count + event.interested_count;

  return (
    <div
      className={cn(
        "mt-3 rounded-xl border border-border overflow-hidden",
        event.is_past && "opacity-70"
      )}
    >
      <div className="flex items-start gap-2.5 px-3 py-2.5 bg-muted/40">
        <CalendarDays className="w-4 h-4 mt-0.5 text-foreground flex-shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-foreground leading-snug">
            {formatWhen(event.starts_at, event.ends_at)}
            {event.is_past && (
              <span className="ml-2 text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Past
              </span>
            )}
          </p>
          {event.location && (
            <p className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
              <MapPin className="w-3 h-3 flex-shrink-0" />
              <span className="truncate">{event.location}</span>
            </p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 px-3 py-2 border-t border-border">
        {(["going", "interested"] as const).map((status) => {
          const active = event.user_status === status;
          const count = status === "going" ? event.going_count : event.interested_count;
          return (
            <button
              key={status}
              type="button"
              onClick={() => respond(status)}
              disabled={loading}
              className={cn(
                "flex-1 text-xs font-medium py-1.5 rounded-md border transition-colors disabled:opacity-50 capitalize",
                active
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:border-foreground hover:text-foreground"
              )}
            >
              {status}
              {count > 0 && <span className="ml-1 tabular-nums">{count}</span>}
            </button>
          );
        })}
      </div>

      {total > 0 && (
        <button
          type="button"
          onClick={openList}
          className="w-full text-left px-3 py-2 border-t border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          See who&apos;s going
          <span className="ml-1 tabular-nums">
            · {event.going_count} going · {event.interested_count} interested
          </span>
        </button>
      )}

      {listOpen && typeof document !== "undefined" && createPortal(
        <>
          <div
            onClick={() => setListOpen(false)}
            style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)", zIndex: 200 }}
          />
          <div style={{ position: "fixed", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(420px, 90vw)", maxHeight: "70vh", zIndex: 201, background: "hsl(var(--card))", borderRadius: 20, display: "flex", flexDirection: "column", boxShadow: "0 8px 40px rgba(0,0,0,0.18)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 12px", borderBottom: "1px solid hsl(var(--border))", flexShrink: 0 }}>
              <span style={{ fontWeight: 600, fontSize: "0.9rem" }}>Attendees</span>
              <button
                onClick={() => setListOpen(false)}
                style={{ width: 28, height: 28, borderRadius: "50%", border: "none", background: "hsl(var(--muted))", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-4">
              {lists === null ? (
                <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>
              ) : (
                <>
                  <AttendeeGroup label="Going" people={lists.going} onNavigate={() => setListOpen(false)} />
                  <AttendeeGroup label="Interested" people={lists.interested} onNavigate={() => setListOpen(false)} />
                </>
              )}
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
