"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { Camera } from "lucide-react";

interface Preview {
  localUrl: string;
  remoteUrl: string | null;
  uploading: boolean;
  error: string | null;
}

interface Props {
  onUrlsChange: (urls: string[], uploading: boolean) => void;
  maxImages?: number;
}

export function ImageUploader({ onUrlsChange, maxImages = 5 }: Props) {
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const cbRef = useRef(onUrlsChange);
  cbRef.current = onUrlsChange;

  const closeLightbox = useCallback(() => setLightbox(null), []);

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") closeLightbox(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lightbox, closeLightbox]);

  useEffect(() => {
    const urls = previews.filter((p) => p.remoteUrl !== null).map((p) => p.remoteUrl!);
    const uploading = previews.some((p) => p.uploading);
    cbRef.current(urls, uploading);
  }, [previews]);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, maxImages - previews.length);
    if (!files.length) return;
    if (inputRef.current) inputRef.current.value = "";

    const startIndex = previews.length;
    const newPreviews: Preview[] = files.map((f) => ({
      localUrl: URL.createObjectURL(f),
      remoteUrl: null,
      uploading: true,
      error: null,
    }));
    setPreviews((prev) => [...prev, ...newPreviews]);

    await Promise.all(
      files.map(async (file, i) => {
        const idx = startIndex + i;
        const fd = new FormData();
        fd.append("file", file);
        try {
          const res = await fetch("/api/upload", {
            method: "POST",
            credentials: "include",
            body: fd,
          });
          if (!res.ok) {
            const body = (await res.json().catch(() => ({}))) as { detail?: string };
            throw new Error(body.detail ?? "Upload failed");
          }
          const { url } = (await res.json()) as { url: string };
          setPreviews((prev) => {
            const next = [...prev];
            if (next[idx]) next[idx] = { ...next[idx], remoteUrl: url, uploading: false };
            return next;
          });
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Upload failed";
          setPreviews((prev) => {
            const next = [...prev];
            if (next[idx]) next[idx] = { ...next[idx], uploading: false, error: msg };
            return next;
          });
        }
      })
    );
  }

  function remove(i: number) {
    setPreviews((prev) => prev.filter((_, j) => j !== i));
  }

  const canAdd = previews.length < maxImages;

  return (
    <div>
      {canAdd && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            multiple
            style={{ display: "none" }}
            onChange={handleChange}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            style={{
              padding: "0.3rem 0.75rem",
              fontSize: "0.82rem",
              border: "1px solid #ddd",
              borderRadius: 6,
              background: "#fafafa",
              cursor: "pointer",
              color: "#555",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.35rem",
            }}
          >
            <Camera size={15} /> Add photos
          </button>
        </>
      )}

      {previews.length > 0 && (
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", marginTop: "0.5rem" }}>
          {previews.map((p, i) => (
            <div key={i} style={{ position: "relative", width: 72, height: 72, flexShrink: 0 }}>
              <img
                src={p.localUrl}
                alt=""
                onClick={() => setLightbox(p.localUrl)}
                style={{
                  width: 72,
                  height: 72,
                  objectFit: "cover",
                  borderRadius: 4,
                  display: "block",
                  border: p.error ? "2px solid #e53935" : "1px solid #e0e0e0",
                  cursor: "zoom-in",
                }}
              />
              {p.uploading && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(0,0,0,0.45)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: 4,
                    fontSize: "0.62rem",
                    color: "#fff",
                  }}
                >
                  uploading…
                </div>
              )}
              {p.error && !p.uploading && (
                <div
                  style={{
                    position: "absolute",
                    bottom: 2,
                    left: 2,
                    right: 2,
                    background: "rgba(229,57,53,0.85)",
                    borderRadius: 3,
                    fontSize: "0.58rem",
                    color: "#fff",
                    textAlign: "center",
                    padding: "0.1rem",
                  }}
                >
                  failed
                </div>
              )}
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label="Remove image"
                style={{
                  position: "absolute",
                  top: 2,
                  right: 2,
                  width: 16,
                  height: 16,
                  borderRadius: "50%",
                  background: "rgba(0,0,0,0.6)",
                  color: "#fff",
                  border: "none",
                  cursor: "pointer",
                  fontSize: "0.7rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox — rendered in a portal so position:fixed is relative to the
          viewport, not the composer panel (which has a CSS transform that would
          otherwise confine the overlay to the panel's bounds). */}
      {lightbox && createPortal(
        <div
          onClick={(e) => { e.stopPropagation(); closeLightbox(); }}
          onMouseDown={(e) => e.stopPropagation()}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9999,
            background: "rgba(0,0,0,0.85)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <img
            src={lightbox}
            alt="Preview"
            onClick={(e) => e.stopPropagation()}
            onMouseDown={(e) => e.stopPropagation()}
            style={{
              maxWidth: "90vw",
              maxHeight: "90vh",
              objectFit: "contain",
              borderRadius: 8,
              boxShadow: "0 8px 40px rgba(0,0,0,0.6)",
            }}
          />
          <button
            onClick={(e) => { e.stopPropagation(); closeLightbox(); }}
            onMouseDown={(e) => e.stopPropagation()}
            aria-label="Close preview"
            style={{
              position: "absolute",
              top: 16,
              right: 16,
              width: 36,
              height: 36,
              borderRadius: "50%",
              background: "rgba(255,255,255,0.15)",
              border: "none",
              color: "#fff",
              fontSize: "1.2rem",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            ×
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
