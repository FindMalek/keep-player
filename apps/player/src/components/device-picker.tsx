import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@keep/ui/components/dropdown-menu";
import { MonitorSpeakerIcon } from "lucide-react";
import { session } from "@/lib/session";
import { useSession } from "@/lib/session-state";
import { ToolButton } from "./tool-button";

/** Where the session plays: every open player of yours; picking one moves playback there. */
export function DevicePicker() {
  const { devices, you } = useSession();
  if (devices.length < 2) return null;
  const active = devices.find((device) => device.active);
  const elsewhere = active && active.id !== you ? active : undefined;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <ToolButton
            on={Boolean(elsewhere)}
            aria-label="devices"
            title={elsewhere ? `playing on ${elsewhere.name}` : "play on another device"}
          />
        }
      >
        <MonitorSpeakerIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="font-mono text-label text-faint">play on</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={active?.id ?? ""} onValueChange={(id: string) => session.transfer(id)}>
            {devices.map((device) => (
              <DropdownMenuRadioItem key={device.id} value={device.id}>
                {device.id === you ? `this ${device.name.split(" on ")[0]}` : device.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
