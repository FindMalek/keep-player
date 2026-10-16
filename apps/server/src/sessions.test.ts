import { expect, test } from "bun:test";
import { SessionStore } from "./sessions";

test("sessions decrypt for their cookie only and expire after idling", () => {
  let now = 0;
  const store = new SessionStore(":memory:", "secret", 1000, () => now);
  const cookie = store.create({ server: "default", user: "demo", token: "tok", salt: "salt", agent: "test" });
  expect(store.get(cookie)).toMatchObject({ user: "demo", token: "tok", salt: "salt" });
  expect(store.get(`${cookie}x`)).toBeNull();
  now = 1001;
  expect(store.get(cookie)).toBeNull();
});

test("a rotated secret invalidates existing sessions instead of failing", () => {
  const path = `${process.env.TMPDIR ?? "/tmp"}/kp-sessions-${crypto.randomUUID()}.db`;
  const cookie = new SessionStore(path, "old", 60_000).create({ server: "default", user: "demo", token: "t", salt: "s", agent: "" });
  expect(new SessionStore(path, "new", 60_000).get(cookie)).toBeNull();
});

test("background jobs borrow only an admin's session", () => {
  const store = new SessionStore(":memory:", "secret", 60_000);
  store.create({ server: "default", user: "guest", token: "g", salt: "g", agent: "" });
  expect(store.adminCredentials("default")).toBeNull();
  store.create({ server: "default", user: "boss", token: "b", salt: "b", agent: "", admin: true });
  expect(store.adminCredentials("default")).toMatchObject({ user: "boss", token: "b" });
});
