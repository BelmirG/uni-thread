"use client";

import { CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";

export interface EventDraft {
  startsAt: string;
  endsAt: string;
  location: string;
}

interface Props {
  value: EventDraft | null;
  onChange: (draft: EventDraft | null) => void;
}

export default function EventComposer({ value, onChange }: Props) {
  const open = value !== null;

  function toggle() {
    onChange(open ? null : { startsAt: "", endsAt: "", location: "" });
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        className={cn(
          "flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border font-medium transition-colors",
          open
            ? "bg-foreground text-background border-foreground"
            : "bg-background text-muted-foreground border-border hover:border-foreground hover:text-foreground"
        )}
      >
        <CalendarDays className="w-3.5 h-3.5" />
        {open ? "Remove event" : "Add event"}
      </button>

      {open && value && (
        <div className="mt-3 p-3 border border-border rounded-xl bg-muted/40 space-y-2">
          <div>
            <label className="text-xs text-muted-foreground block mb-1">
              Starts <span className="text-destructive">*</span>
            </label>
            <input
              type="datetime-local"
              value={value.startsAt}
              onChange={(e) => onChange({ ...value, startsAt: e.target.value })}
              className="text-xs border border-input rounded-md px-2.5 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Ends (optional)</label>
            <input
              type="datetime-local"
              value={value.endsAt}
              min={value.startsAt || undefined}
              onChange={(e) => onChange({ ...value, endsAt: e.target.value })}
              className="text-xs border border-input rounded-md px-2.5 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div>
            <label className="text-xs text-muted-foreground block mb-1">Place (optional)</label>
            <input
              value={value.location}
              onChange={(e) => onChange({ ...value, location: e.target.value })}
              placeholder="e.g. Room B204, or Main campus lobby"
              maxLength={200}
              className="w-full h-8 px-2.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <p className="text-[11px] text-muted-foreground leading-snug pt-0.5">
            Members can RSVP so you get a headcount. Details can&apos;t be changed after posting.
          </p>
        </div>
      )}
    </div>
  );
}
