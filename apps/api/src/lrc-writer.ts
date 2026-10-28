import type { Database } from "bun:sqlite";
import { createHash } from "node:crypto";
import { existsSync, linkSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, normalize, relative, sep } from "node:path";

// Never overwrites (temp file + hard link fails on EEXIST); writes are logged with a hash so undo skips edited files.

interface Written {
  path: string;
  hash: string;
}

const sha = (text: string) => createHash("sha256").update(text).digest("hex");

export class LrcWriter {
  constructor(
    private readonly db: Database,
    private readonly musicDir: string,
  ) {
    db.run(`create table if not exists lrc_written (
      server text not null,
      song_id text not null,
      path text not null,
      hash text not null,
      written integer not null,
      primary key (server, song_id)
    )`);
  }

  target(songPath: string | undefined): string | null {
    if (!songPath) return null;
    const root = normalize(this.musicDir);
    // Navidrome reports either a path relative to its library or its own absolute path (often `/music/…`): try the
    // path as is, then each shorter suffix under our mount, so a different mount point still lines up.
    const parts = songPath.split(/[\\/]+/).filter(Boolean);
    const candidates = isAbsolute(songPath) ? [songPath, ...parts.map((_, at) => join(root, ...parts.slice(at)))] : [join(root, songPath)];
    for (const candidate of candidates) {
      const audio = normalize(candidate);
      const inside = relative(root, audio);
      if (!inside || inside.startsWith("..") || isAbsolute(inside) || inside.split(sep).includes("..")) continue;
      if (!existsSync(audio)) continue;
      const dot = audio.lastIndexOf(".");
      return `${dot > audio.lastIndexOf(sep) ? audio.slice(0, dot) : audio}.lrc`;
    }
    return null;
  }

  write(server: string, song: { id: string; path?: string }, text: string): boolean {
    const body = text.trim();
    if (!body) return false;
    const target = this.target(song.path);
    if (!target || existsSync(target)) return false;
    const temp = join(dirname(target), `.lodesong-${process.pid}-${Date.now()}.lrc.tmp`);
    const content = `${body}\n`;
    try {
      writeFileSync(temp, content, { flag: "wx" });
      linkSync(temp, target);
    } catch {
      return false;
    } finally {
      try {
        unlinkSync(temp);
      } catch {}
    }
    this.db
      .query("insert or replace into lrc_written (server, song_id, path, hash, written) values (?, ?, ?, ?, ?)")
      .run(server, song.id, target, sha(content), Date.now());
    return true;
  }

  count(server: string): number {
    return this.db.query<{ n: number }, [string]>("select count(*) as n from lrc_written where server = ?").get(server)?.n ?? 0;
  }

  undoAll(server: string): { removed: number; kept: number } {
    const rows = this.db.query<Written, [string]>("select path, hash from lrc_written where server = ?").all(server);
    let removed = 0;
    let kept = 0;
    for (const row of rows) {
      try {
        if (existsSync(row.path) && sha(readFileSync(row.path, "utf8")) === row.hash) {
          unlinkSync(row.path);
          removed++;
        } else kept++;
      } catch {
        kept++;
      }
    }
    this.db.query("delete from lrc_written where server = ?").run(server);
    return { removed, kept };
  }
}
