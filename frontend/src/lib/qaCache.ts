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

export function clearQACache(): void {
  cache = null;
}
