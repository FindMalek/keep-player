/** One embedded web file, with its precompressed variants. */
export interface Asset {
  path: string;
  type: string;
  br?: string;
  gzip?: string;
}
