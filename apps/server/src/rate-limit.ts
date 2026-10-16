/**
 * Login backoff: three free failures, then each one doubles the wait (1 s, 2 s, 4 s … up to 15 min). Kept per IP and
 * per user, so guessing one account and spraying many both slow down. In memory: one instance, restarts reset it.
 */
export class LoginLimiter {
  private readonly failures = new Map<string, { count: number; until: number }>();

  constructor(
    private readonly free = 3,
    private readonly maxMs = 15 * 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Seconds until any of these keys may try again, or 0. */
  retryAfter(keys: string[]): number {
    const time = this.now();
    const until = Math.max(0, ...keys.map((key) => this.failures.get(key)?.until ?? 0));
    return until > time ? Math.ceil((until - time) / 1000) : 0;
  }

  fail(keys: string[]): void {
    for (const key of keys) {
      const count = (this.failures.get(key)?.count ?? 0) + 1;
      const wait = count > this.free ? Math.min(1000 * 2 ** (count - this.free - 1), this.maxMs) : 0;
      this.failures.set(key, { count, until: this.now() + wait });
    }
  }

  succeed(keys: string[]): void {
    for (const key of keys) this.failures.delete(key);
  }
}
