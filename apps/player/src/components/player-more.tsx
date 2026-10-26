import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@keep/ui/components/dropdown-menu";
import {
  EllipsisIcon,
  InfoIcon,
  MicVocalIcon,
  MoonIcon,
  PictureInPicture2Icon,
  Repeat1Icon,
  RepeatIcon,
  ShuffleIcon,
  SkipBackIcon,
  SpeakerIcon,
} from "lucide-react";
import type { BarMode } from "@/lib/bar-mode";
import { MINI_PLAYER_SUPPORTED, openMiniPlayer } from "@/lib/mini-player";
import { player, usePlayer } from "@/lib/player";
import { CAN_PICK_OUTPUT, useOutputDevices } from "@/lib/use-output-devices";
import type { Panel } from "./player-bar";
import { chooseSleep, SLEEP_OPTIONS, sleepValue } from "./sleep-menu";
import { ToolButton } from "./tool-button";

/** The output device choices as menu items; "allow" first when the browser hasn't named the speakers yet. */
function OutputDeviceItems() {
  const outputDevice = usePlayer((state) => state.outputDevice);
  const { devices, permission, requestPermission } = useOutputDevices();
  return (
    <>
      {permission === "prompt" && <DropdownMenuItem onClick={requestPermission}>allow audio access to name your speakers</DropdownMenuItem>}
      <DropdownMenuRadioGroup value={outputDevice ?? ""} onValueChange={(id: string) => player.setOutputDevice(id || null)}>
        {devices.length === 0 && <DropdownMenuRadioItem value="">system default</DropdownMenuRadioItem>}
        {devices.map((device) => (
          <DropdownMenuRadioItem key={device.id} value={device.id}>
            {device.isDefault ? `${device.label} (default)` : device.label}
          </DropdownMenuRadioItem>
        ))}
      </DropdownMenuRadioGroup>
    </>
  );
}

/**
 * Everything the bar has no room for at this width: song info, mini player, the sleep timer and the output
 * device, plus on a phone-sized window shuffle, repeat, previous and lyrics.
 */
export function PlayerMore({ mode, panel, onPanel }: { mode: BarMode; panel: Panel; onPanel: (panel: Panel) => void }) {
  const sleep = usePlayer((state) => state.sleep);
  const shuffle = usePlayer((state) => state.queue.shuffle);
  const repeat = usePlayer((state) => state.queue.repeat);
  const mobile = mode === "mobile";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<ToolButton on={sleep !== null} aria-label="more controls" />}>
        <EllipsisIcon />
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="end" className="min-w-52">
        {mobile && (
          <>
            <DropdownMenuItem onClick={() => player.previous()}>
              <SkipBackIcon />
              previous
            </DropdownMenuItem>
            <DropdownMenuCheckboxItem checked={shuffle} onCheckedChange={() => player.toggleShuffle()}>
              <ShuffleIcon />
              shuffle
            </DropdownMenuCheckboxItem>
            <DropdownMenuItem onClick={() => player.cycleRepeat()}>
              {repeat === "one" ? <Repeat1Icon /> : <RepeatIcon />}
              repeat: {repeat}
            </DropdownMenuItem>
            <DropdownMenuCheckboxItem checked={panel === "lyrics"} onCheckedChange={() => onPanel(panel === "lyrics" ? null : "lyrics")}>
              <MicVocalIcon />
              lyrics
            </DropdownMenuCheckboxItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuCheckboxItem checked={panel === "info"} onCheckedChange={() => onPanel(panel === "info" ? null : "info")}>
          <InfoIcon />
          song info
        </DropdownMenuCheckboxItem>
        {MINI_PLAYER_SUPPORTED && (
          <DropdownMenuItem onClick={() => void openMiniPlayer()}>
            <PictureInPicture2Icon />
            mini player
          </DropdownMenuItem>
        )}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <MoonIcon />
            sleep timer
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="min-w-48">
            <DropdownMenuGroup>
              <DropdownMenuLabel className="font-mono text-label text-faint">stop playing</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={sleepValue(sleep)} onValueChange={chooseSleep}>
                {SLEEP_OPTIONS.map(([option, label]) => (
                  <DropdownMenuRadioItem key={option} value={option}>
                    {label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {CAN_PICK_OUTPUT && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <SpeakerIcon />
              output device
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="min-w-56">
              <OutputDeviceItems />
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
