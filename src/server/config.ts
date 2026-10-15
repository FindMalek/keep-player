import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readConfig } from "./settings";

export type { Upstream } from "./settings";

const { config: parsed, errors } = readConfig(process.env);
if (errors.length) {
  console.error(
    `keep-player: can't start, fix the configuration (see docs/configuration.md):\n${errors.map((error) => `  - ${error}`).join("\n")}`,
  );
  process.exit(1);
}

mkdirSync(parsed.dataDir, { recursive: true });

/** `SESSION_SECRET`, or a random one generated once and kept in the data dir (so one env var is enough to start). */
function sessionSecret(): string {
  if (parsed.sessionSecret) return parsed.sessionSecret;
  const path = join(parsed.dataDir, "session.secret");
  if (!existsSync(path)) {
    writeFileSync(path, crypto.getRandomValues(new Uint8Array(32)).toHex());
    chmodSync(path, 0o600);
  }
  return readFileSync(path, "utf8").trim();
}

export const config = { ...parsed, sessionSecret: sessionSecret() };
