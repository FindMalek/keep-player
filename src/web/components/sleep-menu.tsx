import { MoonIcon } from "lucide-react";
import { useEffect, useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { player, type Sleep, usePlayer } from "@/lib/player";
import { Hint } from "./hint";
import { ToolButton } from "./tool-button";

export const SLEEP_OPTIONS = [
  ["off", "off"],
  ["15", "15 minutes"],
  ["30", "30 minutes"],
  ["45", "45 minutes"],
  ["60", "1 hour"],
  ["track", "end of this song"],
  ["album", "end of this album"],
] as const;

/** The radio value for the current timer (a countdown has no option of its own). */
export const sleepValue = (sleep: Sleep): string => (!sleep ? "off" : sleep.kind === "time" ? "time" : sleep.kind);

/** Pick an option: "off", minutes, "track" or "album". */
export const chooseSleep = (next: string): void =>
  player.setSleep(next === "off" ? null : next === "track" || next === "album" ? next : Number(next));

/** "23 min left", "after this song", … for the tooltip. */
function describe(sleep: Sleep, now: number): string {
  if (!sleep) return "sleep timer";
  if (sleep.kind === "track") return "stops after this song";
  if (sleep.kind === "album") return "stops after this album";
  return `stops in ${Math.max(1, Math.round((sleep.until - now) / 60_000))} min`;
}

export function SleepMenu() {
  const sleep = usePlayer((state) => state.sleep);
  const [now, setNow] = useState(Date.now);
  // Keep the "N min left" hint fresh while a timer runs.
  useEffect(() => {
    if (sleep?.kind !== "time") return;
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, [sleep]);
  const value = sleepValue(sleep);

  return (
    <DropdownMenu>
      <Hint label={describe(sleep, now)} shortcut={sleep ? undefined : "stop-after"}>
        <DropdownMenuTrigger render={<ToolButton on={sleep !== null} aria-label="sleep timer" />}>
          <MoonIcon />
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent side="top" align="end" className="min-w-48">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-mono text-[10.5px] text-faint">stop playing</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={value} onValueChange={chooseSleep}>
            {SLEEP_OPTIONS.map(([option, label]) => (
              <DropdownMenuRadioItem key={option} value={option}>
                {label}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
