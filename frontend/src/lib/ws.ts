/**
 * Build a WebSocket URL for a given API path.
 *
 * Local dev: connects same-origin (ws://localhost:3000/api/...) and Next.js's dev
 * server tunnels it to the backend — no env needed.
 *
 * Production: Next.js's rewrite proxy does NOT forward WebSocket upgrades, so we
 * connect straight to the backend's public origin. Set NEXT_PUBLIC_WS_ORIGIN to the
 * backend URL (e.g. https://api.iusconnect.ba); the session cookie rides along
 * because it's issued for the shared parent domain.
 */
export function wsUrl(path: string): string {
  const origin = process.env.NEXT_PUBLIC_WS_ORIGIN;
  if (origin) {
    // https://api.example.com → wss://api.example.com
    const wsOrigin = origin.replace(/^http/, "ws");
    return `${wsOrigin}${path}`;
  }
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}${path}`;
}
