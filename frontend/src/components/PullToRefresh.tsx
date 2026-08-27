"use client";

import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";


const THRESHOLD = 70; // px of (eased) pull that arms the refresh
const MAX_PULL = 110; // indicator stops following the finger past this

export default function PullToRefresh() {
  const [pull, setPull] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const startYRef = useRef<number | null>(null);
  const pullRef = useRef(0);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (!standalone) return;
    setEnabled(true);

    function insideScrollable(el: Element | null): boolean {
      while (el && el !== document.body) {
        const style = window.getComputedStyle(el);
        if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight) return true;
        el = el.parentElement;
      }
      return false;
    }

    function onTouchStart(e: TouchEvent) {
      if (window.scrollY > 0) return;
      if (insideScrollable(e.target as Element)) return;
      startYRef.current = e.touches[0].clientY;
    }

    function onTouchMove(e: TouchEvent) {
      if (startYRef.current === null) return;
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta <= 0 || window.scrollY > 0) {
        pullRef.current = 0;
        setPull(0);
        return;
      }
      const eased = Math.min(MAX_PULL, delta * 0.45);
      pullRef.current = eased;
      setPull(eased);
    }

    function onTouchEnd() {
      if (startYRef.current === null) return;
      startYRef.current = null;
      if (pullRef.current >= THRESHOLD) {
        setRefreshing(true);
        window.location.reload();
      } else {
        pullRef.current = 0;
        setPull(0);
      }
    }

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: true });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []);

  if (!enabled || (pull === 0 && !refreshing)) return null;

  const armed = pull >= THRESHOLD || refreshing;

  return (
    <div
      className="fixed left-1/2 z-[300] pointer-events-none"
      style={{
        top: "calc(env(safe-area-inset-top) + 4px)",
        transform: `translateX(-50%) translateY(${(refreshing ? THRESHOLD : pull) - 48}px)`,
        opacity: refreshing ? 1 : Math.min(1, pull / THRESHOLD),
        transition: startYRef.current === null && !refreshing ? "transform 0.2s ease, opacity 0.2s ease" : undefined,
      }}
    >
      <div className="w-9 h-9 rounded-full bg-surface shadow-lg border border-outline-variant flex items-center justify-center">
        <RefreshCw
          className={refreshing ? "w-4 h-4 animate-spin" : "w-4 h-4"}
          style={{
            color: armed ? "#3865a6" : "#9ca3af",
            transform: refreshing ? undefined : `rotate(${pull * 2.5}deg)`,
          }}
        />
      </div>
    </div>
  );
}
