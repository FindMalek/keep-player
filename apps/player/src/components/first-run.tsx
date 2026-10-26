import { Button } from "@keep/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@keep/ui/components/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@keep/ui/components/field";
import { Switch } from "@keep/ui/components/switch";
import { ToggleGroup, ToggleGroupItem } from "@keep/ui/components/toggle-group";
import { MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useState } from "react";
import { setCacheCap } from "@/lib/offline";
import { setSetting, useSetting } from "@/lib/settings";
import { bindingsOf, useShortcutList } from "@/lib/shortcuts";
import { setTheme, type Theme, useTheme } from "@/lib/theme";
import { markOnboarded } from "@/lib/tips";
import { KeyCombo } from "./key-combo";

const GB = 1024 ** 3;
const CAPS = [1, 2, 5, 10];
const THEMES = [
  ["system", MonitorIcon],
  ["dark", MoonIcon],
  ["light", SunIcon],
] as const;
const LABEL = "font-mono text-muted-foreground";

/**
 * Once per browser, right after the first sign-in: three choices that matter (theme, how much music to keep for
 * offline, syncing with your phone), then the three things worth knowing. Every step can be skipped with esc.
 */
export function FirstRun({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState<"setup" | "tour">("setup");
  const [cap, setCap] = useState(2);
  const theme = useTheme();
  const queueSync = useSetting("queueSync");

  function finish(): void {
    setCacheCap(cap * GB);
    markOnboarded();
    onDone();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && finish()}>
      <DialogContent className="sm:max-w-md">
        {step === "setup" ? (
          <>
            <DialogHeader>
              <DialogTitle className="font-mono">welcome · make it yours</DialogTitle>
              <DialogDescription>you can change all of this later from your user menu</DialogDescription>
            </DialogHeader>
            <FieldGroup>
              <Field>
                <FieldLabel className={LABEL}>theme</FieldLabel>
                <ToggleGroup
                  aria-label="theme"
                  variant="outline"
                  size="sm"
                  value={[theme]}
                  onValueChange={(value) => value[0] && setTheme(value[0] as Theme)}
                >
                  {THEMES.map(([value, Icon]) => (
                    <ToggleGroupItem key={value} value={value} className="font-mono font-normal">
                      <Icon />
                      {value}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
              <Field>
                <FieldLabel className={LABEL}>keep for offline</FieldLabel>
                <ToggleGroup
                  aria-label="offline storage"
                  variant="outline"
                  size="sm"
                  value={[String(cap)]}
                  onValueChange={(value) => value[0] && setCap(Number(value[0]))}
                >
                  {CAPS.map((value) => (
                    <ToggleGroupItem key={value} value={String(value)} className="font-mono font-normal">
                      {value} GB
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
                <FieldDescription>the next songs download ahead, so they start instantly and play offline</FieldDescription>
              </Field>
              <Field orientation="horizontal">
                <Switch id="first-run-sync" checked={queueSync} onCheckedChange={(checked) => setSetting("queueSync", checked)} />
                <FieldLabel htmlFor="first-run-sync" className="font-normal">
                  pick up where your phone left off (arpeggi and other subsonic apps)
                </FieldLabel>
              </Field>
            </FieldGroup>
            <DialogFooter>
              <Button variant="ghost" onClick={finish}>
                skip
              </Button>
              <Button onClick={() => setStep("tour")}>next</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-mono">three things worth knowing</DialogTitle>
              <DialogDescription>keep music is built for the keyboard</DialogDescription>
            </DialogHeader>
            <ul className="flex flex-col gap-3 text-sm">
              <Tip id="search" text="search anything, even a line from a song's lyrics" />
              <Tip id="cheat-sheet" text="every shortcut, searchable, whenever you forget one" />
              <li>start on your phone, finish here: the queue follows you</li>
            </ul>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setStep("setup")}>
                back
              </Button>
              <Button onClick={finish} autoFocus>
                start listening
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** A tip with the shortcut's current keys, read from the registry (so a rebound key shows as rebound). */
function Tip({ id, text }: { id: string; text: string }) {
  const shortcut = useShortcutList().find((item) => item.id === id);
  const binding = shortcut && bindingsOf(shortcut)[0];
  return (
    <li className="flex items-start justify-between gap-4">
      <span>{text}</span>
      {binding && <KeyCombo binding={binding} className="shrink-0" />}
    </li>
  );
}
