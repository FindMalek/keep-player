import type { Database } from "bun:sqlite";
import type { DoctorAlbum, DoctorSong } from "../shared/doctor";

/** Every indexed song and album of a server, as the doctor's checks read them. */
export function libraryItems(db: Database, server: string): { songs: DoctorSong[]; albums: DoctorAlbum[] } {
  const read = <T>(kind: "song" | "album") =>
    db
      .query<{ data: string }, [string, string]>("select data from idx_items where server = ? and kind = ?")
      .all(server, kind)
      .map((row) => JSON.parse(row.data) as T);
  return { songs: read<DoctorSong>("song"), albums: read<DoctorAlbum>("album") };
}
