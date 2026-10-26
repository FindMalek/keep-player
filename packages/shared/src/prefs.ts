export interface SongPref {
  id: string;
  /** The song as it was when you set this, so lists of hidden or skipped songs show without asking Navidrome. */
  song: ({ id: string } & Record<string, unknown>) | null;
  trimStart: number | null;
  trimEnd: number | null;
  never: boolean;
  /** Kept out of everything except its album's page. */
  hidden: boolean;
}

export interface AlbumPref {
  id: string;
  name: string;
  /** With shuffle on, the album stays one block, in order (concept albums, classical works, DJ mixes). */
  keepOrder: boolean;
  never: boolean;
}

export interface Prefs {
  songs: SongPref[];
  albums: AlbumPref[];
}
