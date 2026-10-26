import { Button } from "@keep/ui/components/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@keep/ui/components/sheet";
import { Slider } from "@keep/ui/components/slider";
import { Switch } from "@keep/ui/components/switch";
import { RotateCcwIcon } from "lucide-react";
import { BANDS, clampGains, FLAT, MAX_DB, PRESETS, presetOf } from "@/lib/eq";
import { setSetting, useSetting } from "@/lib/settings";

const label = (frequency: number) => (frequency >= 1000 ? `${frequency / 1000}k` : String(frequency));

/** The ten-band equalizer (`settings → playback`): presets, and a slider per band. Off by default; synced. */
export function EqualizerSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const on = useSetting("eqOn");
  const gains = clampGains(useSetting("eqGains"));
  const preset = presetOf(gains);
  const change = (next: number[]) => {
    setSetting("eqGains", next);
    // Touching a band turns it on: moving sliders that do nothing is confusing.
    if (!on) setSetting("eqOn", true);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[420px] max-w-full gap-0 sm:max-w-[420px]">
        <SheetHeader>
          <SheetTitle>equalizer</SheetTitle>
          <SheetDescription>ten bands, ±{MAX_DB} dB. Boosts lower the overall level a little so they don't clip.</SheetDescription>
        </SheetHeader>
        <div className="flex flex-col gap-4 px-4 pb-4">
          <div className="flex items-center justify-between">
            <label htmlFor="eq-on" className="text-sm">
              equalizer
            </label>
            <Switch id="eq-on" checked={on} onCheckedChange={(checked) => setSetting("eqOn", checked === true)} />
          </div>
          <fieldset aria-label="presets" className="flex min-w-0 flex-wrap gap-1.5 border-0 p-0">
            {Object.keys(PRESETS).map((name) => (
              <Button
                key={name}
                size="xs"
                variant={preset === name ? "default" : "outline"}
                className="font-mono font-normal"
                aria-pressed={preset === name}
                onClick={() => change([...(PRESETS[name] ?? FLAT)])}
              >
                {name}
              </Button>
            ))}
          </fieldset>
          <div className={on ? "flex justify-between gap-1" : "flex justify-between gap-1 opacity-50"}>
            {BANDS.map((frequency, index) => (
              <div key={frequency} className="flex flex-1 flex-col items-center gap-2">
                <span className="font-mono text-[10.5px] text-muted-foreground tabular-nums">{gains[index]?.toFixed(0)}</span>
                <div className="h-40">
                  <Slider
                    orientation="vertical"
                    thumbLabel={`${label(frequency)} Hz`}
                    min={-MAX_DB}
                    max={MAX_DB}
                    step={1}
                    value={[gains[index] ?? 0]}
                    onValueChange={(value) => {
                      const next = [...gains];
                      next[index] = Array.isArray(value) ? (value[0] ?? 0) : value;
                      change(next);
                    }}
                  />
                </div>
                <span className="font-mono text-[10.5px] text-muted-foreground">{label(frequency)}</span>
              </div>
            ))}
          </div>
          <Button variant="outline" size="sm" className="self-start" onClick={() => change([...FLAT])}>
            <RotateCcwIcon /> reset
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
