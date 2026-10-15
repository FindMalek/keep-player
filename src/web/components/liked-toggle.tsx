import { HeartIcon } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";

/** "Only what I liked" on the albums and artists pages. */
export function LikedToggle({ pressed, onPressedChange }: { pressed: boolean; onPressedChange: (pressed: boolean) => void }) {
  return (
    <Toggle variant="outline" size="sm" pressed={pressed} onPressedChange={onPressedChange} className="font-mono font-normal">
      <HeartIcon className={cn(pressed && "fill-current")} />
      liked
    </Toggle>
  );
}
