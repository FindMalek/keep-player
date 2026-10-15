import type { Database } from "bun:sqlite";
import type { LyricsCoverage } from "../shared/lyrics";

/*
 * How much of the library has lyrics, from the search index (every song, with its folder for access) joined with the
 * lyrics cache. Songs the backfill hasn't reached yet count as "unchecked", not "missing".
 */

const STATUSES = ["synced", "plain", "instrumental", "missing"] as const;

/** `folders` null: everything (admins with access to all folders, tests). */
function folderFilter(folders: string[] | null): { sql: string; params: string[] } {
  if (!folders) return { sql: "", params: [] };
  if (!folders.length) return { sql: " and 0", params: [] };
  return { sql: ` and i.folder in (${folders.map(() => "?").join(", ")})`, params: folders };
}

export function lyricsCoverageReport(db: Database, server: string, folders: string[] | null): LyricsCoverage {
  const filter = folderFilter(folders);
  const from = `from idx_items i left join lyrics l on l.song_id = ? || ':' || i.id where i.server = ? and i.kind = 'song'${filter.sql}`;
  const params = [server, server, ...filter.params];
  const counts = db
    .query<{ status: string | null; n: number }, string[]>(`select l.status as status, count(*) as n ${from} group by l.status`)
    .all(...params);
  const totals = { synced: 0, plain: 0, instrumental: 0, missing: 0, unchecked: 0 };
  for (const row of counts) {
    const key = (STATUSES as readonly string[]).includes(row.status ?? "") ? (row.status as (typeof STATUSES)[number]) : "unchecked";
    totals[key] += row.n;
  }
  // Albums with the most songs lacking lyrics first: where fixing tags (or a .lrc) helps most.
  const albums = db
    .query<{ id: string; name: string; artist: string; total: number; synced: number; plain: number; missing: number }, string[]>(
      `select json_extract(i.data, '$.albumId') as id, coalesce(json_extract(i.data, '$.album'), '') as name,
              coalesce(json_extract(i.data, '$.artist'), '') as artist, count(*) as total,
              sum(l.status = 'synced') as synced, sum(l.status = 'plain') as plain, sum(l.status = 'missing') as missing
       ${from} and json_extract(i.data, '$.albumId') is not null
       group by json_extract(i.data, '$.albumId') having sum(l.status = 'missing') > 0
       order by missing desc, total desc limit 50`,
    )
    .all(...params)
    .map((album) => ({ ...album, synced: album.synced ?? 0, plain: album.plain ?? 0, missing: album.missing ?? 0 }));
  return { total: counts.reduce((sum, row) => sum + row.n, 0), ...totals, albums };
}

/** Songs whose lyrics were looked for and not found, a page at a time (for the coverage page's list). */
export function missingLyrics(
  db: Database,
  server: string,
  folders: string[] | null,
  offset: number,
  limit: number,
): Record<string, unknown>[] {
  const filter = folderFilter(folders);
  return db
    .query<{ data: string }, (string | number)[]>(
      `select i.data as data from idx_items i join lyrics l on l.song_id = ? || ':' || i.id
       where i.server = ? and i.kind = 'song' and l.status = 'missing'${filter.sql}
       order by json_extract(i.data, '$.artist'), json_extract(i.data, '$.album'), json_extract(i.data, '$.track')
       limit ? offset ?`,
    )
    .all(server, server, ...filter.params, limit, offset)
    .map((row) => JSON.parse(row.data) as Record<string, unknown>);
}

/** Forget this server's misses, so the backfill asks LRCLIB about them again now rather than in 30 days. */
export function forgetMisses(db: Database, server: string): number {
  return db.query("delete from lyrics where song_id like ? and status = 'missing'").run(`${server}:%`).changes;
}
