import { Kbd, KbdGroup } from "@keep/ui/components/kbd";
import { Fragment } from "react";
import { displayKeys } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/** A binding drawn as keys; chords read "g then h". */
export function KeyCombo({ binding, className }: { binding: string; className?: string }) {
  const steps = displayKeys(binding);
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {steps.map((step, index) => (
        <Fragment key={step.join("+")}>
          {index > 0 && <span className="font-mono text-label text-faint">then</span>}
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
