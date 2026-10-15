import { describe, expect, test } from "bun:test";
import {
  addToQueue,
  appendContext,
  balancedShuffle,
  clearContext,
  clearUpNext,
  contextUpcoming,
  EMPTY_QUEUE,
  jumpTo,
  move,
  moveTo,
  next,
  peekNext,
  peekUpcoming,
  playContext,
  playNext,
  previous,
  type Queue,
  remove,
  setShuffle,
  shuffled,
} from "./queue";
import type { Song } from "./types";

const song = (id: string, artist = "a"): Song => ({ id, title: id, artist, artistId: artist });
const album = ["1", "2", "3", "4"].map((id) => song(id));
const ids = (queue: Queue) => queue.current?.song.id;
// Deterministic "random" so shuffle tests are repeatable.
const seeded =
  (seed = 1) =>
  () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };

describe("queue", () => {
  test("plays a context in order from the start song, then ends", () => {
    let queue = playContext(EMPTY_QUEUE, album, 1);
    expect(ids(queue)).toBe("2");
    queue = next(next(queue));
    expect(ids(queue)).toBe("4");
    queue = next(queue);
    expect(queue.current).toBeNull();
    expect(queue.history.map((entry) => entry.song.id)).toEqual(["2", "3", "4"]);
  });

  test("your queue plays before the context and survives starting a new context", () => {
    let queue = playContext(EMPTY_QUEUE, album, 0);
    queue = addToQueue(queue, [song("q1")]);
    queue = playNext(queue, [song("q0")]);
    expect(peekNext(queue)?.id).toBe("q0");
    queue = next(queue);
    expect(ids(queue)).toBe("q0");
    queue = playContext(queue, [song("x"), song("y")], 0);
    expect(queue.upNext.map((entry) => entry.song.id)).toEqual(["q1"]);
    expect(ids(next(queue))).toBe("q1");
    expect(ids(next(next(queue)))).toBe("y");
  });

  test("previous returns a queued song to the front of your queue and restores the context cursor", () => {
    let queue = addToQueue(playContext(EMPTY_QUEUE, album, 0), [song("q")]);
    queue = next(queue);
    expect(ids(queue)).toBe("q");
    queue = previous(queue);
    expect(ids(queue)).toBe("1");
    expect(queue.upNext.map((entry) => entry.song.id)).toEqual(["q"]);
    expect(ids(next(next(queue)))).toBe("2");
  });

  test("repeat all wraps around, and peekNext agrees with next", () => {
    let queue: Queue = { ...playContext(EMPTY_QUEUE, album, 3), repeat: "all" };
    expect(peekNext(queue)?.id).toBe("1");
    queue = next(queue);
    expect(ids(queue)).toBe("1");
  });

  test("shuffle on reorders only what's left; off continues in natural order after the last context song", () => {
    let queue = playContext(EMPTY_QUEUE, album, 1);
    queue = setShuffle(queue, true, seeded());
    expect(queue.context.order.slice(0, 2)).toEqual([0, 1]);
    expect([...queue.context.order].sort()).toEqual([0, 1, 2, 3]);
    queue = setShuffle(queue, false);
    expect(contextUpcoming(queue).map((entry) => entry.song.id)).toEqual(["3", "4"]);
  });

  test("shuffled play starts with the chosen song and plays every song once", () => {
    let queue = playContext(EMPTY_QUEUE, album, 2, { shuffle: true }, seeded(7));
    expect(ids(queue)).toBe("3");
    const played = [ids(queue)];
    for (let i = 0; i < 3; i += 1) {
      queue = next(queue);
      played.push(ids(queue));
    }
    expect([...played].sort()).toEqual(["1", "2", "3", "4"]);
  });

  test("balanced shuffle never puts the same artist back to back when it can be avoided", () => {
    const songs = [...["a", "a", "a", "b", "b", "b", "c", "c", "c"].map((artist, i) => song(`${artist}${i}`, artist))];
    for (let seed = 1; seed < 30; seed += 1) {
      const order = balancedShuffle(
        songs,
        songs.map((_, index) => index),
        seeded(seed),
      );
      const artists = order.map((index) => songs[index]?.artist);
      expect(artists.some((artist, i) => i > 0 && artist === artists[i - 1])).toBe(false);
    }
  });

  test("jump, remove and clear act on the right part of the queue", () => {
    let queue = addToQueue(playContext(EMPTY_QUEUE, album, 0), [song("q1"), song("q2")]);
    queue = remove(queue, queue.upNext[0] as never);
    expect(queue.upNext.map((entry) => entry.song.id)).toEqual(["q2"]);
    const third = contextUpcoming(queue).find((entry) => entry.song.id === "3");
    queue = jumpTo(queue, third as never);
    expect(ids(queue)).toBe("3");
    expect(queue.upNext.map((entry) => entry.song.id)).toEqual(["q2"]);
    expect(contextUpcoming(clearContext(queue))).toEqual([]);
    expect(clearUpNext(queue).upNext).toEqual([]);
  });

  test("move reorders within your queue and within the upcoming context, never past the current song", () => {
    let queue = addToQueue(playContext(EMPTY_QUEUE, album, 0), [song("q1"), song("q2")]);
    queue = move(queue, queue.upNext[1] as never, -1);
    expect(queue.upNext.map((entry) => entry.song.id)).toEqual(["q2", "q1"]);
    const upcoming = contextUpcoming(queue);
    queue = move(queue, upcoming[0] as never, 1);
    expect(contextUpcoming(queue).map((entry) => entry.song.id)).toEqual(["3", "2", "4"]);
    expect(move(queue, contextUpcoming(queue)[0] as never, -1)).toBe(queue);
  });

  test("dragging an entry onto another takes its place, only within the same part of the queue", () => {
    let queue = addToQueue(playContext(EMPTY_QUEUE, album, 0), [song("q1"), song("q2"), song("q3")]);
    queue = moveTo(queue, queue.upNext[2] as never, queue.upNext[0] as never);
    expect(queue.upNext.map((entry) => entry.song.id)).toEqual(["q3", "q1", "q2"]);
    const upcoming = contextUpcoming(queue);
    queue = moveTo(queue, upcoming[2] as never, upcoming[0] as never);
    expect(contextUpcoming(queue).map((entry) => entry.song.id)).toEqual(["4", "2", "3"]);
    // Your queue and the album don't mix by dragging.
    expect(moveTo(queue, queue.upNext[0] as never, contextUpcoming(queue)[0] as never)).toBe(queue);
  });
});

test("a radio refills by appending to the context: the new songs play after the old ones, shuffle or not", () => {
  const start = playContext(EMPTY_QUEUE, [song("a"), song("b")], 0, { shuffle: true }, () => 0.5);
  const more = appendContext(start, [song("c"), song("d")]);
  expect(more.context.songs.map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
  expect(more.context.order.slice(2)).toEqual([2, 3]);
  expect(peekUpcoming(more, 3).map((item) => item.id)).toEqual(["b", "c", "d"]);
  expect(appendContext(start, [])).toBe(start);
});

describe("shuffle rules", () => {
  const withAlbum = (id: string, albumId: string, track: number): Song => ({ ...song(id, id), albumId, track }) as Song;
  const library = [
    withAlbum("a1", "A", 1),
    withAlbum("a2", "A", 2),
    withAlbum("a3", "A", 3),
    withAlbum("b1", "B", 1),
    withAlbum("b2", "B", 2),
    withAlbum("c1", "C", 1),
  ];
  const all = library.map((_, index) => index);
  const ids = (order: number[]) => order.map((index) => library[index]?.id);

  test("never: skipped songs are left out of a shuffle", () => {
    const order = shuffled(library, all, () => 0.3, { skip: (item) => item.id === "b1" || item.albumId === "C" });
    expect(ids(order).sort()).toEqual(["a1", "a2", "a3", "b2"]);
  });

  test("keep in order: an album stays together and in track order wherever the shuffle puts it", () => {
    for (const seed of [0.05, 0.3, 0.6, 0.95]) {
      const order = ids(shuffled(library, all, () => seed, { block: (item) => (item.albumId === "A" ? "A" : null) }));
      const at = order.indexOf("a1");
      expect(order.slice(at, at + 3)).toEqual(["a1", "a2", "a3"]);
      expect([...order].sort()).toEqual(["a1", "a2", "a3", "b1", "b2", "c1"]);
    }
  });

  test("no rules, no change", () => {
    expect(shuffled(library, all, () => 0.3, {})).toEqual(balancedShuffle(library, all, () => 0.3));
  });
});
