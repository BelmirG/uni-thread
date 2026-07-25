/* Post media (image_urls) can hold both images and videos — they share one
 * array so every surface that already renders post media (feed, post detail,
 * club feed) supports video with no schema change. Consumers switch on the
 * file extension to render <img> vs <video>. */

const VIDEO_RE = /\.(mp4|webm|mov)$/i;

export function isVideoUrl(url: string): boolean {
  // Strip any query string before testing the extension.
  return VIDEO_RE.test(url.split("?")[0]);
}
