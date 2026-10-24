/**
 * Every environment variable the server reads, in one table: parsed and checked at boot (a bad value stops the server
 * with a message naming it), and the source of `docs/configuration.md` (`bun scripts/config-docs.ts`).
 */

/** A Navidrome (or any OpenSubsonic) server this instance may talk to. Only ever from config, never from a request. */
export interface Upstream {
  id: string;
  url: string;
}

export interface Setting {
  name: string;
  /** Shown in the docs; also the value used when the variable is unset. */
  fallback: string;
  description: string;
}

export const SETTINGS = [
  {
    name: "NAVIDROME_URL",
    fallback: "http://navidrome:4533",
    description: "Your Navidrome (or any OpenSubsonic server), as this container reaches it. Usually the internal Docker address.",
  },
  {
    name: "NAVIDROME_SERVERS",
    fallback: "",
    description:
      "Several servers to choose from at sign-in, as `id=url` pairs separated by commas (`home=http://navidrome:4533,friend=https://music.example.com`). Replaces `NAVIDROME_URL`. The browser can only ever pick from this list.",
  },
  { name: "PORT", fallback: "8080", description: "Port the server listens on." },
  {
    name: "DATA_DIR",
    fallback: "./data",
    description:
      "Where sessions, the search and lyrics index, history and the cover cache live. Mount a volume here (`/data` in the image).",
  },
  {
    name: "SESSION_SECRET",
    fallback: "",
    description: "Encrypts stored Navidrome credentials. Unset: a random one is generated once and kept in `DATA_DIR`.",
  },
  { name: "SESSION_IDLE_DAYS", fallback: "30", description: "A browser that isn't used for this long is signed out." },
  { name: "COVER_CACHE_MB", fallback: "1024", description: "Disk for resized covers; least recently used are deleted first." },
  {
    name: "LRCLIB_URL",
    fallback: "https://lrclib.net",
    description: "Where lyrics Navidrome doesn't have are looked up. Empty turns LRCLIB off.",
  },
  {
    name: "LYRICS_BACKFILL",
    fallback: "on",
    description: "`on`: walk the library in the background (about one song a second) to fetch lyrics nobody opened yet. `off` to disable.",
  },
  {
    name: "LYRICS_WRITE_LRC",
    fallback: "off",
    description:
      '`on`: lyrics found on LRCLIB are also saved as `<track>.lrc` next to the audio file, so other clients get them. Needs `MUSIC_DIR` and Navidrome\'s "Report Real Path". Never overwrites; undo from the lyrics page.',
  },
  {
    name: "LYTERION_URL",
    fallback: "",
    description:
      "Lyterion's API, as this container reaches it, to show what of your Spotify library is in Navidrome on the import page. Empty: the import page asks for a Spotify export file instead.",
  },
  {
    name: "LYTERION_TOKEN",
    fallback: "",
    description: "The `LYTERION_PLAYER_TOKEN` set on Lyterion. Needed with `LYTERION_URL`.",
  },
  {
    name: "ONE_SESSION",
    fallback: "on",
    description:
      "`on`: all of an account's open players share one playback session, like Spotify Connect: one plays, the others are remotes, and the device picker moves playback. `off`: every tab plays on its own.",
  },
  {
    name: "UPLOAD_DIR",
    fallback: "",
    description:
      "Where music uploaded from the player lands (admins only), mounted writable. An import inbox (beets, Lyterion) or Navidrome's music folder. Empty turns uploads off.",
  },
  {
    name: "MUSIC_DIR",
    fallback: "",
    description: "Navidrome's music folder mounted writable here, for `LYRICS_WRITE_LRC`. Unused otherwise.",
  },
  {
    name: "INDEX_USER",
    fallback: "",
    description: "Navidrome account for background jobs (search index, lyrics backfill). Unset: the admin who signed in most recently.",
  },
  { name: "INDEX_PASSWORD", fallback: "", description: "Password for `INDEX_USER`." },
  {
    name: "DEMO_SEED",
    fallback: "off",
    description:
      "`on`: fill `INDEX_USER`'s history with months of generated listening, once (for demos and previews, see docs/previews.md). Needs `INDEX_USER`.",
  },
  {
    name: "TRUST_PROXY",
    fallback: "false",
    description: "`true` behind a reverse proxy: client IPs come from `X-Real-IP` / `X-Forwarded-For` (login rate limits).",
  },
  {
    name: "UPDATE_CHECK",
    fallback: "off",
    description: "`on`: admins see when a newer release is out (one request to GitHub a day). Nothing else is ever sent anywhere.",
  },
] as const satisfies readonly Setting[];

type Env = Record<string, string | undefined>;

export interface Config {
  port: number;
  dataDir: string;
  upstreams: Upstream[];
  /** Null when unset: the caller generates and keeps one. */
  sessionSecret: string | null;
  sessionIdleDays: number;
  coverCacheMb: number;
  lrclibUrl: string;
  lyricsBackfill: boolean;
  oneSession: boolean;
  /** Null unless `LYRICS_WRITE_LRC=on`: the music folder .lrc files are written into. */
  lrcDir: string | null;
  /** Null when uploads are off. */
  uploadDir: string | null;
  /** Null unless both `LYTERION_URL` and `LYTERION_TOKEN` are set. */
  lyterion: { url: string; token: string } | null;
  indexUser: string | undefined;
  indexPassword: string | undefined;
  demoSeed: boolean;
  trustProxy: boolean;
  updateCheck: boolean;
}

const fallback = (name: (typeof SETTINGS)[number]["name"]) => SETTINGS.find((setting) => setting.name === name)?.fallback ?? "";
const isUrl = (value: string) => /^https?:\/\/[^\s/]+/.test(value);

/** Reads and checks the environment. Every problem is reported at once, each naming its variable. */
export function readConfig(env: Env): { config: Config; errors: string[] } {
  const errors: string[] = [];
  const get = (name: (typeof SETTINGS)[number]["name"]) => (env[name] ?? fallback(name)).trim();
  const number = (name: (typeof SETTINGS)[number]["name"], min: number, max = Number.MAX_SAFE_INTEGER) => {
    const value = Number(get(name));
    if (!Number.isInteger(value) || value < min || value > max)
      errors.push(`${name} must be a whole number from ${min} to ${max}, got "${get(name)}"`);
    return value;
  };
  const flag = (name: (typeof SETTINGS)[number]["name"], on: string[], off: string[]) => {
    const value = get(name).toLowerCase();
    if (![...on, ...off].includes(value)) errors.push(`${name} must be one of ${[...on, ...off].join(", ")}, got "${get(name)}"`);
    return on.includes(value);
  };

  const upstreams: Upstream[] = [];
  const servers = get("NAVIDROME_SERVERS");
  if (servers) {
    for (const entry of servers
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)) {
      const at = entry.indexOf("=");
      const id = at > 0 ? entry.slice(0, at).trim() : "";
      const url = entry
        .slice(at + 1)
        .trim()
        .replace(/\/+$/, "");
      if (!/^[\w-]+$/.test(id) || !isUrl(url)) errors.push(`NAVIDROME_SERVERS: "${entry}" isn't id=http(s)://host`);
      else if (upstreams.some((upstream) => upstream.id === id)) errors.push(`NAVIDROME_SERVERS: "${id}" is listed twice`);
      else upstreams.push({ id, url });
    }
  } else {
    const url = get("NAVIDROME_URL").replace(/\/+$/, "");
    if (!isUrl(url)) errors.push(`NAVIDROME_URL must be http(s)://host[:port], got "${url}"`);
    upstreams.push({ id: "default", url });
  }

  const lrclibUrl = get("LRCLIB_URL").replace(/\/+$/, "");
  if (lrclibUrl && !isUrl(lrclibUrl)) errors.push(`LRCLIB_URL must be http(s)://host or empty, got "${lrclibUrl}"`);
  const writeLrc = flag("LYRICS_WRITE_LRC", ["on"], ["off"]);
  const musicDir = get("MUSIC_DIR").replace(/(.)\/+$/, "$1");
  if (writeLrc && !musicDir.startsWith("/")) errors.push(`LYRICS_WRITE_LRC=on needs MUSIC_DIR, an absolute path, got "${musicDir}"`);
  const uploadDir = get("UPLOAD_DIR").replace(/(.)\/+$/, "$1");
  if (uploadDir && !uploadDir.startsWith("/")) errors.push(`UPLOAD_DIR must be an absolute path or empty, got "${uploadDir}"`);
  const lyterionUrl = get("LYTERION_URL").replace(/\/+$/, "");
  const lyterionToken = get("LYTERION_TOKEN");
  if (lyterionUrl && !isUrl(lyterionUrl)) errors.push(`LYTERION_URL must be http(s)://host or empty, got "${lyterionUrl}"`);
  if (!!lyterionUrl !== !!lyterionToken) errors.push("LYTERION_URL and LYTERION_TOKEN go together: set both or neither");
  const indexUser = get("INDEX_USER") || undefined;
  const indexPassword = get("INDEX_PASSWORD") || undefined;
  if (!!indexUser !== !!indexPassword) errors.push("INDEX_USER and INDEX_PASSWORD go together: set both or neither");

  const demoSeed = flag("DEMO_SEED", ["on"], ["off"]);
  if (demoSeed && !indexUser) errors.push("DEMO_SEED=on needs INDEX_USER and INDEX_PASSWORD: the history is seeded for that account");

  const config: Config = {
    port: number("PORT", 1, 65_535),
    dataDir: get("DATA_DIR"),
    upstreams,
    sessionSecret: get("SESSION_SECRET") || null,
    sessionIdleDays: number("SESSION_IDLE_DAYS", 1, 3650),
    coverCacheMb: number("COVER_CACHE_MB", 16),
    lrclibUrl,
    lyricsBackfill: flag("LYRICS_BACKFILL", ["on"], ["off"]),
    oneSession: flag("ONE_SESSION", ["on"], ["off"]),
    lrcDir: writeLrc ? musicDir : null,
    uploadDir: uploadDir || null,
    lyterion: lyterionUrl && lyterionToken ? { url: lyterionUrl, token: lyterionToken } : null,
    indexUser,
    indexPassword,
    demoSeed,
    trustProxy: flag("TRUST_PROXY", ["1", "true", "yes", "on"], ["0", "false", "no", "off", ""]),
    updateCheck: flag("UPDATE_CHECK", ["on"], ["off"]),
  };
  return { config, errors };
}

/** The configuration reference, as Markdown. */
export function configDocs(): string {
  const cell = (text: string) => text.replaceAll("|", "\\|");
  const rows = SETTINGS.map(
    (setting) => `| \`${setting.name}\` | ${setting.fallback ? `\`${cell(setting.fallback)}\`` : "—"} | ${cell(setting.description)} |`,
  );
  return [
    "# Configuration",
    "",
    "Everything is an environment variable. Only `NAVIDROME_URL` usually needs setting. A bad value stops the server at",
    "boot with a message naming the variable.",
    "",
    "<!-- generated by `bun scripts/config-docs.ts` from apps/server/src/settings.ts; don't edit by hand -->",
    "",
    "| variable | default | what |",
    "|---|---|---|",
    ...rows,
    "",
  ].join("\n");
}
