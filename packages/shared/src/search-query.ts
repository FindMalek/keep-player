export interface ParsedQuery {
  text: string;
  /** `lyrics: words`: only lyrics, everything after the colon is the phrase. */
  lyricsOnly: boolean;
  filters: Filters;
  chips: Chip[];
  /** "a - b" or "title by artist": a title and an artist, in either order for the dash. */
  pairs: { title: string; artist: string }[];
}

export interface Filters {
  artist?: string;
  album?: string;
  genre?: string;
  year?: [number, number];
  format?: string;
  liked?: boolean;
  unplayed?: boolean;
  moment?: string;
  bpm?: [number, number];
  energy?: [number, number];
  mood?: string;
}

export interface Chip {
  key: string;
  value: string;
  /** The exact text in the query, so removing the chip removes just that. */
  raw: string;
}

const OPERATOR = /(?:^|\s)(artist|album|genre|year|format|is|moment|bpm|energy|mood):("[^"]*"|\S+)/gi;

function year(value: string): [number, number] | undefined {
  const range = /^(\d{4})?\.\.(\d{4})?$/.exec(value);
  if (range) return [Number(range[1] ?? 0), Number(range[2] ?? 9999)];
  return /^\d{4}$/.test(value) ? [Number(value), Number(value)] : undefined;
}

const LEVELS: Record<string, [number, number]> = { low: [0, 0.4], mid: [0.4, 0.7], high: [0.7, 1] };

function span(value: string, levels = false): [number, number] | undefined {
  const level = levels ? LEVELS[value.toLowerCase()] : undefined;
  if (level) return level;
  const range = /^(\d+(?:\.\d+)?)?\.\.(\d+(?:\.\d+)?)?$/.exec(value);
  if (range) return [Number(range[1] ?? 0), Number(range[2] ?? Number.POSITIVE_INFINITY)];
  return /^\d+(?:\.\d+)?$/.test(value) ? [Number(value), Number(value)] : undefined;
}

export function parseQuery(raw: string): ParsedQuery {
  const lyrics = /^\s*lyrics:\s*/i.exec(raw);
  if (lyrics) return { text: raw.slice(lyrics[0].length).trim(), lyricsOnly: true, filters: {}, chips: [], pairs: [] };
  const filters: Filters = {};
  const chips: Chip[] = [];
  const text = raw
    .replace(OPERATOR, (match, rawKey: string, rawValue: string) => {
      const key = rawKey.toLowerCase();
      const value = rawValue.replace(/^"|"$/g, "").trim();
      if (!value) return match;
      if (key === "year") {
        const range = year(value);
        if (!range) return match;
        filters.year = range;
      } else if (key === "bpm" || key === "energy") {
        const range = span(value, key === "energy");
        if (!range) return match;
        filters[key] = range;
      } else if (key === "is") {
        if (value === "liked") filters.liked = true;
        else if (value === "unplayed") filters.unplayed = true;
        else if (value === "moment") filters.moment = "";
        else return match;
      } else if (key === "format") filters.format = value.toLowerCase();
      else if (key === "moment") filters.moment = value;
      else if (key === "mood") filters.mood = value.toLowerCase();
      else filters[key as "artist" | "album" | "genre"] = value;
      chips.push({ key, value, raw: match.trim() });
      return " ";
    })
    .replace(/\s+/g, " ")
    .trim();

  const pairs: ParsedQuery["pairs"] = [];
  const dash = /^(.+?)\s+[-–—]\s+(.+)$/.exec(text);
  if (dash?.[1] && dash[2]) pairs.push({ artist: dash[1], title: dash[2] }, { artist: dash[2], title: dash[1] });
  const by = /^(.+?)\s+by\s+(.+)$/i.exec(text);
  if (by?.[1] && by[2]) pairs.push({ title: by[1], artist: by[2] });
  return { text, lyricsOnly: false, filters, chips, pairs };
}
