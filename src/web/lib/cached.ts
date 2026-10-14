import { queryClient } from "./queries";

/*
 * What lists already know about an item (an album card's name, cover and track count), so its page can paint the
 * header and the right number of placeholder rows at once instead of waiting for the full fetch.
 */

function find(value: unknown, id: string, depth: number): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || depth > 4) return undefined;
  if (Array.isArray(value)) {
    for (const item of value) {
      if (item && typeof item === "object" && (item as { id?: unknown }).id === id) return item as Record<string, unknown>;
      const nested = find(item, id, depth + 1);
      if (nested) return nested;
    }
    return undefined;
  }
  for (const nested of Object.values(value)) {
    const found = find(nested, id, depth + 1);
    if (found) return found;
  }
  return undefined;
}

/** The first cached item with this id in queries whose key starts with one of `keys` (lists of the same kind). */
export function cachedSummary<T>(id: string, keys: string[]): T | undefined {
  for (const [, data] of queryClient.getQueriesData({ predicate: (query) => keys.includes(String(query.queryKey[0])) })) {
    const found = find(data, id, 0);
    if (found) return found as T;
  }
  return undefined;
}
