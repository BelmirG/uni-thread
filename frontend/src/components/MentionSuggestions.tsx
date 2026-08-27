"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import MiniAvatar from "@/components/MiniAvatar";

interface UserResult {
  username: string;
  display_name: string;
  avatar_url?: string | null;
}

const ACTIVE_MENTION_RE = /(^|[^a-zA-Z0-9_.])@([a-zA-Z0-9_]{1,30})$/;

export default function MentionSuggestions({
  value,
  caret,
  onPick,
  dropUp = false,
}: {
  value: string;
  caret: number | null;
  onPick: (newValue: string, newCaret: number) => void;
  dropUp?: boolean;
}) {
  const [results, setResults] = useState<UserResult[]>([]);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const upto = caret === null ? value : value.slice(0, caret);
  const match = upto.match(ACTIVE_MENTION_RE);
  const query = match ? match[2] : null;

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query) {
      setResults([]);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await apiFetch<UserResult[]>(
          `/api/messages/search-users?q=${encodeURIComponent(query)}`
        );
        setResults(data.slice(0, 5));
      } catch {
        setResults([]);
      }
    }, 200);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  if (!query || results.length === 0) return null;

  function pick(username: string) {
    const at = upto.length - match![0].length + match![1].length;
    const completed = value.slice(0, at) + `@${username} ` + value.slice(upto.length);
    onPick(completed, at + username.length + 2);
    setResults([]);
  }

  return (
    <div
      className={
        "absolute left-0 right-0 z-[300] bg-surface rounded-xl shadow-xl border border-outline-variant/40 overflow-hidden " +
        (dropUp ? "bottom-full mb-1" : "top-full mt-1")
      }
    >
      {results.map((r) => (
        <button
          key={r.username}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault(); // keep focus in the input
            pick(r.username);
          }}
          className="flex items-center gap-2.5 w-full text-left px-3 py-2 hover:bg-surface-container transition-colors"
        >
          <MiniAvatar name={r.display_name} url={r.avatar_url ?? null} size={28} />
          <span className="text-sm font-medium text-on-surface truncate">{r.display_name}</span>
          <span className="text-xs text-on-surface-variant truncate">@{r.username}</span>
        </button>
      ))}
    </div>
  );
}
