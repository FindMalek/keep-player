import { Kbd } from "@/components/ui/kbd";
import { displayKeys, usePendingChord } from "@/lib/shortcuts";

/** While a chord waits for its second key ("g" … "h"), a small hint shows what was pressed. */
export function ChordHint() {
  const pending = usePendingChord();
  if (!pending) return null;
  return (
    <div
      role="status"
      className="fixed bottom-20 left-1/2 z-50 flex -translate-x-1/2 items-center gap-1.5 border bg-popover px-2.5 py-1.5 font-mono text-xs shadow-sm"
    >
      {displayKeys(pending)
        .flat()
        .map((key) => (
          <Kbd key={key}>{key}</Kbd>
        ))}
      <span className="text-muted-foreground">…</span>
    </div>
  );
}
