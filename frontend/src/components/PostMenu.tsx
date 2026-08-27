"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Flag, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function PostMenu({ postId, className }: { postId: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [modal, setModal] = useState(false);
  const [reason, setReason] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function submit() {
    const trimmed = reason.trim();
    if (trimmed.length < 10) {
      setError("Please describe the problem (at least 10 characters).");
      return;
    }
    setSending(true);
    setError(null);
    try {
      await apiFetch(`/api/posts/${postId}/report`, {
        method: "POST",
        body: JSON.stringify({ reason: trimmed }),
      });
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not send the report.");
    } finally {
      setSending(false);
    }
  }

  function closeModal() {
    setModal(false);
    setReason("");
    setError(null);
    setSent(false);
  }

  return (
    <>
      <div ref={menuRef} className={cn("relative flex-shrink-0", className)}>
        <button
          onClick={() => setOpen((v) => !v)}
          aria-label="Post options"
          className="flex items-center justify-center w-7 h-7 rounded-full text-on-surface-variant/50 hover:text-on-surface hover:bg-surface-container-low transition-colors"
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
        {open && (
          <div className="absolute right-0 top-8 z-30 min-w-[150px] bg-card border border-border rounded-xl shadow-lg overflow-hidden py-1">
            <button
              onClick={() => { setOpen(false); setModal(true); }}
              className="w-full flex items-center gap-2 px-3.5 py-2.5 text-xs font-medium text-on-surface hover:bg-muted transition-colors"
            >
              <Flag className="w-3.5 h-3.5 text-on-surface-variant" />
              Report post
            </button>
          </div>
        )}
      </div>

      {modal && (
        <>
          <div onClick={closeModal} className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]" />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(440px,94vw)] bg-surface rounded-2xl z-[101] shadow-2xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-outline-variant">
              <span className="font-semibold text-sm text-on-surface">Report post</span>
              <button
                onClick={closeModal}
                className="rounded-full p-1 hover:bg-surface-container text-on-surface-variant transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {sent ? (
              <div className="px-4 py-6 text-center space-y-3">
                <p className="text-sm text-on-surface font-medium">Report sent.</p>
                <p className="text-xs text-on-surface-variant">Thanks — a moderator will take a look.</p>
                <button
                  onClick={closeModal}
                  className="text-xs font-semibold px-4 py-2 rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <div className="px-4 py-4 space-y-3">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={4}
                  autoFocus
                  maxLength={500}
                  placeholder="What's wrong with this post?"
                  className="w-full resize-none text-sm leading-relaxed bg-surface-container-low rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-ring text-on-surface placeholder:text-on-surface-variant/60"
                />
                {error && <p className="text-xs text-destructive">{error}</p>}
                <div className="flex justify-end">
                  <button
                    onClick={submit}
                    disabled={sending || reason.trim().length < 10}
                    className={cn(
                      "text-xs font-semibold px-4 py-2 rounded-full transition-colors",
                      "bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40 disabled:cursor-not-allowed"
                    )}
                  >
                    {sending ? "Sending…" : "Send report"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </>
  );
}
