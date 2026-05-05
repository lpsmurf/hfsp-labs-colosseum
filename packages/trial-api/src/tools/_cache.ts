type CacheEntry<T> = { value: T; expiresAt: number };
const store = new Map<string, CacheEntry<unknown>>();

export async function withCache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T & { cached: boolean }> {
  const now = Date.now();
  const entry = store.get(key) as CacheEntry<T> | undefined;
  if (entry && entry.expiresAt > now) {
    return { ...(entry.value as object), cached: true } as T & { cached: boolean };
  }
  const value = await fn();
  store.set(key, { value, expiresAt: now + ttlSeconds * 1000 });
  return { ...(value as object), cached: false } as T & { cached: boolean };
}

export function bustCache(key: string): void {
  store.delete(key);
}
