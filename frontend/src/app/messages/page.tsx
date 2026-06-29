"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";
import UserSearchInput from "@/components/UserSearchInput";
import { timeAgo } from "@/lib/timeAgo";

interface OtherUser {
  username: string;
  display_name: string;
}

interface LastMessage {
  content: string | null;
  is_post_share: boolean;
  sender_username: string;
  created_at: string;
}

interface ConversationItem {
  conversation_id: string;
  other_user: OtherUser;
  last_message: LastMessage | null;
  unread_count: number;
}

function lastMsgPreview(lm: LastMessage): string {
  if (lm.is_post_share) return lm.content ? `${lm.content} [shared post]` : "[shared a post]";
  return lm.content ?? "";
}

export default function MessagesPage() {
  const router = useRouter();
  const [conversations, setConversations] = useState<ConversationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [newOpen, setNewOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newError, setNewError] = useState<string | null>(null);
  const [newLoading, setNewLoading] = useState(false);

  useEffect(() => {
    apiFetch<ConversationItem[]>("/api/messages")
      .then(setConversations)
      .catch((err: unknown) => {
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
      })
      .finally(() => setLoading(false));
  }, [router]);

  async function handleOpen(e: React.FormEvent) {
    e.preventDefault();
    if (!newUsername.trim()) return;
    setNewLoading(true);
    setNewError(null);
    try {
      const data = await apiFetch<{ conversation_id: string }>("/api/messages/open", {
        method: "POST",
        body: JSON.stringify({ username: newUsername.trim() }),
      });
      router.push(`/messages/${data.conversation_id}`);
    } catch (err: unknown) {
      setNewError(err instanceof Error ? err.message : "User not found.");
    } finally {
      setNewLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 600, margin: "0 auto", padding: "1.5rem 1rem" }}>
      <h1 style={{ margin: "0 0 1.5rem" }}>Messages</h1>

      <button
        onClick={() => { setNewOpen((v) => !v); setNewError(null); setNewUsername(""); }}
        style={{ marginBottom: "1.25rem", padding: "0.45rem 1rem", cursor: "pointer", borderRadius: 4, border: "1px solid #ccc", background: newOpen ? "#111" : "#fff", color: newOpen ? "#fff" : "#111", fontSize: "0.9rem" }}
      >
        {newOpen ? "Cancel" : "+ New message"}
      </button>

      {newOpen && (
        <form onSubmit={handleOpen} style={{ marginBottom: "1.5rem", padding: "1rem", border: "1px solid #e0e0e0", borderRadius: 8, background: "#fafafa" }}>
          <label style={{ display: "block", marginBottom: "0.4rem", fontSize: "0.9rem", fontWeight: "bold" }}>
            Search user
          </label>
          <div style={{ marginBottom: "0.6rem" }}>
            <UserSearchInput
              value={newUsername}
              onChange={setNewUsername}
              onSelect={(u) => setNewUsername(u)}
              placeholder="Search by name or username"
              inputStyle={{ padding: "0.5rem", fontSize: "0.95rem" }}
            />
          </div>
          {newError && <p style={{ color: "crimson", margin: "0 0 0.5rem", fontSize: "0.9rem" }}>{newError}</p>}
          <button
            type="submit"
            disabled={newLoading || !newUsername.trim()}
            style={{ padding: "0.45rem 1rem", cursor: "pointer", borderRadius: 4, background: "#111", color: "#fff", border: "none", fontSize: "0.9rem" }}
          >
            {newLoading ? "Opening…" : "Open conversation"}
          </button>
        </form>
      )}

      {loading && <p style={{ color: "#888" }}>Loading…</p>}
      {!loading && conversations.length === 0 && (
        <p style={{ color: "#aaa", textAlign: "center", marginTop: "3rem" }}>No conversations yet. Start one above.</p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
        {conversations.map((c) => (
          <Link
            key={c.conversation_id}
            href={`/messages/${c.conversation_id}`}
            style={{ display: "block", padding: "0.85rem 1rem", border: `1px solid ${c.unread_count > 0 ? "#d0d0ff" : "#e0e0e0"}`, borderRadius: 8, background: c.unread_count > 0 ? "#f8f8ff" : "#fff", textDecoration: "none", color: "inherit" }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                {c.unread_count > 0 && (
                  <span style={{ width: 8, height: 8, borderRadius: "50%", background: "crimson", flexShrink: 0, display: "inline-block" }} />
                )}
                <span style={{ fontWeight: c.unread_count > 0 ? "700" : "bold", fontSize: "0.95rem" }}>{c.other_user.display_name}</span>
              </div>
              {c.last_message && (
                <span style={{ fontSize: "0.75rem", color: "#aaa" }}>{timeAgo(c.last_message.created_at)}</span>
              )}
            </div>
            <div style={{ fontSize: "0.85rem", color: c.unread_count > 0 ? "#333" : "#888", marginTop: "0.2rem", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontWeight: c.unread_count > 0 ? "500" : "normal" }}>
              {c.last_message
                ? `${c.last_message.sender_username === c.other_user.username ? "" : "You: "}${lastMsgPreview(c.last_message)}`
                : "No messages yet"}
            </div>
          </Link>
        ))}
      </div>
    </main>
  );
}
