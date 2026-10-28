import type { AudioDevice } from "@lodesong/ui/components/audio-device-select";
import { useCallback, useEffect, useState } from "react";
import { player } from "./player";

type MediaDevicesWithOutput = MediaDevices & { selectAudioOutput?: () => Promise<MediaDeviceInfo> };

/** Whether this browser can route audio to a chosen device at all. */
export const CAN_PICK_OUTPUT =
  typeof window !== "undefined" &&
  ("setSinkId" in AudioContext.prototype || "setSinkId" in HTMLMediaElement.prototype) &&
  Boolean(navigator.mediaDevices?.enumerateDevices);

/**
 * Output devices for audiocn's device select. Browsers hide device names until the page has media permission;
 * `requestPermission` asks for it (or uses the browser's own output picker where one exists).
 */
export function useOutputDevices(): { devices: AudioDevice[]; permission: "granted" | "prompt"; requestPermission: () => void } {
  const [devices, setDevices] = useState<AudioDevice[]>([]);
  const [permission, setPermission] = useState<"granted" | "prompt">("granted");

  const refresh = useCallback(async () => {
    const all = (await navigator.mediaDevices.enumerateDevices()).filter((device) => device.kind === "audiooutput");
    setPermission(all.some((device) => !device.label) ? "prompt" : "granted");
    setDevices(
      all
        .filter((device) => device.label)
        .map((device) => ({
          id: device.deviceId === "default" ? "" : device.deviceId,
          label: device.label,
          isDefault: device.deviceId === "default",
        })),
    );
  }, []);

  useEffect(() => {
    if (!CAN_PICK_OUTPUT) return;
    void refresh();
    navigator.mediaDevices.addEventListener("devicechange", refresh);
    return () => navigator.mediaDevices.removeEventListener("devicechange", refresh);
  }, [refresh]);

  const requestPermission = useCallback(() => {
    const media = navigator.mediaDevices as MediaDevicesWithOutput;
    const ask = media.selectAudioOutput
      ? media.selectAudioOutput().then((device) => player.setOutputDevice(device.deviceId))
      : media.getUserMedia({ audio: true }).then((stream) => {
          for (const track of stream.getTracks()) track.stop();
        });
    void ask.then(refresh).catch(() => undefined);
  }, [refresh]);

  return { devices, permission, requestPermission };
}
