import { StarIcon } from "lucide-react";
import { useState } from "react";
import { notify } from "@/lib/notify";
import { api } from "@/lib/subsonic";
import { cn } from "@/lib/utils";

/** 1–5 stars via setRating; clicking the current rating clears it. */
export function Rating({ id, value, label }: { id: string; value?: number; label: string }) {
  const [rating, setRating] = useState(value ?? 0);
  async function rate(next: number): Promise<void> {
    const previous = rating;
    setRating(next);
    try {
      await api("setRating", { id, rating: next });
    } catch {
      setRating(previous);
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
