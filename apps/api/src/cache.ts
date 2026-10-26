import { RedisClient } from "bun";

export interface Cache {
  get<T>(key: string): Promise<T | undefined>;
  set(key: string, value: unknown, ttlMs: number): Promise<void>;
}

const MAX_ENTRIES = 1000;

export function memoryCache(now: () => number = Date.now): Cache {
  // A Map keeps insertion order: re-inserting on read makes the first key the least recently used.
  const entries = new Map<string, { value: unknown; until: number }>();
  return {
    async get<T>(key: string) {
      const entry = entries.get(key);
      if (!entry) return undefined;
      entries.delete(key);
      if (entry.until <= now()) return undefined;
      entries.set(key, entry);
      return entry.value as T;
    },
    async set(key, value, ttlMs) {
      entries.delete(key);
      entries.set(key, { value, until: now() + ttlMs });
      const oldest = entries.keys().next().value;
      if (entries.size > MAX_ENTRIES && oldest !== undefined) entries.delete(oldest);
    },
  };
}

/** Redis down means a miss, never an error: the answer is computed again. */
function redisCache(url: string): Cache {
  // Fail fast while disconnected instead of queueing until it reconnects: a miss costs ~30 ms, a wait seconds.
  const client = new RedisClient(url, { enableOfflineQueue: false });
  return {
    async get<T>(key: string) {
      const raw = await client.get(`keep-player:${key}`).catch(() => null);
      try {
        return raw ? (JSON.parse(raw) as T) : undefined;
      } catch {
        return undefined;
      }
    },
    async set(key, value, ttlMs) {
      await client.set(`keep-player:${key}`, JSON.stringify(value), "PX", ttlMs).catch(() => undefined);
    },
  };
}

export const createCache = (redisUrl?: string): Cache => (redisUrl ? redisCache(redisUrl) : memoryCache());
