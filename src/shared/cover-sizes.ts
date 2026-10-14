/** Every cover request snaps up to one of these, so each cover is cached in a handful of sizes, not hundreds. */
export const COVER_SIZES = [64, 128, 256, 512, 1024] as const;

export function snapCoverSize(requested: number): number {
  return COVER_SIZES.find((size) => size >= requested) ?? 1024;
}
