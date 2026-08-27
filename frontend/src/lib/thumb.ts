const UPLOAD_IMAGE_RE = /^(\/uploads\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.(jpg|jpeg|png|webp)$/i;

export function thumbUrl(url: string): string {
  const m = url.match(UPLOAD_IMAGE_RE);
  return m ? `${m[1]}_t.webp` : url;
}
