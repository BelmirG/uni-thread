"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

// The viewport is locked to scale 1 (to stop iOS's input auto-zoom), so the
// viewer implements its own photo zoom: pinch to zoom, one-finger pan while
// zoomed, double-tap to toggle — like a native gallery. At base scale the
// familiar swipes still work: horizontal for prev/next, vertical to close.
const ZOOM_MAX = 5;
const DOUBLE_TAP_ZOOM = 2.5;

interface Gesture {
  mode: "swipe" | "pan" | "pinch";
  startX: number; startY: number;
  lastX: number; lastY: number;
  lastDist: number;
  lastMidX: number; lastMidY: number;
}

function Lightbox({ urls, startIndex, onClose }: { urls: string[]; startIndex: number; onClose: () => void }) {
  const [idx, setIdx] = useState(startIndex);
  const [t, setT] = useState({ s: 1, tx: 0, ty: 0 });
  const [gesturing, setGesturing] = useState(false);
  const tRef = useRef(t);
  tRef.current = t;
  const gRef = useRef<Gesture | null>(null);
  const lastTapRef = useRef(0);

  function prev() { setIdx((i) => Math.max(0, i - 1)); }
  function next() { setIdx((i) => Math.min(urls.length - 1, i + 1)); }

  useEffect(() => { setT({ s: 1, tx: 0, ty: 0 }); }, [idx]);

  useEffect(() => {
    const prev_ = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev_; };
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
      if (e.key === "ArrowRight") setIdx((i) => Math.min(urls.length - 1, i + 1));
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, urls.length]);

  // Keep the image from being panned entirely off screen; a little slack past
  // the true edge feels natural and the release snap tidies it up.
  function clampT(s: number, tx: number, ty: number) {
    const maxX = ((s - 1) * window.innerWidth) / 2 + 40;
    const maxY = ((s - 1) * window.innerHeight) / 2 + 40;
    return { s, tx: Math.min(maxX, Math.max(-maxX, tx)), ty: Math.min(maxY, Math.max(-maxY, ty)) };
  }

  function onTouchStart(e: React.TouchEvent) {
    if (e.touches.length >= 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      gRef.current = {
        mode: "pinch", startX: 0, startY: 0, lastX: 0, lastY: 0,
        lastDist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        lastMidX: (a.clientX + b.clientX) / 2,
        lastMidY: (a.clientY + b.clientY) / 2,
      };
      setGesturing(true);
    } else {
      const touch = e.touches[0];
      const zoomed = tRef.current.s > 1;
      gRef.current = {
        mode: zoomed ? "pan" : "swipe",
        startX: touch.clientX, startY: touch.clientY,
        lastX: touch.clientX, lastY: touch.clientY,
        lastDist: 0, lastMidX: 0, lastMidY: 0,
      };
      if (zoomed) setGesturing(true);
    }
  }

  function onTouchMove(e: React.TouchEvent) {
    const g = gRef.current;
    if (!g) return;
    if (g.mode === "pinch" && e.touches.length >= 2) {
      const [a, b] = [e.touches[0], e.touches[1]];
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
      const midX = (a.clientX + b.clientX) / 2;
      const midY = (a.clientY + b.clientY) / 2;
      const { s, tx, ty } = tRef.current;
      const sNew = Math.min(ZOOM_MAX, Math.max(1, s * (g.lastDist > 0 ? dist / g.lastDist : 1)));
      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      // Keep the point between the fingers anchored while the scale changes.
      const txNew = midX - cx - (sNew / s) * (g.lastMidX - cx - tx);
      const tyNew = midY - cy - (sNew / s) * (g.lastMidY - cy - ty);
      g.lastDist = dist; g.lastMidX = midX; g.lastMidY = midY;
      setT(clampT(sNew, txNew, tyNew));
    } else if (g.mode === "pan" && e.touches.length === 1) {
      const touch = e.touches[0];
      const { s, tx, ty } = tRef.current;
      setT(clampT(s, tx + touch.clientX - g.lastX, ty + touch.clientY - g.lastY));
      g.lastX = touch.clientX; g.lastY = touch.clientY;
    } else if (g.mode === "swipe" && e.touches.length === 1) {
      g.lastX = e.touches[0].clientX; g.lastY = e.touches[0].clientY;
    }
  }

  function onTouchEnd(e: React.TouchEvent) {
    const g = gRef.current;
    if (!g) return;
    if (e.touches.length >= 1) {
      // A pinch finger lifted — carry on as pan (zoomed) or swipe (base scale).
      const touch = e.touches[0];
      const zoomed = tRef.current.s > 1;
      gRef.current = {
        mode: zoomed ? "pan" : "swipe",
        startX: touch.clientX, startY: touch.clientY,
        lastX: touch.clientX, lastY: touch.clientY,
        lastDist: 0, lastMidX: 0, lastMidY: 0,
      };
      return;
    }
    gRef.current = null;
    setGesturing(false);
    if (tRef.current.s <= 1.05) {
      if (tRef.current.s !== 1) setT({ s: 1, tx: 0, ty: 0 });
      if (g.mode === "swipe") {
        const dx = g.startX - g.lastX;
        const dy = g.lastY - g.startY;
        // Vertical swipe (either direction) dismisses — the gesture every
        // native photo viewer supports; essential in the home-screen app.
        if (Math.abs(dy) > 60 && Math.abs(dy) > Math.abs(dx)) { onClose(); return; }
        if (dx > 40) next();
        else if (dx < -40) prev();
      }
    }
  }

  function onImageTap(e: React.MouseEvent) {
    e.stopPropagation();
    const now = Date.now();
    if (now - lastTapRef.current < 300) {
      lastTapRef.current = 0;
      if (tRef.current.s > 1) {
        setT({ s: 1, tx: 0, ty: 0 });
      } else {
        const cx = window.innerWidth / 2;
        const cy = window.innerHeight / 2;
        setT(clampT(DOUBLE_TAP_ZOOM, (1 - DOUBLE_TAP_ZOOM) * (e.clientX - cx), (1 - DOUBLE_TAP_ZOOM) * (e.clientY - cy)));
      }
    } else {
      lastTapRef.current = now;
    }
  }

  return (
    <div
      onClick={() => { if (tRef.current.s === 1) onClose(); }}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center", touchAction: "none", overflow: "hidden" }}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
    >
      {/* Close — kept below the iPhone notch/status bar via safe-area inset */}
      <button
        onClick={onClose}
        style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 16px)", right: 16, background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", borderRadius: "50%", width: 38, height: 38, fontSize: "1.3rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}
      >×</button>

      {/* Counter */}
      {urls.length > 1 && (
        <div style={{ position: "absolute", top: "calc(env(safe-area-inset-top, 0px) + 20px)", left: "50%", transform: "translateX(-50%)", color: "#fff", fontSize: "0.85rem", background: "rgba(0,0,0,0.4)", padding: "0.2rem 0.7rem", borderRadius: 12 }}>
          {idx + 1} / {urls.length}
        </div>
      )}

      {/* Image — tap stops propagation so it doesn't close; double-tap zooms */}
      <img
        src={urls[idx]}
        alt=""
        onClick={onImageTap}
        draggable={false}
        style={{
          maxWidth: "92vw",
          maxHeight: "88vh",
          objectFit: "contain",
          borderRadius: 6,
          display: "block",
          userSelect: "none",
          transform: `translate(${t.tx}px, ${t.ty}px) scale(${t.s})`,
          transition: gesturing ? "none" : "transform 0.2s ease",
          willChange: "transform",
        }}
      />

      {/* Prev */}
      {idx > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); prev(); }}
          style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", borderRadius: "50%", width: 44, height: 44, fontSize: "1.5rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >‹</button>
      )}

      {/* Next */}
      {idx < urls.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); next(); }}
          style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", background: "rgba(255,255,255,0.12)", border: "none", color: "#fff", borderRadius: "50%", width: 44, height: 44, fontSize: "1.5rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >›</button>
      )}
    </div>
  );
}

export function ImageGrid({ urls }: { urls: string[] }) {
  const [carouselIndex, setCarouselIndex] = useState(0);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);
  // A referenced file can be gone from disk; hiding it beats rendering the
  // browser's broken-image placeholder in the middle of a post.
  const [failed, setFailed] = useState<string[]>([]);

  const live = urls.filter((u) => !failed.includes(u));
  const idx = Math.min(carouselIndex, Math.max(0, live.length - 1));

  if (!live.length) return null;

  const markFailed = (u: string) =>
    setFailed((prev) => (prev.includes(u) ? prev : [...prev, u]));

  function prevCarousel() { setCarouselIndex((i) => Math.max(0, i - 1)); }
  function nextCarousel() { setCarouselIndex((i) => Math.min(live.length - 1, i + 1)); }

  if (live.length === 1) {
    return (
      <>
        <div style={{ marginBottom: "0.65rem", borderRadius: 8, overflow: "hidden", cursor: "zoom-in" }}>
          <img
            src={live[0]}
            alt=""
            loading="lazy"
            decoding="async"
            onClick={() => setLightboxIndex(0)}
            onError={() => markFailed(live[0])}
            style={{ width: "100%", maxHeight: 500, objectFit: "cover", display: "block" }}
          />
        </div>
        {lightboxIndex !== null && createPortal(
          <Lightbox urls={live} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />,
          document.body
        )}
      </>
    );
  }

  return (
    <>
      <div style={{ marginBottom: "0.65rem", userSelect: "none" }}>
        <div
          style={{ position: "relative", borderRadius: 8, overflow: "hidden", background: "#111", cursor: "zoom-in" }}
          onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchStartX === null) return;
            const dx = touchStartX - e.changedTouches[0].clientX;
            if (dx > 40) nextCarousel();
            else if (dx < -40) prevCarousel();
            setTouchStartX(null);
          }}
        >
          <img
            src={live[idx]}
            alt={`Image ${idx + 1} of ${live.length}`}
            loading="lazy"
            decoding="async"
            onClick={() => setLightboxIndex(idx)}
            onError={() => markFailed(live[idx])}
            style={{ width: "100%", maxHeight: 420, objectFit: "cover", display: "block" }}
          />

          {idx > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); prevCarousel(); }}
              style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", color: "#fff", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", fontSize: "1.2rem", display: "flex", alignItems: "center", justifyContent: "center" }}
            >‹</button>
          )}

          {idx < live.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); nextCarousel(); }}
              style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "rgba(0,0,0,0.5)", color: "#fff", border: "none", borderRadius: "50%", width: 32, height: 32, cursor: "pointer", fontSize: "1.2rem", display: "flex", alignItems: "center", justifyContent: "center" }}
            >›</button>
          )}

          <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(0,0,0,0.55)", color: "#fff", fontSize: "0.75rem", padding: "0.15rem 0.45rem", borderRadius: 10 }}>
            {idx + 1} / {live.length}
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "center", gap: 5, marginTop: "0.4rem" }}>
          {live.map((_, i) => (
            <button
              key={i}
              onClick={() => setCarouselIndex(i)}
              style={{ width: i === idx ? 18 : 6, height: 6, borderRadius: 3, border: "none", padding: 0, cursor: "pointer", background: i === idx ? "#333" : "#bbb", transition: "width 0.15s ease" }}
            />
          ))}
        </div>
      </div>

      {lightboxIndex !== null && createPortal(
        <Lightbox urls={live} startIndex={lightboxIndex} onClose={() => setLightboxIndex(null)} />,
        document.body
      )}
    </>
  );
}
