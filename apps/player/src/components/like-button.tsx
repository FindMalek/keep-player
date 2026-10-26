import { Button } from "@keep/ui/components/button";
import { HeartIcon } from "lucide-react";
import { type LikeKind, toggleLiked, useLiked } from "@/lib/likes";
import { cn } from "@/lib/utils";

/** A heart; in rows it only shows on hover or focus until liked, so lists stay quiet. */
export function LikeButton({
  kind,
  id,
  label,
  quiet = false,
  className,
}: {
  kind: LikeKind;
  id: string;
  label: string;
  quiet?: boolean;
  className?: string;
}) {
  const liked = useLiked(id);
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label={liked ? `unlike ${label}` : `like ${label}`}
      aria-pressed={liked}
      className={cn(
        quiet && !liked && "opacity-0 focus-visible:opacity-100 group-focus-within/row:opacity-100 group-hover/row:opacity-100",
        className,
      )}
      onClick={(event) => {
        event.stopPropagation();
        void toggleLiked(kind, id, label);
      }}
      onDoubleClick={(event) => event.stopPropagation()}
    >
      <HeartIcon className={cn(liked && "fill-current")} />
    </Button>
  );
}
