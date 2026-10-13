import { Folder } from "../components/icons";
import { Empty, PageHeader, TrackList } from "../components/library";
import { navigate } from "../lib/router";
import { api } from "../lib/subsonic";
import type { Directory, Song } from "../lib/types";
import { useQuery } from "../lib/use-query";

interface IndexEntry {
  name: string;
  artist: { id: string; name: string }[];
}

/** The library as it sits on disk: Artist / Album (Year) / tracks. */
export function FoldersPage({ id }: { id: string | null }) {
  const root = useQuery(id ? null : "folders:root", () => api<{ indexes: { index?: IndexEntry[] } }>("getIndexes"));
  const directory = useQuery(id ? `folder:${id}` : null, () => api<{ directory: Directory }>("getMusicDirectory", { id: id ?? "" }));

  if (!id) {
    const entries = (root.data?.indexes.index ?? []).flatMap((group) => group.artist);
    return (
      <>
        <PageHeader title="folders" meta="/music" />
        <div className="content">
          {root.data && entries.length === 0 && <Empty>empty</Empty>}
          <ul className="folder-list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <a href={`/folders/${entry.id}`} onClick={navigate}>
                  <Folder />
                  {entry.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      </>
    );
  }

  const dir = directory.data?.directory;
  const folders = (dir?.child ?? []).filter((child) => child.isDir);
  const songs: Song[] = (dir?.child ?? []).filter((child) => !child.isDir);

  return (
    <>
      <PageHeader title={dir?.name ?? "…"} meta="folder">
        {dir?.parent && (
          <a className="button" href={`/folders/${dir.parent}`} onClick={navigate}>
            up
          </a>
        )}
      </PageHeader>
      <div className="content">
        {folders.length > 0 && (
          <ul className="folder-list">
            {folders.map((folder) => (
              <li key={folder.id}>
                <a href={`/folders/${folder.id}`} onClick={navigate}>
                  <Folder />
                  {folder.title}
                </a>
              </li>
            ))}
          </ul>
        )}
        {songs.length > 0 && <TrackList songs={songs} showAlbum={false} numbered="track" asAlbum />}
        {dir && folders.length === 0 && songs.length === 0 && <Empty>empty folder</Empty>}
      </div>
    </>
  );
}
