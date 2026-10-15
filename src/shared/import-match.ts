/* What the import's matcher answers with, and how a confidence becomes matched / review / missing (#48). */

export interface Candidate {
  id: string;
  title: string;
  artist: string;
  album?: string;
  coverArt?: string;
  /** Seconds. */
  duration?: number;
  /** 0..1 */
  confidence: number;
}

export interface ImportMatch {
  /** The best candidate, or null when nothing in the library comes close. */
  best: Candidate | null;
  /** Other plausible songs, best first, for fixing a wrong match. */
  alternatives: Candidate[];
}

export type Bucket = "matched" | "review" | "missing";

export const MATCHED_FROM = 0.85;
export const REVIEW_FROM = 0.55;

export function bucketOf(confidence: number): Bucket {
  return confidence >= MATCHED_FROM ? "matched" : confidence >= REVIEW_FROM ? "review" : "missing";
}
