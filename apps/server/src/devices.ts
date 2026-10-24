import { type Device, type DeviceServerMessage, type DeviceState, parseDeviceMessage } from "@keep/shared/devices";

/*
 * One playback session per account (#192), in memory. Each open player (a tab, the desktop app) is a device; at most
 * one plays. The last state survives the playing device closing, so another one can pick up where it stopped.
 */

export interface DevicePeer {
  /** Stable per tab, so a reload comes back as the same device. */
  id: string;
  name: string;
  /** The browser session it signed in with: signing that out closes it. */
  session: string;
  send(message: string): void;
  close(): void;
}

interface Account {
  peers: Map<string, DevicePeer>;
  active: string | null;
  state: DeviceState | null;
  stamped: number;
}

const MAX_DEVICES = 20;

export class DeviceHub {
  private accounts = new Map<string, Account>();

  constructor(private now: () => number = Date.now) {}

  /** Connect a device of `account` (server + user). False when the account already has too many open. */
  join(account: string, peer: DevicePeer): boolean {
    const entry = this.accounts.get(account) ?? { peers: new Map(), active: null, state: null, stamped: 0 };
    if (!entry.peers.has(peer.id) && entry.peers.size >= MAX_DEVICES) return false;
    this.accounts.set(account, entry);
    entry.peers.set(peer.id, peer);
    this.broadcastDevices(entry);
    if (entry.state && entry.active && entry.active !== peer.id) this.reply(peer, this.stateMessage(entry));
    return true;
  }

  leave(account: string, peer: DevicePeer): void {
    const entry = this.accounts.get(account);
    // A reload's new socket may already have taken this id over.
    if (!entry || entry.peers.get(peer.id) !== peer) return;
    entry.peers.delete(peer.id);
    if (entry.active === peer.id) {
      entry.active = null;
      if (entry.state) {
        entry.state = { ...entry.state, position: this.position(entry), playing: false };
        entry.stamped = this.now();
      }
    }
    if (!entry.peers.size) this.accounts.delete(account);
    else this.broadcastDevices(entry);
  }

  handle(account: string, peer: DevicePeer, raw: string): void {
    const entry = this.accounts.get(account);
    const message = parseDeviceMessage(raw);
    if (!entry || !message || entry.peers.get(peer.id) !== peer) return;
    switch (message.t) {
      case "state": {
        if (entry.active !== peer.id) {
          // Only starting to play takes the session; a paused tab opening doesn't.
          if (!message.state.playing) return;
          this.activate(entry, peer.id);
        }
        entry.state = message.state;
        entry.stamped = this.now();
        this.broadcast(entry, this.stateMessage(entry), peer.id);
        return;
      }
      case "command": {
        const active = entry.active ? entry.peers.get(entry.active) : undefined;
        if (active && active !== peer) this.reply(active, { t: "command", command: message.command });
        return;
      }
      case "transfer": {
        const target = entry.peers.get(message.to);
        if (!target || entry.active === target.id) return;
        if (entry.state) {
          entry.state = { ...entry.state, position: this.position(entry) };
          entry.stamped = this.now();
        }
        this.activate(entry, target.id);
        this.reply(target, { t: "take", state: entry.state, stamped: this.now(), now: this.now() });
      }
    }
  }

  /** A signed-out or revoked browser session loses its devices straight away. */
  dropSession(session: string): void {
    for (const entry of this.accounts.values()) for (const peer of entry.peers.values()) if (peer.session === session) peer.close();
  }

  /** Make `id` the playing device; the one before it is told to stop. */
  private activate(entry: Account, id: string): void {
    const before = entry.active ? entry.peers.get(entry.active) : undefined;
    entry.active = id;
    if (before && before.id !== id) this.reply(before, { t: "yield" });
    this.broadcastDevices(entry);
  }

  /** Where the playhead is now, from the last state and the time since. */
  private position(entry: Account): number {
    if (!entry.state) return 0;
    return entry.state.playing ? entry.state.position + (this.now() - entry.stamped) / 1000 : entry.state.position;
  }

  private stateMessage(entry: Account): DeviceServerMessage {
    return { t: "state", state: entry.state as DeviceState, stamped: entry.stamped, now: this.now() };
  }

  private broadcastDevices(entry: Account): void {
    const devices: Device[] = [...entry.peers.values()].map((peer) => ({ id: peer.id, name: peer.name, active: peer.id === entry.active }));
    this.broadcast(entry, { t: "devices", devices });
  }

  private reply(peer: DevicePeer, message: DeviceServerMessage): void {
    peer.send(JSON.stringify(message));
  }

  private broadcast(entry: Account, message: DeviceServerMessage, except?: string): void {
    const text = JSON.stringify(message);
    for (const peer of entry.peers.values()) if (peer.id !== except) peer.send(text);
  }
}
