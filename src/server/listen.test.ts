import { expect, test } from "bun:test";
import type { ServerMessage } from "../shared/listen";
import { ListenRooms, type Peer } from "./listen";

function peer(session: string, user: string, server = "default"): Peer & { got: ServerMessage[] } {
  const got: ServerMessage[] = [];
  return { session, user, server, got, send: (message) => got.push(JSON.parse(message)) };
}

const state = JSON.stringify({ t: "state", state: { song: { id: "s1", title: "Angel" }, position: 12, playing: true } });

test("the host's state reaches listeners stamped with the server clock; a listener's can't", () => {
  let clock = 1000;
  const rooms = new ListenRooms(() => clock);
  const code = rooms.create("default", "host-session") as string;
  const host = peer("host-session", "malek");
  const listener = peer("other-session", "sam");
  expect(rooms.join(code, host)).toBe(true);
  expect(rooms.join(code, listener)).toBe(true);
  expect(listener.got[0]).toMatchObject({ t: "hello", role: "listener", state: null });
  expect(host.got[0]).toMatchObject({ t: "hello", role: "host" });

  rooms.handle(code, listener, state);
  expect(listener.got.some((message) => message.t === "state")).toBe(false);
  clock = 2000;
  rooms.handle(code, host, state);
  expect(listener.got.at(-1)).toMatchObject({ t: "state", stamped: 2000, now: 2000, state: { position: 12, playing: true } });

  const late = peer("late-session", "kim");
  rooms.join(code, late);
  expect(late.got[0]).toMatchObject({ t: "hello", state: { position: 12 }, stamped: 2000 });
});

test("a room is only joinable from its own server", () => {
  const rooms = new ListenRooms();
  const code = rooms.create("default", "h") as string;
  expect(rooms.join(code, peer("x", "sam", "other"))).toBe(false);
  expect(rooms.join("nope", peer("x", "sam"))).toBe(false);
});

test("anyone can add; skip is the host's unless allowed", () => {
  const rooms = new ListenRooms();
  const code = rooms.create("default", "h") as string;
  const host = peer("h", "malek");
  const sam = peer("s", "sam");
  rooms.join(code, host);
  rooms.join(code, sam);
  rooms.handle(code, sam, '{"t":"add","song":{"id":"s9","title":"Teardrop"}}');
  expect(host.got.at(-1)).toMatchObject({ t: "add", by: "sam", song: { id: "s9" } });

  const before = host.got.length;
  rooms.handle(code, sam, '{"t":"skip"}');
  expect(host.got.length).toBe(before);
  rooms.handle(code, sam, '{"t":"setting","anyoneCanSkip":true}');
  rooms.handle(code, host, '{"t":"setting","anyoneCanSkip":true}');
  rooms.handle(code, sam, '{"t":"skip"}');
  expect(host.got.at(-1)).toMatchObject({ t: "skip", by: "sam" });
});

test("ending the room tells everyone; a host who stays away ends it after the grace", async () => {
  const rooms = new ListenRooms(Date.now, 20);
  const code = rooms.create("default", "h") as string;
  const host = peer("h", "malek");
  const sam = peer("s", "sam");
  rooms.join(code, host);
  rooms.join(code, sam);
  rooms.leave(code, host);
  expect(rooms.has(code)).toBe(true);
  rooms.join(code, host);
  await Bun.sleep(40);
  expect(rooms.has(code)).toBe(true);
  rooms.leave(code, host);
  await Bun.sleep(40);
  expect(rooms.has(code)).toBe(false);
  expect(sam.got.at(-1)).toEqual({ t: "ended" });
});
