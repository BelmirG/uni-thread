export function isImmersiveRoute(pathname: string): boolean {
  if (/^\/messages\/[^/]+$/.test(pathname)) return true;
  // Club chat: /clubs/<slug>/chat
  if (/^\/clubs\/[^/]+\/chat$/.test(pathname)) return true;
  return false;
}
