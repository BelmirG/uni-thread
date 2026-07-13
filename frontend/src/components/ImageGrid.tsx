"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

function Lightbox({ urls, startIndex, onClose }: { urls: string[]; startIndex: number; onClose: () => void }) {
  const [idx, setIdx] = useState(startIndex);
  const [touchStartX, setTouchStartX] = useState<number | null>(null);

  function prev() { setIdx((i) => Math.max(0, i - 1)); }
  function next() { setIdx((i) => Math.min(urls.length - 1, i + 1)); }

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

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", zIndex: 1001, display: "flex", alignItems: "center", justifyContent: "center" }}
      onTouchStart={(e) => setTouchStartX(e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchStartX === null) return;
        const dx = touchStartX - e.changedTouches[0].clientX;
        if (dx > 40) next();
        else if (dx < -40) prev();
        setTouchStartX(null);
      }}
    >
      {/* Close */}
      <button
        onClick={onClose}
        style={{ position: "absolute", top: 16, right: 16, background: "rgba(255,255,255,0.1)", border: "none", color: "#fff", borderRadius: "50%", width: 38, height: 38, fontSize: "1.3rem", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1 }}
      >×</button>

      {/* Counter */}
      {urls.length > 1 && (
        <div style={{ position: "absolute", top: 20, left: "50%", transform: "translateX(-50%)", color: "#fff", fontSize: "0.85rem", background: "rgba(0,0,0,0.4)", padding: "0.2rem 0.7rem", borderRadius: 12 }}>
          {idx + 1} / {urls.length}
        </div>
      )}

      {/* Image — stop propagation so clicking image itself doesn't close */}
      <img
        src={urls[idx]}
        alt=""
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "92vw", maxHeight: "88vh", objectFit: "contain", borderRadius: 6, display: "block", userSelect: "none" }}
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
