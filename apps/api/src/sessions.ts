import { Database } from "bun:sqlite";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export interface Session {
  id: string;
  server: string;
  user: string;
  token: string;
  salt: string;
  created: number;
  seen: number;
  agent: string;
  admin: boolean;
}

const MINUTE = 60_000;

// Only the cookie's SHA-256 is stored, so a copy of the database can't be replayed as cookies;
// the Subsonic token + salt are AES-256-GCM encrypted with a key from the session secret.
export class SessionStore {
  private readonly db: Database;
  private readonly key: Buffer;

  constructor(
    path: string,
    secret: string,
    private readonly idleMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.db = new Database(path, { create: true, strict: true });
    this.db.run("pragma journal_mode = wal");
    this.db.run(
      "create table if not exists sessions (hash text primary key, server text not null, user text not null, secret blob not null, created integer not null, seen integer not null, agent text not null default '')",
    );
    if (!this.db.query("select 1 from pragma_table_info('sessions') where name = 'admin'").get())
      this.db.run("alter table sessions add column admin integer not null default 0");
    this.key = createHash("sha256").update(`keep-player:sessions:${secret}`).digest();
  }

  private static hash(cookie: string): string {
    return createHash("sha256").update(cookie).digest("hex");
  }

  private seal(value: string): Uint8Array {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const body = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), body]);
  }

  private open(sealed: Uint8Array): string | null {
    try {
      const data = Buffer.from(sealed);
      const decipher = createDecipheriv("aes-256-gcm", this.key, data.subarray(0, 12));
      decipher.setAuthTag(data.subarray(12, 28));
      return Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString("utf8");
    } catch {
      // Wrong secret (it was rotated) or tampered row: treat as no session.
      return null;
    }
  }

  create(input: { server: string; user: string; token: string; salt: string; agent: string; admin?: boolean }): string {
    const cookie = randomBytes(32).toString("base64url");
    const time = this.now();
    this.db
      .query(
        "insert into sessions (hash, server, user, secret, created, seen, agent, admin) values ($hash, $server, $user, $secret, $time, $time, $agent, $admin)",
      )
      .run({
        hash: SessionStore.hash(cookie),
        server: input.server,
        user: input.user,
        secret: this.seal(JSON.stringify({ token: input.token, salt: input.salt })),
        time,
        agent: input.agent.slice(0, 300),
        admin: input.admin ? 1 : 0,
      });
    return cookie;
  }

  get(cookie: string | undefined): Session | null {
    if (!cookie) return null;
    const hash = SessionStore.hash(cookie);
    const row = this.db.query<RowData, [string]>("select * from sessions where hash = ?").get(hash);
    if (!row) return null;
    const time = this.now();
    if (time - row.seen > this.idleMs) {
      this.db.query("delete from sessions where hash = ?").run(hash);
      return null;
    }
    const secret = this.open(row.secret);
    if (!secret) return null;
    if (time - row.seen > MINUTE) this.db.query("update sessions set seen = ? where hash = ?").run(time, hash);
    const { token, salt } = JSON.parse(secret) as { token: string; salt: string };
    return {
      id: hash.slice(0, 16),
      server: row.server,
      user: row.user,
      token,
      salt,
      created: row.created,
      seen: row.seen,
      agent: row.agent,
      admin: row.admin === 1,
    };
  }

  delete(cookie: string): void {
    this.db.query("delete from sessions where hash = ?").run(SessionStore.hash(cookie));
  }

  list(server: string, user: string): Omit<Session, "token" | "salt" | "admin">[] {
    return this.db
      .query<RowData, [string, string]>("select * from sessions where server = ? and user = ? order by seen desc")
      .all(server, user)
      .map((row) => ({
        id: row.hash.slice(0, 16),
        server: row.server,
        user: row.user,
        created: row.created,
        seen: row.seen,
        agent: row.agent,
      }));
  }

  revoke(server: string, user: string, id: string): boolean {
    if (!/^[0-9a-f]{16}$/.test(id)) return false;
    return this.db.query("delete from sessions where server = ? and user = ? and hash like ?").run(server, user, `${id}%`).changes > 0;
  }

  adminCredentials(server: string): { user: string; token: string; salt: string } | null {
    const row = this.db
      .query<RowData, [string, number]>("select * from sessions where server = ? and admin = 1 and seen > ? order by seen desc limit 1")
      .get(server, this.now() - this.idleMs);
    const secret = row && this.open(row.secret);
    if (!row || !secret) return null;
    const { token, salt } = JSON.parse(secret) as { token: string; salt: string };
    return { user: row.user, token, salt };
  }

  purgeIdle(): void {
    this.db.query("delete from sessions where seen < ?").run(this.now() - this.idleMs);
  }
}

interface RowData {
  hash: string;
  server: string;
  user: string;
  secret: Uint8Array;
  created: number;
  seen: number;
  agent: string;
  admin: number;
}
