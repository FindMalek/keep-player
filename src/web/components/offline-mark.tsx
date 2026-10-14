import { ArrowDownToLineIcon } from "lucide-react";

/** The small mark for "saved for offline: plays and seeks without the network". */
export function OfflineMark() {
  return <ArrowDownToLineIcon aria-label="saved for offline" className="mr-1.5 inline size-3 align-[-1px] text-faint" />;
}
