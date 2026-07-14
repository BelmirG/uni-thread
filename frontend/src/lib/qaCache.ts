// In-memory snapshot of the Q&A board's loaded posts + scroll position.
// Same rationale as lib/feedCache.ts: survives a client-side navigation into
// a question's answers and back, but intentionally not a hard reload.
interface QACacheEntry<T> {
  facultyFilter: string | null;
  posts: T[];
  total: number;
  scrollY: number;
  savedAt: number;
}

const MAX_AGE_MS = 15 * 60 * 1000;

let cache: QACacheEntry<unknown> | null = null;

export function saveQACache<T>(entry: Omit<QACacheEntry<T>, "savedAt">): void {
  cache = { ...entry, savedAt: Date.now() };
}

export function getQACache<T>(): QACacheEntry<T> | null {
  if (!cache) return null;
  if (Date.now() - cache.savedAt > MAX_AGE_MS) {
    cache = null;
    return null;
  }
  return cache as QACacheEntry<T>;
}

// Same rationale as clearFeedCache: mutations made from a question's detail
// view must not be resurrected by the board's cached snapshot.
export function clearQACache(): void {
  cache = null;
}
