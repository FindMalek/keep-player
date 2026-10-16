/** How you want one song to behave (#62), kept per account on the server so it applies in every browser. */
export interface SongPref {
  id: string;
  /** The song as it was when you set this, so lists of hidden or skipped songs show without asking Navidrome. */
  song: ({ id: string } & Record<string, unknown>) | null;
  /** Start here, in seconds (skip an intro). */
  trimStart: number | null;
  /** Stop here, in seconds (cut a hidden track). */
  trimEnd: number | null;
  /** Never comes up in shuffle or radio. */
  never: boolean;
  /** Kept out of everything except its album's page. */
  hidden: boolean;
}

/** The same for an album. */
export interface AlbumPref {
  id: string;
  name: string;
  /** With shuffle on, the album stays one block, in order (concept albums, classical works, DJ mixes). */
  keepOrder: boolean;
  /** None of its songs come up in shuffle or radio. */
  never: boolean;
}

export interface Prefs {
  songs: SongPref[];
  albums: AlbumPref[];
}
