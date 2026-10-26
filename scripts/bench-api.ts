/**
 * The API's heavy calls against a running server (the mock's 10k-song library): median time and bytes on the wire,
 * the way a browser asks (brotli/gzip accepted). `bun scripts/bench-api.ts [url]`, default http://127.0.0.1:8088,
 * signs in as demo/demo. Used for the before/after tables in performance PRs.
 */
const base = process.argv[2] ?? "http://127.0.0.1:8088";
const RUNS = 15;

const login = await fetch(`${base}/auth/login`, {
  method: "POST",
  headers: { "content-type": "application/json", "x-keep-player": "1" },
  body: JSON.stringify({ user: "demo", password: "demo", server: "default" }),
});
const cookie = (login.headers.get("set-cookie") ?? "").split(";")[0] ?? "";
if (!login.ok || !cookie) throw new Error(`sign in failed: ${login.status}`);
const headers = { cookie, "x-keep-player": "1", "accept-encoding": "br, gzip" };

const rest = (endpoint: string, params: Record<string, string> = {}) =>
  `/rest/${endpoint}?${new URLSearchParams({ f: "json", ...params })}`;
const now = Date.now();
const calls: [string, string, RequestInit?][] = [
  ["songs page (search3, 200)", rest("search3", { query: "", songCount: "200", artistCount: "0", albumCount: "0" })],
  ["albums page (getAlbumList2, 500)", rest("getAlbumList2", { type: "alphabeticalByName", size: "500" })],
  ["artists index (getArtists)", rest("getArtists")],
  ["playlist (getPlaylist pl-1)", rest("getPlaylist", { id: "pl-1" })],
  ["⌘K search (/api/search)", "/api/search?q=ember"],
  [
    "stats, a year (rpc)",
    "/api/rpc/stats/range",
    { method: "POST", body: JSON.stringify({ json: { from: now - 365 * 86_400_000, to: now, tz: 0 } }) },
  ],
  ["made for you (rpc)", "/api/rpc/mixes", { method: "POST", body: JSON.stringify({ json: { day: Math.floor(now / 86_400_000), hour: 9, tz: 0 } }) }],
];

console.log(`| call | median ms | bytes on the wire | encoding |\n|---|---|---|---|`);
for (const [name, path, init] of calls) {
  const times: number[] = [];
  let bytes = 0;
  let encoding = "none";
  for (let i = 0; i < RUNS; i++) {
    const started = performance.now();
    const response = await fetch(`${base}${path}`, {
      ...init,
      headers: { ...headers, ...(init?.body ? { "content-type": "application/json" } : {}) },
      // Count the bytes as sent, not as decompressed.
      decompress: false,
    } as RequestInit);
    const body = await response.arrayBuffer();
    times.push(performance.now() - started);
    bytes = body.byteLength;
    encoding = response.headers.get("content-encoding") ?? "none";
    if (!response.ok) throw new Error(`${name}: ${response.status}`);
  }
  times.sort((a, b) => a - b);
  console.log(`| ${name} | ${times[Math.floor(RUNS / 2)]?.toFixed(1)} | ${bytes.toLocaleString("en")} | ${encoding} |`);
}
