import { Button } from "@lodesong/ui/components/button";
import { Input } from "@lodesong/ui/components/input";
import { Slider } from "@lodesong/ui/components/slider";
import { ToggleGroup, ToggleGroupItem } from "@lodesong/ui/components/toggle-group";
import { type ReactNode, useEffect, useState } from "react";
import { previewLook, revertLook, savedLook, saveLook } from "@/lib/look-apply";
import { ACCENTS, DEFAULT_LOOK, decodeLook, encodeLook, FONTS, type Look, PRESETS, RADII, TONES } from "@/lib/look-code";
import { notify } from "@/lib/notify";
import { useSetting } from "@/lib/settings";

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b py-3">
      <span className="text-sm">{label}</span>
      {children}
    </div>
  );
}

function Choice<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <ToggleGroup
      variant="outline"
      size="sm"
      aria-label={label}
      value={[value]}
      onValueChange={(next: string[]) => {
        const picked = options.find((option) => option === next[0]);
        if (picked) onChange(picked);
      }}
    >
      {options.map((option) => (
        <ToggleGroupItem key={option} value={option} className="font-mono font-normal">
          {option}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  );
}

/** Everything changes on screen as you pick; leaving without saving puts the saved look back. */
export function ThemeBuilder() {
  const saved = useSetting("look");
  const [look, setLook] = useState<Look>(savedLook);
  const [code, setCode] = useState("");
  const [bad, setBad] = useState(false);
  const dirty = encodeLook(look) !== encodeLook(decodeLook(saved) ?? DEFAULT_LOOK);

  useEffect(() => revertLook, []);

  const show = (next: Look) => {
    setLook(next);
    setBad(false);
    previewLook(next);
  };

  return (
    <section aria-label="custom look" className="flex flex-col pb-2">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b py-3">
        <span className="text-sm">look</span>
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label="presets"
          value={[PRESETS.find((preset) => encodeLook(preset.look) === encodeLook(look))?.name ?? ""]}
          onValueChange={(next: string[]) => {
            const preset = PRESETS.find((item) => item.name === next[0]);
            if (preset) show(preset.look);
          }}
        >
          {PRESETS.map((preset) => (
            <ToggleGroupItem key={preset.name} value={preset.name} className="font-mono font-normal">
              {preset.name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </div>
      <Field label="base tone">
        <Choice label="base tone" options={TONES} value={look.tone} onChange={(tone) => show({ ...look, tone })} />
      </Field>
      <Field label="accent">
        <Choice label="accent" options={ACCENTS} value={look.accent} onChange={(accent) => show({ ...look, accent })} />
      </Field>
      <Field label="corners">
        <div className="flex w-56 items-center gap-3">
          <Slider
            thumbLabel="corner radius"
            min={0}
            max={RADII.length - 1}
            step={1}
            value={[RADII.indexOf(look.radius)]}
            onValueChange={(value) => show({ ...look, radius: RADII[Array.isArray(value) ? (value[0] ?? 0) : value] ?? 0 })}
          />
          <span className="w-10 text-right font-mono text-xs tabular-nums">{look.radius} px</span>
        </div>
      </Field>
      <Field label="font">
        <Choice label="font" options={FONTS} value={look.font} onChange={(font) => show({ ...look, font })} />
      </Field>
      <div className="flex items-center justify-between gap-3 border-b py-3">
        <p className="text-muted-foreground text-xs">{dirty ? "previewing, not saved yet" : "saved, follows you to every browser"}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" disabled={!dirty} onClick={() => show(savedLook())}>
            revert
          </Button>
          <Button size="sm" disabled={!dirty} onClick={() => saveLook(look)}>
            save look
          </Button>
        </div>
      </div>
      <div className="flex flex-col gap-2 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-sm">theme code</span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void navigator.clipboard.writeText(encodeLook(look)).then(() => notify({ message: "theme code copied" }))}
          >
            copy {encodeLook(look)}
          </Button>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            const imported = decodeLook(code);
            if (!imported) return setBad(true);
            show(imported);
            setCode("");
          }}
        >
          <Input
            aria-label="theme code to import"
            aria-invalid={bad}
            placeholder="paste a theme code"
            value={code}
            onChange={(event) => {
              setCode(event.target.value);
              setBad(false);
            }}
            className="font-mono"
          />
          <Button type="submit" variant="outline" size="sm" disabled={!code.trim()}>
            preview
          </Button>
        </form>
        {bad && <p className="text-destructive text-xs">that is not a theme code</p>}
      </div>
    </section>
  );
}
