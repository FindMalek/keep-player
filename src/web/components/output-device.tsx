import { SpeakerIcon } from "lucide-react";
import {
  AudioDeviceSelect,
  AudioDeviceSelectContent,
  AudioDeviceSelectPermission,
  AudioDeviceSelectTrigger,
} from "@/components/ui/audio-device-select";
import { player, usePlayer } from "@/lib/player";
import { useOutputDevices } from "@/lib/use-output-devices";
import { Hint } from "./hint";

export function OutputDevice() {
  const outputDevice = usePlayer((state) => state.outputDevice);
  const { devices, permission, requestPermission } = useOutputDevices();
  return (
    <AudioDeviceSelect
      devices={devices}
      value={outputDevice ?? ""}
      onValueChange={(id) => player.setOutputDevice(id || null)}
      permission={permission}
      onRequestPermission={requestPermission}
    >
      <Hint label="output device">
        <AudioDeviceSelectTrigger
          size="sm"
          className="w-auto gap-1 border-0 bg-transparent px-1.5 text-muted-foreground shadow-none hover:text-foreground dark:bg-transparent"
          aria-label="output device"
        >
          <SpeakerIcon />
        </AudioDeviceSelectTrigger>
      </Hint>
      <AudioDeviceSelectContent align="end" className="min-w-56">
        <AudioDeviceSelectPermission
          message="browsers only name your speakers after you allow audio access once. nothing is recorded."
          actionLabel="allow"
        />
      </AudioDeviceSelectContent>
    </AudioDeviceSelect>
  );
}
