import { mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";

export { snapCoverSize } from "../shared/cover-sizes";

type Fetcher = (id: string, size: number) => Promise<Response | null>;

/**
 * Covers resized and re-encoded to WebP once, then served from disk. Least recently used files are deleted when the
 * cache grows past its limit. Concurrent requests for the same cover share one conversion.
 */
export class CoverCache {
  private readonly entries = new Map<string, { bytes: number; used: number }>();
  private total = 0;
  private readonly pending = new Map<string, Promise<string | null>>();

  constructor(
    private readonly dir: string,
    private readonly limitBytes: number,
    private readonly now: () => number = Date.now,
  ) {
    mkdirSync(dir, { recursive: true });
    for (const name of readdirSync(dir)) {
      const stat = statSync(join(dir, name));
      this.entries.set(name, { bytes: stat.size, used: stat.mtimeMs });
      this.total += stat.size;
    }
  }

  /** Path of the cached file for this cover, fetching and converting it first if needed; null if there's no cover. */
  async get(key: string, size: number, fetchCover: Fetcher, id: string): Promise<string | null> {
    const name = `${new Bun.CryptoHasher("sha1").update(key).digest("hex")}-${size}.webp`;
    const entry = this.entries.get(name);
    if (entry) {
      entry.used = this.now();
      return join(this.dir, name);
    }
    const running = this.pending.get(name);
    if (running) return running;
    const job = this.create(name, size, fetchCover, id).finally(() => this.pending.delete(name));
    this.pending.set(name, job);
    return job;
  }

  private async create(name: string, size: number, fetchCover: Fetcher, id: string): Promise<string | null> {
    const response = await fetchCover(id, size);
    if (!response?.ok || !response.headers.get("content-type")?.startsWith("image/")) return null;
    const source = await response.arrayBuffer();
    const bytes = await new Bun.Image(source)
      .resize(size, size, { fit: "inside", withoutEnlargement: true })
      .webp({ quality: 82 })
      .bytes()
      .catch(() => null);
    if (!bytes) return null;
    const path = join(this.dir, name);
    await Bun.write(path, bytes);
    this.entries.set(name, { bytes: bytes.length, used: this.now() });
    this.total += bytes.length;
    this.evict();
    return path;
  }

  private evict(): void {
    if (this.total <= this.limitBytes) return;
    for (const [name, entry] of [...this.entries].sort((a, b) => a[1].used - b[1].used)) {
      if (this.total <= this.limitBytes * 0.9) break;
      try {
        unlinkSync(join(this.dir, name));
      } catch {
        // Already gone; just forget it.
      }
      this.entries.delete(name);
      this.total -= entry.bytes;
    }
  }

  get size(): number {
    return this.total;
  }
}
