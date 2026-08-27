
const VIDEO_RE = /\.(mp4|webm|mov)$/i;

export function isVideoUrl(url: string): boolean {
  // Strip any query string before testing the extension.
  return VIDEO_RE.test(url.split("?")[0]);
}
