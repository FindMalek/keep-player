import type { Device } from "@lodesong/shared/devices";
import { useSyncExternalStore } from "react";

/** Which devices share this account's playback session and which one plays; `session.ts` (loaded later) fills it in. */
export interface SessionState {
  connected: boolean;
  /** This tab's device id. */
  you: string;
  devices: Device[];
}

let state: SessionState = { connected: false, you: "", devices: [] };
const listeners = new Set<() => void>();

export const sessionState = {
  get: (): SessionState => state,
  set(patch: Partial<SessionState>): void {
    state = { ...state, ...patch };
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useSession(): SessionState {
  return useSyncExternalStore(sessionState.subscribe, sessionState.get);
}
