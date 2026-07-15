/* Client-side image downscaling before upload.
 *
 * Phone photos are 3–8 MB, and the phone's uplink is the slowest link in the
 * chain — uploading the original just so the server can immediately shrink it
 * makes sending feel sluggish. Resizing on-device first (like Instagram and
 * Messenger do) cuts uploads 5–10× with no visible quality loss.
 *
 * The server-side pipeline (magic-byte check, EXIF strip, 2560px cap) still
 * runs on whatever we send — this is a bandwidth optimization, not a
 * replacement for it. On any failure we fall back to the original file:
 * never block a send over an optimization.
 */

const MAX_DIMENSION = 2048; // px, longest side — indistinguishable on phones/laptops
const JPEG_QUALITY = 0.85;
const SKIP_BELOW_BYTES = 300 * 1024; // already cheap to upload as-is

export async function compressImage(file: File): Promise<File> {
  try {
    if (!file.type.startsWith("image/")) return file;
    if (file.type === "image/gif") return file; // canvas would freeze the animation
    if (file.size < SKIP_BELOW_BYTES) return file;

    const source = await decode(file);
    const srcW = "naturalWidth" in source ? source.naturalWidth : source.width;
    const srcH = "naturalHeight" in source ? source.naturalHeight : source.height;
    if (!srcW || !srcH) return file;

    const scale = Math.min(1, MAX_DIMENSION / Math.max(srcW, srcH));
    const w = Math.max(1, Math.round(srcW * scale));
    const h = Math.max(1, Math.round(srcH * scale));

    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(source, 0, 0, w, h);
    if ("close" in source) source.close();

    // PNGs with transparency must stay PNG (JPEG has no alpha channel);
    // opaque PNGs — usually photos saved the wrong way — become JPEG.
    const keepPng = file.type === "image/png" && hasAlpha(canvas);
    const type = keepPng ? "image/png" : "image/jpeg";
    const blob = await toBlob(canvas, type, keepPng ? undefined : JPEG_QUALITY);
    if (!blob || blob.size >= file.size) return file; // no win — keep original

    const stem = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${stem}${keepPng ? ".png" : ".jpg"}`, { type });
  } catch {
    return file;
  }
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  try {
    // "from-image" bakes EXIF rotation into the pixels, so the re-encoded
    // output (which carries no EXIF) still displays the right way up.
    return await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    // Older browsers: <img> decode applies orientation by default.
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode failed")); };
      img.src = url;
    });
  }
}

// Downscaling preserves full opacity, so sampling a 64×64 thumbnail is enough
// to tell whether the image uses transparency — without reading megapixels.
function hasAlpha(canvas: HTMLCanvasElement): boolean {
  const probe = document.createElement("canvas");
  probe.width = 64;
  probe.height = 64;
  const ctx = probe.getContext("2d");
  if (!ctx) return true; // can't tell — assume alpha, PNG stays PNG
  ctx.drawImage(canvas, 0, 0, 64, 64);
  const data = ctx.getImageData(0, 0, 64, 64).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}
