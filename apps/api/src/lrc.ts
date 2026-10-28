import type { LyricLine } from "@lodesong/shared/lyrics";

const STAMP = /\[(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g;
const WORD = /<(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?>/g;
const LAST_LINE_MS = 5000;

function ms(minutes: string, seconds: string, fraction = "0"): number {
  // ".5" is 500 ms, ".05" 50 ms, ".005" 5 ms.
  return Number(minutes) * 60_000 + Number(seconds) * 1000 + Number(fraction.padEnd(3, "0").slice(0, 3));
}

/** `[offset:]` positive means earlier; blank lines are kept (they're the pauses). */
export function parseLrc(source: string): { lines: LyricLine[]; offset: number } {
  const text = source.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const offset = Number(/^\[offset:\s*([+-]?\d+)\s*\]/im.exec(text)?.[1] ?? 0);
  const lines: { start: number; text: string; words?: { start: number; text: string }[] }[] = [];
  for (const raw of text.split("\n")) {
    const stamps = [...raw.matchAll(STAMP)];
    if (!stamps.length) continue;
    const body = raw.replace(STAMP, "").trim();
    const wordStamps = [...body.matchAll(WORD)];
    const words = wordStamps.length
      ? wordStamps
          .map((match, index) => ({
            start: ms(match[1] as string, match[2] as string, match[3]) - offset,
            text: body.slice((match.index ?? 0) + match[0].length, wordStamps[index + 1]?.index ?? body.length).trim(),
          }))
          .filter((word) => word.text)
      : undefined;
    const plain = body.replace(WORD, "").replace(/\s+/g, " ").trim();
    for (const stamp of stamps)
      lines.push({
        start: Math.max(0, ms(stamp[1] as string, stamp[2] as string, stamp[3]) - offset),
        text: plain,
        ...(words ? { words } : {}),
      });
  }
  lines.sort((a, b) => a.start - b.start);
  return {
    offset,
    lines: lines.map((line, index) => ({ ...line, end: lines[index + 1]?.start ?? line.start + LAST_LINE_MS })),
  };
}

export function parsePlain(source: string): LyricLine[] {
  return source
    .replace(/^﻿/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((text) => ({ start: 0, end: 0, text: text.trim() }));
}
