import { type ReactElement, type ReactNode, useLayoutEffect, useRef } from "react";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { useHintKeys } from "@/lib/shortcuts";
import { noteMouseUse } from "@/lib/tips";
import { loadTooltips, tooltipClosed, useOpenDelay, useTooltips } from "@/lib/tooltips";

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
  const tooltips = useTooltips();
  const delay = useOpenDelay();
  const onClickCapture = (event: { detail: number }) => shortcut && event.detail > 0 && noteMouseUse(shortcut);
  // Whether the pointer or focus is in here while the tooltip code is on its way: the trigger that replaces the plain
  // wrapper remounts the control, so the tooltip opens and focus comes back as if it had been there all along.
  const wrapper = useRef<HTMLSpanElement>(null);
  const inside = useRef({ hover: false, focus: false });
  useLayoutEffect(() => {
    if (tooltips && inside.current.focus)
      wrapper.current?.querySelector<HTMLElement>("button, a[href], input, [tabindex]:not([tabindex='-1'])")?.focus();
  }, [tooltips]);
  // Same wrapper either way, so nothing moves when the tooltip code arrives.
  if (!tooltips)
    return (
      // biome-ignore lint/a11y/noStaticElementInteractions: a wrapper that only notices hover and focus to load tooltips; the control inside is what you use
      <span
        ref={wrapper}
        className="inline-flex"
        onPointerEnter={() => {
          inside.current.hover = true;
          loadTooltips();
        }}
        onPointerLeave={() => {
          inside.current.hover = false;
        }}
        onFocus={() => {
          inside.current.focus = true;
          loadTooltips();
        }}
        onBlur={() => {
          inside.current.focus = false;
        }}
        onClickCapture={onClickCapture}
      >
        {children}
      </span>
    );
  const { Tooltip, TooltipContent, TooltipTrigger } = tooltips;
  return (
    <Tooltip defaultOpen={inside.current.hover} onOpenChange={(open) => !open && tooltipClosed()}>
      <TooltipTrigger
        delay={delay}
        render={<span ref={wrapper} className="inline-flex" />}
        // A real mouse click (not keyboard activation) counts towards the "here's its shortcut" tip.
        onClickCapture={onClickCapture}
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
