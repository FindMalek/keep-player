import { randomBytes } from "node:crypto";
import { type ClientMessage, type HostState, type Member, parseClientMessage, type ServerMessage } from "@keep/shared/listen";

/*
 * Listen-together rooms (#65), in memory: a room dies with the process or when its host ends it or stays away. A room is
 * only joinable from the same Navidrome server, and only by someone with a session there.
 */

export interface Peer {
  /** The browser session id: one host per room, however many tabs. */
  session: string;
  user: string;
  server: string;
  send(message: string): void;
}

interface Room {
  code: string;
  server: string;
  hostSession: string;
  anyoneCanSkip: boolean;
  partyMode: boolean;
  state: HostState | null;
  stamped: number;
  peers: Set<Peer>;
  endTimer?: ReturnType<typeof setTimeout>;
}

const HOST_GRACE_MS = 60_000;
const MAX_ROOMS = 50;
const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

export class ListenRooms {
  private rooms = new Map<string, Room>();

  constructor(
    private now: () => number = Date.now,
    private grace = HOST_GRACE_MS,
  ) {}

  /** A new room hosted by this session; null when the server is full. */
  create(server: string, hostSession: string, anyoneCanSkip = false, partyMode = false): string | null {
    if (this.rooms.size >= MAX_ROOMS) return null;
    const bytes = randomBytes(6);
    const code = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join("");
    this.rooms.set(code, { code, server, hostSession, anyoneCanSkip, partyMode, state: null, stamped: 0, peers: new Set() });
    return code;
  }

  has(code: string): boolean {
    return this.rooms.has(code);
  }

  /** Connect a peer. False when the room doesn't exist or belongs to another server. */
  join(code: string, peer: Peer): boolean {
    const room = this.rooms.get(code);
    if (!room || room.server !== peer.server) return false;
    room.peers.add(peer);
    if (peer.session === room.hostSession && room.endTimer) {
      clearTimeout(room.endTimer);
      room.endTimer = undefined;
    }
    const role = peer.session === room.hostSession ? "host" : "listener";
    this.reply(peer, {
      t: "hello",
      code,
      role,
      anyoneCanSkip: room.anyoneCanSkip,
      partyMode: room.partyMode,
      members: this.members(room),
      state: room.state,
      stamped: room.stamped,
      now: this.now(),
    });
    this.broadcast(room, { t: "members", members: this.members(room) }, peer);
    return true;
  }

  leave(code: string, peer: Peer): void {
    const room = this.rooms.get(code);
    if (!room) return;
    room.peers.delete(peer);
    this.broadcast(room, { t: "members", members: this.members(room) });
    const hostHere = [...room.peers].some((other) => other.session === room.hostSession);
    // The host dropped (a phone locking, a reload): keep the room a minute for them to come back.
    if (!hostHere && !room.endTimer) {
      room.endTimer = setTimeout(() => this.end(code), this.grace);
      room.endTimer.unref?.();
    }
  }

  handle(code: string, peer: Peer, raw: string): void {
    const room = this.rooms.get(code);
    const message = parseClientMessage(raw);
    if (!room || !message || !room.peers.has(peer)) return;
    const host = peer.session === room.hostSession;
    this.apply(room, peer, host, message);
  }

  end(code: string): void {
    const room = this.rooms.get(code);
    if (!room) return;
    if (room.endTimer) clearTimeout(room.endTimer);
    this.rooms.delete(code);
    this.broadcast(room, { t: "ended" });
  }

  private apply(room: Room, peer: Peer, host: boolean, message: ClientMessage): void {
    switch (message.t) {
      case "state":
        if (!host) return;
        room.state = message.state;
        room.stamped = this.now();
        this.broadcast(room, { t: "state", state: message.state, stamped: room.stamped, now: this.now() }, peer);
        return;
      case "add":
        this.broadcast(room, { t: "add", song: message.song, by: peer.user });
        return;
      case "skip":
        if (host || room.anyoneCanSkip) this.broadcast(room, { t: "skip", by: peer.user });
        return;
      case "toggle":
        if (host || (room.partyMode && room.anyoneCanSkip)) this.broadcast(room, { t: "toggle", by: peer.user });
        return;
      case "setting":
        if (!host) return;
        room.anyoneCanSkip = message.anyoneCanSkip ?? room.anyoneCanSkip;
        room.partyMode = message.partyMode ?? room.partyMode;
        this.broadcast(room, { t: "setting", anyoneCanSkip: room.anyoneCanSkip, partyMode: room.partyMode });
        return;
      case "end":
        if (host) this.end(room.code);
    }
  }

  private members(room: Room): Member[] {
    const seen = new Map<string, Member>();
    for (const peer of room.peers)
      seen.set(peer.user, { user: peer.user, host: peer.session === room.hostSession || seen.get(peer.user)?.host === true });
    return [...seen.values()];
  }

  private reply(peer: Peer, message: ServerMessage): void {
    peer.send(JSON.stringify(message));
  }

  private broadcast(room: Room, message: ServerMessage, except?: Peer): void {
    const text = JSON.stringify(message);
    for (const peer of room.peers) if (peer !== except) peer.send(text);
  }
}
