import { ArrowDownToLineIcon } from "lucide-react";
import { Hint } from "./hint";

/** The small mark for "saved for offline: plays and seeks without the network". */
export function OfflineMark() {
  return (
    <Hint label="saved for offline: plays and seeks without the network">
      <ArrowDownToLineIcon aria-label="saved for offline" className="mr-1.5 inline size-3 align-[-1px] text-faint" />
    </Hint>
  );
}
