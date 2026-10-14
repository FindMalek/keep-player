/**
 * Text as search compares it: lowercase, no accents, "&" = "and", no "feat./ft." credits, punctuation as spaces,
 * no leading "the". "Beyoncé" → "beyonce", "AC/DC" → "ac dc", "The Beatles" → "beatles", "Don't" → "dont".
 */
export function normalize(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\s*[([]?\b(?:feat|ft|featuring)\b\.?.*$/u, "")
    .replace(/['’`]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/^the\s+/, "");
}

/** Overlapping 3-letter pieces of the text with its spaces removed: what the typo-tolerant match compares. */
export function trigrams(text: string): Set<string> {
  const compact = ` ${normalize(text).replace(/\s+/g, "")} `;
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= compact.length; i += 1) grams.add(compact.slice(i, i + 3));
  return grams;
}

/** Share of the query's trigrams the candidate also has (0..1). */
export function similarity(query: string, candidate: string): number {
  const wanted = trigrams(query);
  if (!wanted.size) return 0;
  const have = trigrams(candidate);
  let shared = 0;
  for (const gram of wanted) if (have.has(gram)) shared += 1;
  return shared / wanted.size;
}
