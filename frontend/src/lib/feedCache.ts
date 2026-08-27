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

export function patchFeedCachePost(id: string, patch: object): void {
  if (!cache) return;
  cache.posts = cache.posts.map((p) => {
    const post = p as { id: string };
    return post.id === id ? { ...post, ...patch } : p;
  });
}

export function clearFeedCache(): void {
  cache = null;
}
