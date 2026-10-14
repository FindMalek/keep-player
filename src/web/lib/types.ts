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
  track?: number;
  discNumber?: number;
  year?: number;
  genre?: string;
  coverArt?: string;
  duration?: number;
  bitRate?: number;
  suffix?: string;
  size?: number;
  starred?: string;
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
  song?: Song[];
}

export interface Artist {
  id: string;
  name: string;
  albumCount?: number;
  coverArt?: string;
  artistImageUrl?: string;
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

export interface LyricLine {
  start?: number;
  value: string;
}

export interface StructuredLyrics {
  synced: boolean;
  line: LyricLine[];
}
