import { StarIcon } from "lucide-react";
import { useSyncExternalStore } from "react";
import { notify } from "@/lib/notify";
import { api } from "@/lib/subsonic";
import { cn } from "@/lib/utils";

/*
 * Ratings you set this session win over what cached song objects say (their userRating is from before), so a rating
 * never looks undone when you come back to a list.
 */
const rated = new Map<string, number>();
const listeners = new Set<() => void>();
function setRated(id: string, rating: number): void {
  rated.set(id, rating);
  for (const listener of listeners) listener();
}
function useRated(id: string, fallback: number): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => rated.get(id) ?? fallback,
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
