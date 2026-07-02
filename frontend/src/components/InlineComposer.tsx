"use client";

import { useEffect, useRef, useState, ReactNode } from "react";

const PILL_H = 48;

interface Props {
  open: boolean;
  onOpen: () => void;
  icon: ReactNode;
  placeholder: string;
  children: ReactNode;
  className?: string;
}

export function InlineComposer({ open, onOpen, icon, placeholder, children, className }: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [bodyH, setBodyH] = useState(0);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBodyH(el.offsetHeight));
    ro.observe(el);
    setBodyH(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      (bodyRef.current?.querySelector("textarea, input") as HTMLElement | null)?.focus();
    }, 60);
    return () => clearTimeout(t);
  }, [open]);

  // Fixed border-radius = half the pill height. At pill height it reads as a
  // perfect pill; when tall it reads as a rounded card. Because it never changes,
  // only the height animates — the pill "unrolls" into the box with no corner morph.
  const RADIUS = PILL_H / 2;
  const containerTransition = open
    ? "height 0.5s cubic-bezier(0,0,0.2,1)"
    : "height 0.5s cubic-bezier(0.4,0,0.2,1)";

  return (
    <div
      className={`relative bg-surface shadow-sm overflow-hidden ${className ?? ""}`}
      style={{
        // Pill label overlays the form — no separate always-on header row.
        // Closed: collapse to pill height. Open: exactly the form's height.
        height: open ? bodyH : PILL_H,
        borderRadius: RADIUS,
        transition: containerTransition,
      }}
    >
      {/* Pill label — absolute overlay, fades out fully on open (no dead row left behind) */}
      <div
        className="absolute inset-x-0 top-0 flex items-center gap-3 px-4 cursor-text select-none"
        style={{
          height: PILL_H,
          opacity: open ? 0 : 1,
          transition: open ? "opacity 0.15s ease" : "opacity 0.18s ease",
          pointerEvents: open ? "none" : "auto",
          zIndex: 2,
        }}
        onClick={() => { if (!open) onOpen(); }}
      >
        <span className="flex-shrink-0 text-on-surface-variant">{icon}</span>
        <span className="text-sm text-on-surface-variant">{placeholder}</span>
      </div>

      {/* Form body — always in DOM so ResizeObserver can measure it; fades in on open */}
      <div
        ref={bodyRef}
        style={{
          opacity: open ? 1 : 0,
          transition: open ? "opacity 0.28s ease" : "opacity 0.15s ease",
          pointerEvents: open ? "auto" : "none",
        }}
        aria-hidden={!open}
      >
        {children}
      </div>
    </div>
  );
}
