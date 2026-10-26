import type { Song } from "./types";

// Plain data + pure functions so every operation is unit-testable without audio. `upNext` (play next / add to queue)
// survives a new context; the context keeps natural order in `songs` and play order in `order`.

export type Repeat = "off" | "all" | "one";

export interface Entry {
  /** Unique per queue slot: the same song can be queued twice. */
  uid: string;
  song: Song;
  from: "user" | "context";
  orderIndex?: number;
}

export interface QueueSource {
  kind: string;
  name: string;
  href?: string;
}

export interface Queue {
  history: Entry[];
  current: Entry | null;
  upNext: Entry[];
  context: {
    songs: Song[];
    order: number[];
    /** Position in `order` of the context song playing or last played; -1 before the first. */
    cursor: number;
    source: QueueSource | null;
    album: boolean;
  };
  shuffle: boolean;
  repeat: Repeat;
}

export const EMPTY_QUEUE: Queue = {
  history: [],
  current: null,
  upNext: [],
  context: { songs: [], order: [], cursor: -1, source: null, album: false },
  shuffle: false,
  repeat: "off",
};

const HISTORY_LIMIT = 500;

let uidCounter = 0;
const uid = () => `${Date.now().toString(36)}-${(uidCounter++).toString(36)}`;

const userEntry = (song: Song): Entry => ({ uid: uid(), song, from: "user" });

function contextEntry(queue: Queue, orderIndex: number): Entry | null {
  const song = queue.context.songs[queue.context.order[orderIndex] ?? -1];
  return song ? { uid: uid(), song, from: "context", orderIndex } : null;
}

const pushHistory = (history: Entry[], entry: Entry | null): Entry[] => (entry ? [...history, entry].slice(-HISTORY_LIMIT) : history);

type Random = () => number;

function fisherYates<T>(items: T[], random: Random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j] as T, copy[i] as T];
  }
  return copy;
}

// Balanced shuffle: each artist spread evenly with a random offset; within an artist, least played first more often.
export function balancedShuffle(songs: Song[], indexes: number[], random: Random = Math.random): number[] {
  const groups = new Map<string, number[]>();
  for (const index of indexes) {
    const song = songs[index];
    const key = song?.artistId ?? song?.artist ?? "";
    groups.set(key, [...(groups.get(key) ?? []), index]);
  }
  const placed: { index: number; position: number }[] = [];
  for (const group of groups.values()) {
    // Lower play counts float up, with enough noise that it isn't a sort.
    const ordered = fisherYates(group, random).sort(
      (a, b) => (songs[a]?.playCount ?? 0) + random() * 3 - ((songs[b]?.playCount ?? 0) + random() * 3),
    );
    const step = 1 / ordered.length;
    const offset = random() * step;
    ordered.forEach((index, i) => {
      placed.push({ index, position: offset + i * step + (random() - 0.5) * step * 0.2 });
    });
  }
  const order = placed.sort((a, b) => a.position - b.position).map((item) => item.index);
  const artist = (index: number | undefined) => (index === undefined ? undefined : (songs[index]?.artistId ?? songs[index]?.artist));
  for (let i = 1; i < order.length; i += 1) {
    if (artist(order[i]) !== artist(order[i - 1])) continue;
    const swap = order.findIndex(
      (candidate, j) => j > i && artist(candidate) !== artist(order[i - 1]) && artist(order[j - 1]) !== artist(order[i]),
    );
    if (swap > i) [order[i], order[swap]] = [order[swap] as number, order[i] as number];
  }
  return order;
}

export interface ShuffleRules {
  skip?: (song: Song) => boolean;
  /** The block a song belongs to (an album kept in order), or null. A block moves as one, in its own order. */
  block?: (song: Song) => string | null;
}
let rules: ShuffleRules = {};
export function setShuffleRules(next: ShuffleRules): void {
  rules = next;
}

export function shuffled(songs: Song[], indexes: number[], random: Random = Math.random, applied: ShuffleRules = rules): number[] {
  const kept = applied.skip ? indexes.filter((index) => !applied.skip?.(songs[index] as Song)) : indexes;
  const order = balancedShuffle(songs, kept, random);
  const { block } = applied;
  if (!block) return order;
  const members = new Map<string, number[]>();
  for (const index of kept) {
    const key = block(songs[index] as Song);
    if (key) members.set(key, [...(members.get(key) ?? []), index]);
  }
  const position = (index: number) => {
    const song = songs[index] as Song & { discNumber?: number; track?: number };
    return [song.discNumber ?? 1, song.track ?? 0, index] as const;
  };
  for (const list of members.values()) list.sort((a, b) => position(a)[0] - position(b)[0] || position(a)[1] - position(b)[1] || a - b);
  const placed = new Set<string>();
  const out: number[] = [];
  for (const index of order) {
    const key = block(songs[index] as Song);
    if (!key) out.push(index);
    else if (!placed.has(key)) {
      placed.add(key);
      out.push(...(members.get(key) ?? []));
    }
  }
  return out;
}

export function playContext(
  queue: Queue,
  songs: Song[],
  start: number,
  options: { shuffle?: boolean; album?: boolean; source?: QueueSource | null } = {},
  random: Random = Math.random,
): Queue {
  const shuffle = options.shuffle ?? queue.shuffle;
  const natural = songs.map((_, index) => index);
  const startIndex = start < 0 ? Math.floor(random() * songs.length) : Math.min(start, songs.length - 1);
  const order = shuffle
    ? [
        startIndex,
        ...shuffled(
          songs,
          natural.filter((index) => index !== startIndex),
          random,
        ),
      ]
    : natural;
  const next: Queue = {
    ...queue,
    shuffle,
    history: pushHistory(queue.history, queue.current),
    context: { songs, order, cursor: shuffle ? 0 : startIndex, source: options.source ?? null, album: Boolean(options.album) && !shuffle },
  };
  return { ...next, current: contextEntry(next, next.context.cursor) };
}

export function appendContext(queue: Queue, songs: Song[]): Queue {
  if (!songs.length) return queue;
  const start = queue.context.songs.length;
  return {
    ...queue,
    context: {
      ...queue.context,
      songs: [...queue.context.songs, ...songs],
      order: [...queue.context.order, ...songs.map((_, index) => start + index)],
    },
  };
}

export function peekNext(queue: Queue): Song | null {
  if (queue.upNext[0]) return queue.upNext[0].song;
  const following = queue.context.songs[queue.context.order[queue.context.cursor + 1] ?? -1];
  if (following) return following;
  if (queue.repeat === "all") return queue.context.songs[queue.context.order[0] ?? -1] ?? null;
  return null;
}

export function peekUpcoming(queue: Queue, count: number): Song[] {
  const songs = queue.upNext.slice(0, count).map((entry) => entry.song);
  const { order, cursor } = queue.context;
  for (let step = 1; songs.length < count && step <= order.length; step += 1) {
    const at = cursor + step;
    if (at >= order.length && queue.repeat !== "all") break;
    const song = queue.context.songs[order[at % order.length] as number];
    if (song) songs.push(song);
  }
  return songs;
}

export function next(queue: Queue, random: Random = Math.random): Queue {
  const history = pushHistory(queue.history, queue.current);
  const [user, ...rest] = queue.upNext;
  if (user) return { ...queue, history, current: user, upNext: rest };
  const cursor = queue.context.cursor + 1;
  if (cursor < queue.context.order.length) {
    const moved = { ...queue, history, context: { ...queue.context, cursor } };
    return { ...moved, current: contextEntry(moved, cursor) };
  }
  if (queue.repeat === "all" && queue.context.songs.length) {
    const natural = queue.context.songs.map((_, index) => index);
    const order = queue.shuffle ? shuffled(queue.context.songs, natural, random) : natural;
    const wrapped = { ...queue, history, context: { ...queue.context, order, cursor: 0 } };
    return { ...wrapped, current: contextEntry(wrapped, 0) };
  }
  return { ...queue, history, current: null };
}

export function previous(queue: Queue): Queue {
  const last = queue.history.at(-1);
  if (!last) return queue;
  const current = queue.current;
  const upNext = current?.from === "user" ? [current, ...queue.upNext] : queue.upNext;
  const cursor =
    last.from === "context"
      ? (last.orderIndex ?? queue.context.cursor)
      : current?.from === "context"
        ? queue.context.cursor - 1
        : queue.context.cursor;
  return { ...queue, history: queue.history.slice(0, -1), current: last, upNext, context: { ...queue.context, cursor } };
}

export function playNext(queue: Queue, songs: Song[]): Queue {
  return { ...queue, upNext: [...songs.map(userEntry), ...queue.upNext] };
}

export function addToQueue(queue: Queue, songs: Song[]): Queue {
  return { ...queue, upNext: [...queue.upNext, ...songs.map(userEntry)] };
}

export function contextUpcoming(queue: Queue): Entry[] {
  const entries: Entry[] = [];
  for (let index = queue.context.cursor + 1; index < queue.context.order.length; index += 1) {
    const song = queue.context.songs[queue.context.order[index] as number];
    // Stable uid per order position, so list rows keep their identity between renders.
    if (song) entries.push({ uid: `ctx-${index}`, song, from: "context", orderIndex: index });
  }
  return entries;
}

export function jumpTo(queue: Queue, target: Entry): Queue {
  if (target.from === "user") {
    const at = queue.upNext.findIndex((entry) => entry.uid === target.uid);
    if (at < 0) return queue;
    return {
      ...queue,
      history: pushHistory(queue.history, queue.current),
      current: queue.upNext[at] as Entry,
      upNext: queue.upNext.slice(at + 1),
    };
  }
  const orderIndex = target.orderIndex ?? -1;
  if (orderIndex <= queue.context.cursor || orderIndex >= queue.context.order.length) return queue;
  const moved = { ...queue, history: pushHistory(queue.history, queue.current), context: { ...queue.context, cursor: orderIndex } };
  return { ...moved, current: contextEntry(moved, orderIndex) };
}

export function remove(queue: Queue, target: Entry): Queue {
  if (target.from === "user") return { ...queue, upNext: queue.upNext.filter((entry) => entry.uid !== target.uid) };
  const orderIndex = target.orderIndex ?? -1;
  if (orderIndex <= queue.context.cursor) return queue;
  return { ...queue, context: { ...queue.context, order: queue.context.order.filter((_, index) => index !== orderIndex) } };
}

export function move(queue: Queue, target: Entry, delta: -1 | 1): Queue {
  if (target.from === "user") {
    const at = queue.upNext.findIndex((entry) => entry.uid === target.uid);
    const to = at + delta;
    if (at < 0 || to < 0 || to >= queue.upNext.length) return queue;
    const upNext = [...queue.upNext];
    [upNext[at], upNext[to]] = [upNext[to] as Entry, upNext[at] as Entry];
    return { ...queue, upNext };
  }
  const at = target.orderIndex ?? -1;
  const to = at + delta;
  if (at <= queue.context.cursor || to <= queue.context.cursor || to >= queue.context.order.length) return queue;
  const order = [...queue.context.order];
  [order[at], order[to]] = [order[to] as number, order[at] as number];
  return { ...queue, context: { ...queue.context, order } };
}

export function moveTo(queue: Queue, target: Entry, to: Entry): Queue {
  if (target.uid === to.uid || target.from !== to.from) return queue;
  if (target.from === "user") {
    const from = queue.upNext.findIndex((entry) => entry.uid === target.uid);
    const at = queue.upNext.findIndex((entry) => entry.uid === to.uid);
    if (from < 0 || at < 0) return queue;
    const upNext = [...queue.upNext];
    const [moved] = upNext.splice(from, 1);
    upNext.splice(at, 0, moved as Entry);
    return { ...queue, upNext };
  }
  const from = target.orderIndex ?? -1;
  const at = to.orderIndex ?? -1;
  if (from <= queue.context.cursor || at <= queue.context.cursor) return queue;
  const order = [...queue.context.order];
  const [moved] = order.splice(from, 1);
  order.splice(at, 0, moved as number);
  return { ...queue, context: { ...queue.context, order } };
}

export const clearUpNext = (queue: Queue): Queue => ({ ...queue, upNext: [] });

export const clearContext = (queue: Queue): Queue => ({
  ...queue,
  context: { ...queue.context, order: queue.context.order.slice(0, queue.context.cursor + 1) },
});

/** Shuffle reorders only what's still to come, so on → off returns to the natural order after the current song. */
export function setShuffle(queue: Queue, shuffle: boolean, random: Random = Math.random): Queue {
  if (shuffle === queue.shuffle) return queue;
  const { songs, order, cursor } = queue.context;
  if (shuffle) {
    const upcoming = order.slice(cursor + 1);
    const reordered = [...order.slice(0, cursor + 1), ...shuffled(songs, upcoming, random)];
    return { ...queue, shuffle, context: { ...queue.context, order: reordered, album: false } };
  }
  const natural = songs.map((_, index) => index);
  const at = order[cursor] ?? -1;
  const current = queue.current?.from === "context" ? { ...queue.current, orderIndex: at } : queue.current;
  return { ...queue, shuffle, current, context: { ...queue.context, order: natural, cursor: at } };
}
