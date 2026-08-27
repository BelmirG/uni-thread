"use client";

import { useState } from "react";
import { Bookmark } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function BookmarkButton({
  postId,
  initialBookmarked,
  onToggled,
}: {
  postId: string;
  initialBookmarked: boolean;
  onToggled?: (bookmarked: boolean) => void;
}) {
  const [saved, setSaved] = useState(initialBookmarked);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    if (busy) return;
    setBusy(true);
    const next = !saved;
    setSaved(next); // optimistic
    try {
      const res = await apiFetch<{ is_bookmarked: boolean }>(`/api/posts/${postId}/bookmark`, {
        method: "POST",
      });
      setSaved(res.is_bookmarked);
      onToggled?.(res.is_bookmarked);
    } catch {
      setSaved(!next); // roll back
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={saved ? "Remove from saved" : "Save post"}
      className={cn(
        "flex items-center px-2.5 py-1.5 rounded-lg transition-colors",
        saved
          ? "text-secondary"
          : "text-on-surface-variant hover:text-on-surface hover:bg-surface-container-low"
      )}
    >
      <Bookmark className={cn("w-4 h-4", saved && "fill-current vote-pop")} />
    </button>
  );
}
