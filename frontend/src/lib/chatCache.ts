// In-memory snapshots of open conversations and club chats, so navigating
// back into a chat paints the last-seen messages instantly (like the feed
// cache) while the fresh fetch catches up in the background.
//
// Module state on purpose — survives client-side navigation, not a reload.
// Pending/failed optimistic bubbles are stripped by the callers before saving;
// only server-confirmed messages belong in a snapshot.

const MAX_AGE_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 15;

interface Snapshot {
  data: unknown;
  savedAt: number;
}

const dmCache = new Map<string, Snapshot>();
const clubChatCache = new Map<string, Snapshot>();

function save(cache: Map<string, Snapshot>, key: string, data: unknown): void {
  cache.delete(key); // re-insert so Map order doubles as LRU order
  cache.set(key, { data, savedAt: Date.now() });
  while (cache.size > MAX_ENTRIES) {
    cache.delete(cache.keys().next().value!);
  }
}

function get<T>(cache: Map<string, Snapshot>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.savedAt > MAX_AGE_MS) {
    cache.delete(key);
    return null;
  }
  return entry.data as T;
}

export function saveDmCache(conversationId: string, data: unknown): void {
  save(dmCache, conversationId, data);
}

export function getDmCache<T>(conversationId: string): T | null {
  return get<T>(dmCache, conversationId);
}

export function saveClubChatCache(slug: string, data: unknown): void {
  save(clubChatCache, slug, data);
}

export function getClubChatCache<T>(slug: string): T | null {
  return get<T>(clubChatCache, slug);
}

// One account's chats must never flash up for another account on the same
// device — wired into clearAllPageCaches (login/logout).
export function clearChatCaches(): void {
  dmCache.clear();
  clubChatCache.clear();
}
