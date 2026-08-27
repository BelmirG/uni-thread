interface ProfileCacheEntry<P, T, C> {
  profile: P;
  posts: T[];
  clubs: C[];
  savedAt: number;
}

const MAX_AGE_MS = 10 * 60 * 1000;

const cache = new Map<string, ProfileCacheEntry<unknown, unknown, unknown>>();

export function saveProfileCache<P, T, C>(
  username: string,
  entry: Omit<ProfileCacheEntry<P, T, C>, "savedAt">
): void {
  cache.set(username, { ...entry, savedAt: Date.now() });
}

export function getProfileCache<P, T, C>(username: string): ProfileCacheEntry<P, T, C> | null {
  const entry = cache.get(username);
  if (!entry) return null;
  if (Date.now() - entry.savedAt > MAX_AGE_MS) {
    cache.delete(username);
    return null;
  }
  return entry as ProfileCacheEntry<P, T, C>;
}

export function clearProfileCache(username: string): void {
  cache.delete(username);
}

export function clearProfileCaches(): void {
  cache.clear();
}
