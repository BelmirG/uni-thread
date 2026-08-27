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
