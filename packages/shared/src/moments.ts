/** A saved point in a song (#61): "the drop" at 2:31. Per user, as many per song as you like. */
export interface Moment {
  id: number;
  song: { id: string; title?: string; artist?: string; album?: string; albumId?: string; coverArt?: string; duration?: number } & Record<
    string,
    unknown
  >;
  /** Seconds into the song. */
  at: number;
  note: string;
  created: number;
}
