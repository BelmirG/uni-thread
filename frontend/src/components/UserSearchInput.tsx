"use client";

import { useEffect, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";

interface UserResult {
  username: string;
  display_name: string;
}

interface Props {
  value: string;
  onChange: (val: string) => void;
  onSelect: (username: string) => void;
  placeholder?: string;
  disabled?: boolean;
  inputStyle?: React.CSSProperties;
}

export default function UserSearchInput({ value, onChange, onSelect, placeholder, disabled, inputStyle }: Props) {
  const [results, setResults] = useState<UserResult[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!value.trim()) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const data = await apiFetch<UserResult[]>(`/api/messages/search-users?q=${encodeURIComponent(value)}`);
        setResults(data);
        setOpen(data.length > 0);
      } catch {
        setResults([]);
      }
    }, 280);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [value]);

  return (
    <div style={{ position: "relative" }}>
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onBlur={() => setTimeout(() => { setOpen(false); onChange(""); setResults([]); }, 150)}
        onFocus={() => results.length > 0 && setOpen(true)}
        placeholder={placeholder ?? "Search by name or username"}
        disabled={disabled}
        autoComplete="off"
        style={{
          width: "100%", boxSizing: "border-box",
          padding: "0.4rem 0.6rem", fontSize: "0.88rem",
          border: "1px solid #ccc", borderRadius: 4,
          fontFamily: "inherit",
          ...inputStyle,
        }}
      />
      {open && results.length > 0 && (
        <div style={{
          position: "absolute", top: "100%", left: 0, right: 0,
          background: "#fff", border: "1px solid #ddd", borderRadius: 4,
          boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
          zIndex: 200, maxHeight: 180, overflowY: "auto",
        }}>
          {results.map((r) => (
            <button
              key={r.username}
              type="button"
              onMouseDown={() => { onSelect(r.username); onChange(r.username); setOpen(false); }}
              style={{
                display: "block", width: "100%", textAlign: "left",
                padding: "0.45rem 0.75rem", border: "none",
                borderBottom: "1px solid #f0f0f0",
                background: "none", cursor: "pointer", fontSize: "0.87rem",
              }}
            >
              <strong>{r.display_name}</strong>
              <span style={{ color: "#999", marginLeft: "0.4rem" }}>@{r.username}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
