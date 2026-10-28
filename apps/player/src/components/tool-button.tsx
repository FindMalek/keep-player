import { Button } from "@lodesong/ui/components/button";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export /** Ghost icon button; `on` adds the small square under it that marks an active mode. */
function ToolButton({ on, className, ...props }: ComponentProps<typeof Button> & { on?: boolean }) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className={cn(
        "relative text-muted-foreground hover:text-foreground",
        on && "text-foreground after:absolute after:bottom-0.5 after:left-1/2 after:size-1 after:-translate-x-1/2 after:bg-foreground",
        className,
      )}
      // Toggle buttons announce their state.
      aria-pressed={on}
      {...props}
    />
  );
}
