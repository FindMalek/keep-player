import { type ReactNode, useRef, useState } from "react";
import { loadTooltips, tooltipClosed, useOpenDelay, useTooltips } from "@/lib/tooltips";
import { cn } from "@/lib/utils";

/** Text cut with an ellipsis; hovering shows all of it, but only when something was actually cut. */
export function Truncated({ text, className, children }: { text: string; className?: string; children?: ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const tooltips = useTooltips();
  const delay = useOpenDelay();
  if (!tooltips)
    return (
      <span ref={ref} className={cn("truncate", className)} onPointerEnter={loadTooltips}>
        {children ?? text}
      </span>
    );
  const { Tooltip, TooltipContent, TooltipTrigger } = tooltips;
  return (
    <Tooltip
      open={open}
      onOpenChange={(next) => {
        if (!next) tooltipClosed();
        setOpen(next && !!ref.current && ref.current.scrollWidth > ref.current.clientWidth);
      }}
    >
      <TooltipTrigger delay={delay} render={<span ref={ref} className={cn("truncate", className)} />}>
        {children ?? text}
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">{text}</TooltipContent>
    </Tooltip>
  );
}
