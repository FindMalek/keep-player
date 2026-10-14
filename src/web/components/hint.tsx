import type { ReactElement, ReactNode } from "react";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHintKeys } from "@/lib/shortcuts";
import { noteMouseUse } from "@/lib/tips";

/**
 * Tooltip with a label and its keyboard shortcut, for controls whose icon alone isn't obvious. Pass `shortcut` (a
 * registry id) so the keys shown follow the user's own bindings.
 */
export function Hint({
  label,
  keys: fixed,
  shortcut,
  children,
}: {
  label: ReactNode;
  keys?: string[];
  shortcut?: string;
  children: ReactElement;
}) {
  const registered = useHintKeys(shortcut ?? "");
  const keys = fixed ?? registered;
  return (
    <Tooltip>
      <TooltipTrigger
        render={<span className="inline-flex" />}
        // A real mouse click (not keyboard activation) counts towards the "here's its shortcut" tip.
        onClickCapture={(event) => shortcut && event.detail > 0 && noteMouseUse(shortcut)}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent className="flex items-center gap-2 font-mono">
        {label}
        {keys && (
          <KbdGroup>
            {keys.map((key) => (
              <Kbd key={key}>{key}</Kbd>
            ))}
          </KbdGroup>
        )}
      </TooltipContent>
    </Tooltip>
  );
}
