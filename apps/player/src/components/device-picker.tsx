import { MonitorSpeakerIcon } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { session } from "@/lib/session";
import { useSession } from "@/lib/session-state";
import { Hint } from "./hint";
import { ToolButton } from "./tool-button";

/** Where the session plays: every open player of yours; picking one moves playback there. */
export function DevicePicker() {
  const { devices, you } = useSession();
  if (devices.length < 2) return null;
  const active = devices.find((device) => device.active);
  const elsewhere = active && active.id !== you ? active : undefined;
  return (
    <DropdownMenu>
      <Hint label={elsewhere ? `playing on ${elsewhere.name}` : "play on another device"}>
        <DropdownMenuTrigger render={<ToolButton on={Boolean(elsewhere)} aria-label="devices" />}>
          <MonitorSpeakerIcon />
        </DropdownMenuTrigger>
      </Hint>
      <DropdownMenuContent side="top" align="end" className="min-w-56">
        <DropdownMenuLabel className="font-mono text-[10.5px] text-faint">play on</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={active?.id ?? ""} onValueChange={(id: string) => session.transfer(id)}>
          {devices.map((device) => (
            <DropdownMenuRadioItem key={device.id} value={device.id}>
              {device.id === you ? `this ${device.name.split(" on ")[0]}` : device.name}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
