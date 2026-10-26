import { Button } from "@keep/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@keep/ui/components/dialog";
import { Input } from "@keep/ui/components/input";
import { Label } from "@keep/ui/components/label";
import { Switch } from "@keep/ui/components/switch";
import { PencilIcon, RotateCcwIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { notify } from "@/lib/notify";
import {
  bindingsOf,
  eventBinding,
  exportBindings,
  findConflicts,
  rebind,
  resetBindings,
  type Shortcut,
  type ShortcutGroup,
  useShortcutList,
} from "@/lib/shortcuts";
import { setTipsEnabled, tipsEnabled } from "@/lib/tips";
import { cn } from "@/lib/utils";
import { KeyCombo } from "./key-combo";

const GROUPS: [ShortcutGroup, string][] = [
  ["playback", "playback"],
  ["navigation", "navigation"],
  ["panels", "panels"],
  ["lists", "lists"],
];

/** Shortcuts that would fire right now, given where focus was when the sheet opened. */
function availableNow(shortcut: Shortcut, focusInList: boolean): boolean {
  return shortcut.scope === "global" || (shortcut.scope === "list" && focusInList);
}

/** `?`: every shortcut, generated from the registry, with search and rebinding. */
export function CheatSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const shortcuts = useShortcutList();
  const [filter, setFilter] = useState("");
  const [recording, setRecording] = useState<string | null>(null);
  const [tips, setTips] = useState(tipsEnabled);
  const [focusInList] = useState(() => document.activeElement?.closest("[data-shortcut-scope=list]") !== null);

  // While recording, the next key combination becomes the binding (esc cancels).
  useEffect(() => {
    if (!recording) return;
    function capture(event: KeyboardEvent): void {
      event.preventDefault();
      event.stopPropagation();
      const binding = eventBinding(event);
      if (event.code === "Escape") {
        setRecording(null);
        return;
      }
      if (!binding || ["Shift", "Meta", "Control", "Alt"].includes(event.key)) return;
      const target = shortcuts.find((shortcut) => shortcut.id === recording);
      const clash =
        target &&
        findConflicts([
          ...shortcuts.filter((item) => item.id !== recording).map((item) => ({ ...item, keys: bindingsOf(item) })),
          { ...target, keys: [binding] },
        ]).find((conflict) => conflict[2] === recording);
      if (clash) {
        const other = shortcuts.find((shortcut) => shortcut.id === clash[1]);
        notify({ kind: "error", message: `${binding} is already "${other?.label ?? clash[1]}"` });
      } else if (target) rebind(target.id, [binding]);
      setRecording(null);
    }
    window.addEventListener("keydown", capture, true);
    return () => window.removeEventListener("keydown", capture, true);
  }, [recording, shortcuts]);

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase();
    return shortcuts.filter(
      (shortcut) => !query || shortcut.label.includes(query) || bindingsOf(shortcut).some((keys) => keys.includes(query)),
    );
  }, [shortcuts, filter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono">keyboard shortcuts</DialogTitle>
          <DialogDescription>
            the ones you can use right here are bright. pencil to change a key; it's saved in this browser.
          </DialogDescription>
        </DialogHeader>
        <Input
          placeholder="filter: “queue”, “shift”…"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          aria-label="filter shortcuts"
        />
        <div className="-mx-1 min-h-0 overflow-y-auto px-1">
          {GROUPS.map(([group, title]) => {
            const items = visible.filter((shortcut) => shortcut.group === group);
            if (!items.length) return null;
            return (
              <section key={group} className="mb-4">
                <h3 className="mb-1.5 font-mono text-[10.5px] text-faint">{title}</h3>
                <ul className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
                  {items.map((shortcut) => {
                    const custom = bindingsOf(shortcut) !== shortcut.keys;
                    return (
                      <li
                        key={shortcut.id}
                        className={cn(
                          "group/row flex h-8 items-center justify-between gap-3 border-muted border-b text-[13px]",
                          !availableNow(shortcut, focusInList) && "text-muted-foreground",
                        )}
                      >
                        <span className="truncate">{shortcut.id === "jump-0" ? "jump to 0–90%" : shortcut.label}</span>
                        <span className="flex shrink-0 items-center gap-1.5">
                          {recording === shortcut.id ? (
                            <span className="font-mono text-muted-foreground text-xs">press keys… (esc)</span>
                          ) : shortcut.id === "jump-0" ? (
                            <span className="flex items-center gap-1 font-mono text-[10.5px] text-faint">
                              <KeyCombo binding="0" /> … <KeyCombo binding="9" />
                            </span>
                          ) : (
                            bindingsOf(shortcut).map((binding, index) => (
                              <span key={binding} className="flex items-center gap-1.5">
                                {index > 0 && <span className="font-mono text-[10.5px] text-faint">or</span>}
                                <KeyCombo binding={binding} />
                              </span>
                            ))
                          )}
                          {!shortcut.passive && shortcut.id !== "jump-0" && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              className="opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100"
                              aria-label={`change the key for ${shortcut.label}`}
                              onClick={() => setRecording(shortcut.id)}
                            >
                              <PencilIcon />
                            </Button>
                          )}
                          {custom && (
                            <Button
                              variant="ghost"
                              size="icon-xs"
                              aria-label={`reset ${shortcut.label}`}
                              onClick={() => resetBindings(shortcut.id)}
                            >
                              <RotateCcwIcon />
                            </Button>
                          )}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <span className="flex items-center gap-2">
            <Switch
              id="shortcut-tips"
              checked={tips}
              onCheckedChange={(checked: boolean) => {
                setTips(checked);
                setTipsEnabled(checked);
              }}
            />
            <Label htmlFor="shortcut-tips" className="font-mono font-normal text-muted-foreground text-xs">
              shortcut tips
            </Label>
          </span>
          <span className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                void navigator.clipboard.writeText(exportBindings()).then(() => notify({ message: "your keys are copied as json" }))
              }
            >
              export
            </Button>
            <Button variant="outline" size="sm" onClick={() => resetBindings()}>
              reset all
            </Button>
          </span>
        </footer>
      </DialogContent>
    </Dialog>
  );
}
