"use client";

import { BarChart2, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PollDraft {
  options: string[];
  expiresAt: string;
  publicVotes: boolean;
}

interface Props {
  value: PollDraft | null;
  onChange: (draft: PollDraft | null) => void;
  // Club composers offer public voting; feed polls are always anonymous,
  // so the toggle simply doesn't exist there.
  allowPublicVotes?: boolean;
}

export default function PollComposer({ value, onChange, allowPublicVotes = false }: Props) {
  const open = value !== null;

  function toggle() {
    if (open) {
      onChange(null);
    } else {
      onChange({ options: ["", ""], expiresAt: "", publicVotes: false });
    }
  }

  function setOption(i: number, text: string) {
    if (!value) return;
    const options = [...value.options];
    options[i] = text;
    onChange({ ...value, options });
  }

  function addOption() {
    if (!value || value.options.length >= 4) return;
    onChange({ ...value, options: [...value.options, ""] });
  }

  function removeOption(i: number) {
    if (!value || value.options.length <= 2) return;
    onChange({ ...value, options: value.options.filter((_, idx) => idx !== i) });
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
        <BarChart2 className="w-3.5 h-3.5" />
        {open ? "Remove poll" : "Add poll"}
      </button>

      {open && value && (
        <div className="mt-3 p-3 border border-border rounded-xl bg-muted/40 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Poll options (2–4)</p>

          {value.options.map((opt, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                value={opt}
                onChange={(e) => setOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                maxLength={200}
                className="flex-1 h-8 px-2.5 text-sm border border-input rounded-md bg-background focus:outline-none focus:ring-2 focus:ring-ring"
              />
              {value.options.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          ))}

          {value.options.length < 4 && (
            <button
              type="button"
              onClick={addOption}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-md px-2.5 py-1.5 transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add option
            </button>
          )}

          <div className="pt-1">
            <label className="text-xs text-muted-foreground block mb-1">Poll ends at (optional)</label>
            <input
              type="datetime-local"
              value={value.expiresAt}
              onChange={(e) => onChange({ ...value, expiresAt: e.target.value })}
              className="text-xs border border-input rounded-md px-2.5 py-1.5 bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {allowPublicVotes && (
            <label className="flex items-start gap-2 pt-1 cursor-pointer">
              <input
                type="checkbox"
                checked={value.publicVotes}
                onChange={(e) => onChange({ ...value, publicVotes: e.target.checked })}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-input"
              />
              <span className="text-xs text-muted-foreground leading-snug">
                <span className="font-medium text-foreground block">Show who voted</span>
                Everyone who can see this poll will see each member&apos;s choice.
                This can&apos;t be changed after posting.
              </span>
            </label>
          )}
        </div>
      )}
    </div>
  );
}
