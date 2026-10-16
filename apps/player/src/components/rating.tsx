import { StarIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { notify } from "@/lib/notify";
import { api } from "@/lib/subsonic";
import { cn } from "@/lib/utils";

/*
 * Ratings you set win over what cached song objects say (their userRating is from before), so a rating never looks
 * undone when you come back to a list, or after a reload: the persisted cache keeps old song objects for up to an hour
 * (album staleTime) before they're refetched, so what you set is kept here for that long.
 */
const KEY = "keep-player:ratings";
const KEEP_MS = 60 * 60_000;

function load(): Map<string, { rating: number; at: number }> {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "{}") as Record<string, { rating: number; at: number }>;
    return new Map(Object.entries(stored).filter(([, entry]) => Date.now() - entry.at < KEEP_MS));
  } catch {
    return new Map();
  }
}

const rated = load();
const listeners = new Set<() => void>();
function setRated(id: string, rating: number): void {
  rated.set(id, { rating, at: Date.now() });
  try {
    localStorage.setItem(KEY, JSON.stringify(Object.fromEntries(rated)));
  } catch {
    // Kept for this session only.
  }
  for (const listener of listeners) listener();
}
function useRated(id: string, fallback: number): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => rated.get(id)?.rating ?? fallback,
  );
}

/** 1–5 stars via setRating; clicking the current rating clears it. */
export function Rating({ id, value, label }: { id: string; value?: number; label: string }) {
  const rating = useRated(id, value ?? 0);
  async function rate(next: number): Promise<void> {
    const previous = rating;
    setRated(id, next);
    try {
      await api("setRating", { id, rating: next });
    } catch {
      setRated(id, previous);
      notify({ kind: "error", message: `couldn't rate ${label}` });
    }
  }
  return (
    <fieldset aria-label={`rating for ${label}`} className="flex" onDoubleClick={(event) => event.stopPropagation()}>
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          aria-label={`${star} star${star > 1 ? "s" : ""}`}
          aria-pressed={rating === star}
          className={cn("p-0.5", star <= rating ? "text-foreground" : "text-faint hover:text-muted-foreground")}
          onClick={(event) => {
            event.stopPropagation();
            void rate(rating === star ? 0 : star);
          }}
        >
          <StarIcon className={cn("size-3", star <= rating && "fill-current")} />
        </button>
      ))}
    </fieldset>
  );
}
