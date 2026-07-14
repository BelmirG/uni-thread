// In-memory snapshot of the feed's loaded posts + scroll position.
//
// Module state, not sessionStorage: it only needs to survive a client-side
// navigation away and back (e.g. into a post's comments and "Back" again),
// not a hard reload — a fresh reload showing a clean feed is the expected,
// desirable behavior. Since Next.js App Router keeps the same JS module
// instances alive across client-side route changes, a plain variable here
// is all that's needed.
interface FeedCacheEntry<T> {
  feedTab: string;
  sort: string;
  facultyFilter: string | null;
  posts: T[];
  total: number;
  scrollY: number;
  savedAt: number;
}

const MAX_AGE_MS = 15 * 60 * 1000;

let cache: FeedCacheEntry<unknown> | null = null;

export function saveFeedCache<T>(entry: Omit<FeedCacheEntry<T>, "savedAt">): void {
  cache = { ...entry, savedAt: Date.now() };
}

export function getFeedCache<T>(): FeedCacheEntry<T> | null {
  if (!cache) return null;
  if (Date.now() - cache.savedAt > MAX_AGE_MS) {
    cache = null;
    return null;
  }
  return cache as FeedCacheEntry<T>;
}

// Call after any mutation made outside the feed page (e.g. deleting a post
// from its detail view) — otherwise navigating back would restore a snapshot
// that still contains the stale post.
export function clearFeedCache(): void {
  cache = null;
}
