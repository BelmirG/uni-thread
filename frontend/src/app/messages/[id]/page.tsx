"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";

interface Author {
  username: string;
  display_name: string;
}

interface SharedPost {
  id: string;
  content: string | null;
  is_deleted: boolean;
  author: Author | null;
}

interface DmMessage {
  id: string;
  content: string | null;
  shared_post: SharedPost | null;
  sender: Author;
  created_at: string;
}

interface ConvResponse {
  other_user: Author;
  messages: DmMessage[];
}

function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function SharedPostCard({ post, isOwn }: { post: SharedPost; isOwn: boolean }) {
  const bg = isOwn ? "rgba(255,255,255,0.15)" : "#f0f0f0";
  const color = isOwn ? "#fff" : "#333";

  if (post.is_deleted) {
    return (
      <div style={{ marginTop: "0.4rem", padding: "0.5rem 0.65rem", background: bg, borderRadius: 8, fontSize: "0.82rem", fontStyle: "italic", color }}>
        [deleted post]
      </div>
    );
  }
  return (
    <Link
      href={`/feed/${post.id}`}
      style={{ display: "block", marginTop: "0.4rem", padding: "0.5rem 0.65rem", background: bg, borderRadius: 8, textDecoration: "none", color, fontSize: "0.82rem" }}
    >
      <span style={{ fontWeight: "bold" }}>{post.author?.display_name ?? "Unknown"}</span>
      <p style={{ margin: "0.2rem 0 0", whiteSpace: "pre-wrap", opacity: 0.85 }}>
        {(post.content ?? "").slice(0, 120)}{(post.content ?? "").length > 120 ? "…" : ""}
      </p>
    </Link>
  );
}

export default function ConversationPage() {
  const router = useRouter();
  const { id } = useParams<{ id: string }>();

  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [otherUser, setOtherUser] = useState<Author | null>(null);
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [input, setInput] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const [conv, me] = await Promise.all([
          apiFetch<ConvResponse>(`/api/messages/${id}`),
          apiFetch<{ username: string }>("/api/auth/me"),
        ]);
        if (cancelled) return;
        setMessages(conv.messages);
        setOtherUser(conv.other_user);
        setCurrentUsername(me.username);
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
        } else if (err instanceof ApiError && err.status === 403) {
          router.replace("/messages");
        }
        return;
      }

      if (cancelled) return;

      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${window.location.host}/api/messages/${id}/ws`);
      wsRef.current = ws;

      ws.onopen = () => setStatus("connected");
      ws.onmessage = (event) => {
        const msg: DmMessage = JSON.parse(event.data);
        setMessages((prev) => [...prev, msg]);
      };
      ws.onclose = () => setStatus("disconnected");
      ws.onerror = () => setStatus("disconnected");
    }

    init();

    return () => {
      cancelled = true;
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [id, router]);

  function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || status !== "connected" || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ content: text }));
    setInput("");
    inputRef.current?.focus();
  }

  const statusColor: Record<string, string> = {
    connecting: "#f0ad4e",
    connected: "#5cb85c",
    disconnected: "#d9534f",
  };

  return (
    <main style={{ position: "fixed", top: 0, bottom: 60, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 700, display: "flex", flexDirection: "column" }}>
      {/* Header */}
      <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid #e0e0e0", background: "#fff", display: "flex", alignItems: "center", gap: "0.75rem" }}>
        <Link href="/messages" style={{ fontSize: "0.9rem", color: "#555", textDecoration: "none" }}>← Messages</Link>
        <span style={{ fontWeight: "bold", fontSize: "1rem" }}>{otherUser?.display_name ?? "Conversation"}</span>
        <span style={{ marginLeft: "auto", fontSize: "0.78rem", color: statusColor[status], display: "flex", alignItems: "center", gap: "0.3rem" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor[status], display: "inline-block" }} />
          {status === "connected" ? "Live" : status === "connecting" ? "Connecting…" : "Disconnected — refresh to reconnect"}
        </span>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: "auto", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem", background: "#f9f9f9" }}>
        {messages.length === 0 && status === "connected" && (
          <p style={{ color: "#aaa", textAlign: "center", margin: "auto" }}>No messages yet. Say hello!</p>
        )}
        {messages.map((msg) => {
          const isOwn = msg.sender.username === currentUsername;
          return (
            <div key={msg.id} style={{ display: "flex", flexDirection: "column", alignItems: isOwn ? "flex-end" : "flex-start" }}>
              {!isOwn && (
                <span style={{ fontSize: "0.75rem", color: "#888", marginBottom: "0.15rem", paddingLeft: "0.25rem" }}>
                  {msg.sender.display_name}
                </span>
              )}
              <div style={{
                maxWidth: "72%",
                padding: "0.5rem 0.75rem",
                borderRadius: isOwn ? "16px 16px 4px 16px" : "16px 16px 16px 4px",
                background: isOwn ? "#111" : "#fff",
                color: isOwn ? "#fff" : "#111",
                border: isOwn ? "none" : "1px solid #e0e0e0",
                fontSize: "0.95rem",
                lineHeight: 1.4,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
              }}>
                {msg.content && <span>{msg.content}</span>}
                {msg.shared_post && <SharedPostCard post={msg.shared_post} isOwn={isOwn} />}
              </div>
              <span style={{ fontSize: "0.7rem", color: "#bbb", marginTop: "0.15rem", paddingLeft: "0.25rem", paddingRight: "0.25rem" }}>
                {timeLabel(msg.created_at)}
              </span>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={sendMessage}
        style={{ padding: "0.75rem 1rem", borderTop: "1px solid #e0e0e0", background: "#fff", display: "flex", gap: "0.5rem" }}
      >
        <input
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={status === "connected" ? "Type a message…" : "Disconnected"}
          disabled={status !== "connected"}
          maxLength={2000}
          style={{ flex: 1, padding: "0.5rem 0.75rem", fontSize: "0.95rem", border: "1px solid #ccc", borderRadius: 20, fontFamily: "inherit", outline: "none" }}
        />
        <button
          type="submit"
          disabled={!input.trim() || status !== "connected"}
          style={{ padding: "0.5rem 1.1rem", borderRadius: 20, cursor: "pointer", background: "#111", color: "#fff", border: "none", fontSize: "0.9rem", opacity: !input.trim() || status !== "connected" ? 0.4 : 1 }}
        >
          Send
        </button>
      </form>
    </main>
  );
}
