/** "Beyoncé" → "beyonce", "AC/DC" → "ac dc", "The Beatles" → "beatles", "Don't" → "dont". */
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

export function trigrams(text: string): Set<string> {
  const compact = ` ${normalize(text).replace(/\s+/g, "")} `;
  const grams = new Set<string>();
  for (let i = 0; i + 3 <= compact.length; i += 1) grams.add(compact.slice(i, i + 3));
  return grams;
}

export function similarity(query: string, candidate: string): number {
  const wanted = trigrams(query);
  if (!wanted.size) return 0;
  const have = trigrams(candidate);
  let shared = 0;
  for (const gram of wanted) if (have.has(gram)) shared += 1;
  return shared / wanted.size;
}

/** Edits (insert, delete, substitute, swap two neighbours) from `a` to `b`, or `max + 1` once it is clearly more. */
export function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let before: number[] = [];
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let smallest = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let value = Math.min((previous[j] ?? 0) + 1, (row[j - 1] ?? 0) + 1, (previous[j - 1] ?? 0) + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) value = Math.min(value, (before[j - 2] ?? 0) + 1);
      row.push(value);
      smallest = Math.min(smallest, value);
    }
    if (smallest > max) return max + 1;
    before = previous;
    previous = row;
  }
  return Math.min(previous[b.length] ?? max + 1, max + 1);
}
