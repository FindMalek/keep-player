import { mkdir, stat } from "node:fs/promises";
import { dirname, extname, join, normalize } from "node:path";

const ALLOWED = new Set([
  ".flac",
  ".mp3",
  ".m4a",
  ".aac",
  ".ogg",
  ".opus",
  ".wav",
  ".aiff",
  ".alac",
  ".wv",
  ".jpg",
  ".jpeg",
  ".png",
  ".lrc",
]);
export const MAX_UPLOAD_BYTES = 2 * 1024 ** 3;

/** Keeps the folders it came in but never leaves `dir`: no `..`, no absolute paths, no hidden files. */
export function uploadPath(dir: string, relative: string): string | null {
  const parts = normalize(relative.replaceAll("\\", "/"))
    .split("/")
    .filter((part) => part && part !== ".");
  if (!parts.length || parts.some((part) => part === ".." || part.startsWith("."))) return null;
  if (!ALLOWED.has(extname(parts.at(-1) ?? "").toLowerCase())) return null;
  return join(dir, ...parts);
}

/** Writes the body to `path` without replacing anything: "song.flac" exists → "song (2).flac". */
export async function saveUpload(path: string, body: Blob | ReadableStream<Uint8Array>): Promise<string> {
  await mkdir(dirname(path), { recursive: true });
  const extension = extname(path);
  let target = path;
  for (let n = 2; await exists(target); n++) target = `${path.slice(0, -extension.length)} (${n})${extension}`;
  await Bun.write(target, new Response(body));
  return target;
}

const exists = (path: string) =>
  stat(path).then(
    () => true,
    () => false,
  );
