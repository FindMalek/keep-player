export interface ReplayGain {
  trackGain?: number;
  albumGain?: number;
  trackPeak?: number;
  albumPeak?: number;
}

export interface Song {
  id: string;
  title: string;
  album?: string;
  albumId?: string;
  artist?: string;
  artistId?: string;
  /** The folder the file sits in (Subsonic directory id), for "show in folder". */
  parent?: string;
  track?: number;
  discNumber?: number;
  year?: number;
  genre?: string;
  coverArt?: string;
  duration?: number;
  bitRate?: number;
  /** OpenSubsonic: bits per sample and sampling rate in Hz (lossless files mostly). */
  bitDepth?: number;
  samplingRate?: number;
  suffix?: string;
  size?: number;
  starred?: string;
  userRating?: number;
  playCount?: number;
  replayGain?: ReplayGain;
}

export interface Album {
  id: string;
  name: string;
  artist?: string;
  artistId?: string;
  coverArt?: string;
  songCount?: number;
  duration?: number;
  year?: number;
  genre?: string;
  genres?: { name: string }[];
  created?: string;
  playCount?: number;
  starred?: string;
  recordLabels?: { name: string }[];
  musicBrainzId?: string;
  /** OpenSubsonic: "album", "ep", "single", "live", "compilation"… (lowercase, any number). */
  releaseTypes?: string[];
  isCompilation?: boolean;
  song?: Song[];
}

export interface Artist {
  id: string;
  name: string;
  albumCount?: number;
  coverArt?: string;
  artistImageUrl?: string;
  starred?: string;
  album?: Album[];
}

export interface ArtistInfo {
  biography?: string;
  largeImageUrl?: string;
  similarArtist?: Artist[];
}

export interface Playlist {
  id: string;
  name: string;
  public?: boolean;
  /** Smart playlists (Navidrome `.nsp` rules) can't be edited through Subsonic. */
  readonly?: boolean;
  songCount: number;
  duration: number;
  owner?: string;
  comment?: string;
  coverArt?: string;
  changed?: string;
  entry?: Song[];
}

export interface Genre {
  value: string;
  songCount: number;
  albumCount: number;
}

export interface DirectoryChild extends Song {
  isDir: boolean;
  parent?: string;
}

export interface Directory {
  id: string;
  name: string;
  parent?: string;
  child?: DirectoryChild[];
}
