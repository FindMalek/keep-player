import { Fragment } from "react";
import { Kbd, KbdGroup } from "@/components/ui/kbd";
import { displayKeys } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/** A binding drawn as keys; chords read "g then h". */
export function KeyCombo({ binding, className }: { binding: string; className?: string }) {
  const steps = displayKeys(binding);
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {steps.map((step, index) => (
        <Fragment key={step.join("+")}>
          {index > 0 && <span className="font-mono text-[10.5px] text-faint">then</span>}
          <KbdGroup>
            {step.map((key) => (
              <Kbd key={key} className="font-mono">
                {key}
              </Kbd>
            ))}
          </KbdGroup>
        </Fragment>
      ))}
    </span>
  );
}
