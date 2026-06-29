"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api";

interface Author {
  username: string;
  display_name: string;
}

interface ChatMessage {
  id: string;
  content: string;
  author: Author;
  created_at: string;
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ClubChatPage() {
  const router = useRouter();
  const { slug } = useParams<{ slug: string }>();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [currentUsername, setCurrentUsername] = useState<string | null>(null);
  const [clubName, setClubName] = useState("");
  const [status, setStatus] = useState<"connecting" | "connected" | "disconnected">("connecting");
  const [input, setInput] = useState("");

  const wsRef = useRef<WebSocket | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    // React StrictMode (dev only) mounts → unmounts → remounts every effect.
    // Without this flag, two WebSocket connections would open and every message
    // would appear twice — once per connection forwarding the Redis broadcast.
    let cancelled = false;

    async function init() {
      try {
        const [history, me, club] = await Promise.all([
          apiFetch<ChatMessage[]>(`/api/clubs/${slug}/chat`),
          apiFetch<{ username: string }>("/api/auth/me"),
          apiFetch<{ name: string }>(`/api/clubs/${slug}`),
        ]);
        // If cleanup ran while we were awaiting, abort — don't open a second WS.
        if (cancelled) return;
        setMessages(history);
        setCurrentUsername(me.username);
        setClubName(club.name);
      } catch (err: unknown) {
        if (err instanceof ApiError && err.status === 401) {
          router.replace("/login");
        } else if (err instanceof ApiError && err.status === 403) {
          router.replace(`/clubs/${slug}`);
        }
        return;
      }

      // Open WebSocket — Next.js proxies same-origin ws:// through its rewrite rules
      const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
      const ws = new WebSocket(`${proto}//${window.location.host}/api/clubs/${slug}/chat/ws`);
      wsRef.current = ws;

      ws.onopen = () => setStatus("connected");

      ws.onmessage = (event) => {
        const msg: ChatMessage = JSON.parse(event.data);
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
  }, [slug, router]);

  function sendMessage(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || status !== "connected" || !wsRef.current) return;
    wsRef.current.send(text);
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
        <Link href={`/clubs/${slug}`} style={{ fontSize: "0.9rem", color: "#555", textDecoration: "none" }}>← {clubName || "Club"}</Link>
        <span style={{ fontWeight: "bold", fontSize: "1rem" }}>Chat</span>
        <span style={{
          marginLeft: "auto", fontSize: "0.78rem", color: statusColor[status],
          display: "flex", alignItems: "center", gap: "0.3rem",
        }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: statusColor[status], display: "inline-block" }} />
          {status === "connected" ? "Live" : status === "connecting" ? "Connecting…" : "Disconnected — refresh to reconnect"}
        </span>
      </div>

      {/* Message list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "1rem", display: "flex", flexDirection: "column", gap: "0.5rem", background: "#f9f9f9" }}>
        {messages.length === 0 && status === "connected" && (
          <p style={{ color: "#aaa", textAlign: "center", margin: "auto" }}>No messages yet. Say hello!</p>
        )}
        {messages.map((msg) => {
          const isOwn = msg.author.username === currentUsername;
          return (
            <div
              key={msg.id}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: isOwn ? "flex-end" : "flex-start",
              }}
            >
              {!isOwn && (
                <span style={{ fontSize: "0.75rem", color: "#888", marginBottom: "0.15rem", paddingLeft: "0.25rem" }}>
                  {msg.author.display_name}
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
                display: "flex",
                flexDirection: "column",
              }}>
                <span>{msg.content}</span>
                <span style={{ alignSelf: "flex-end", fontSize: "0.68rem", color: isOwn ? "rgba(255,255,255,0.5)" : "#bbb", marginTop: "0.2rem", marginLeft: "0.5rem", flexShrink: 0 }}>
                  {timeLabel(msg.created_at)}
                </span>
              </div>
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
          style={{
            flex: 1, padding: "0.5rem 0.75rem", fontSize: "0.95rem",
            border: "1px solid #ccc", borderRadius: 20, fontFamily: "inherit",
            outline: "none",
          }}
        />
        <button
          type="submit"
          disabled={!input.trim() || status !== "connected"}
          style={{
            padding: "0.5rem 1.1rem", borderRadius: 20, cursor: "pointer",
            background: "#111", color: "#fff", border: "none", fontSize: "0.9rem",
            opacity: !input.trim() || status !== "connected" ? 0.4 : 1,
          }}
        >
          Send
        </button>
      </form>
    </main>
  );
}
