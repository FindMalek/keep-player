import type { LyricsHit } from "../../shared/search";

/** The matched line with its matching words emphasized, between faint context lines. */
export function LyricsSnippet({ hit }: { hit: LyricsHit }) {
  const parts: { text: string; match: boolean }[] = [];
  let at = 0;
  for (const [from, to] of hit.highlights) {
    if (from > at) parts.push({ text: hit.text.slice(at, from), match: false });
    parts.push({ text: hit.text.slice(from, to), match: true });
    at = to;
  }
  parts.push({ text: hit.text.slice(at), match: false });
  return (
    <span className="flex min-w-0 flex-col text-xs leading-snug">
      {hit.before && <span className="truncate text-faint">{hit.before}</span>}
      <span className="truncate text-muted-foreground">
        {parts.map((part, index) =>
          part.match ? (
            // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
            <mark key={index} className="bg-transparent font-medium text-foreground">
              {part.text}
            </mark>
          ) : (
            part.text
          ),
        )}
      </span>
      {hit.after && <span className="truncate text-faint">{hit.after}</span>}
    </span>
  );
}
