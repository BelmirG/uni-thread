"use client";

import { useState } from "react";

export interface PollDraft {
  options: string[];
  expiresAt: string; // ISO string or ""
}

interface Props {
  value: PollDraft | null;
  onChange: (draft: PollDraft | null) => void;
}

export default function PollComposer({ value, onChange }: Props) {
  const [open, setOpen] = useState(!!value);

  function toggle() {
    if (open) {
      setOpen(false);
      onChange(null);
    } else {
      setOpen(true);
      onChange({ options: ["", ""], expiresAt: "" });
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
    const options = value.options.filter((_, idx) => idx !== i);
    onChange({ ...value, options });
  }

  return (
    <div>
      <button
        type="button"
        onClick={toggle}
        style={{
          fontSize: "0.82rem", padding: "0.3rem 0.75rem", borderRadius: 6, cursor: "pointer",
          border: open ? "1px solid #111" : "1px solid #ccc",
          background: open ? "#111" : "#fff",
          color: open ? "#fff" : "#555",
        }}
      >
        {open ? "✕ Remove poll" : "📊 Add poll"}
      </button>

      {open && value && (
        <div style={{ marginTop: "0.75rem", padding: "0.85rem", border: "1px solid #e0e0e0", borderRadius: 8, background: "#fafafa", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <p style={{ margin: 0, fontSize: "0.82rem", color: "#666", fontWeight: 500 }}>Poll options (2–4)</p>
          {value.options.map((opt, i) => (
            <div key={i} style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
              <input
                value={opt}
                onChange={(e) => setOption(i, e.target.value)}
                placeholder={`Option ${i + 1}`}
                maxLength={200}
                style={{ flex: 1, padding: "0.4rem 0.6rem", fontSize: "0.88rem", border: "1px solid #ccc", borderRadius: 5, fontFamily: "inherit" }}
              />
              {value.options.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeOption(i)}
                  style={{ background: "none", border: "none", cursor: "pointer", color: "#aaa", fontSize: "1rem", lineHeight: 1, padding: "0 0.2rem" }}
                >
                  ×
                </button>
              )}
            </div>
          ))}
          {value.options.length < 4 && (
            <button
              type="button"
              onClick={addOption}
              style={{ alignSelf: "flex-start", fontSize: "0.82rem", color: "#555", background: "none", border: "1px dashed #ccc", borderRadius: 5, padding: "0.3rem 0.7rem", cursor: "pointer" }}
            >
              + Add option
            </button>
          )}

          <div style={{ marginTop: "0.25rem" }}>
            <label style={{ fontSize: "0.82rem", color: "#666", display: "block", marginBottom: "0.25rem" }}>Poll ends at (optional)</label>
            <input
              type="datetime-local"
              value={value.expiresAt}
              onChange={(e) => onChange({ ...value, expiresAt: e.target.value })}
              style={{ fontSize: "0.85rem", padding: "0.35rem 0.5rem", border: "1px solid #ccc", borderRadius: 5, fontFamily: "inherit" }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
