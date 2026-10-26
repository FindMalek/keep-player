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
  best: Candidate | null;
  alternatives: Candidate[];
}

export type Bucket = "matched" | "review" | "missing";

export const MATCHED_FROM = 0.85;
export const REVIEW_FROM = 0.55;

export function bucketOf(confidence: number): Bucket {
  return confidence >= MATCHED_FROM ? "matched" : confidence >= REVIEW_FROM ? "review" : "missing";
}
