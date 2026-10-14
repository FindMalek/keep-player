import { ArrowUpIcon, FolderIcon } from "lucide-react";
import { Content, EmptyState, PageHeader, TrackList } from "@/components/library";
import { Link } from "@/components/link";
import { Button } from "@/components/ui/button";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@/components/ui/item";
import { api } from "@/lib/subsonic";
import type { Directory, Song } from "@/lib/types";
import { useQuery } from "@/lib/use-query";

interface IndexEntry {
  name: string;
  artist: { id: string; name: string }[];
}

function FolderList({ folders }: { folders: { id: string; name: string }[] }) {
  return (
    <div className="mb-5 grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-x-4 gap-y-0.5">
      {folders.map((folder) => (
        <Item
          key={folder.id}
          size="xs"
          className="h-[26px] px-1.5 py-0 text-[13px] hover:bg-card"
          render={<Link href={`/folders/${folder.id}`} />}
        >
          <ItemMedia variant="icon" className="text-muted-foreground">
            <FolderIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="truncate font-normal text-[13px]">{folder.name}</ItemTitle>
          </ItemContent>
        </Item>
      ))}
    </div>
  );
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
        <Content>
          {root.data && entries.length === 0 && <EmptyState>empty</EmptyState>}
          <FolderList folders={entries} />
        </Content>
      </>
    );
  }

  const dir = directory.data?.directory;
  const folders = (dir?.child ?? []).filter((child) => child.isDir).map((child) => ({ id: child.id, name: child.title }));
  const songs: Song[] = (dir?.child ?? []).filter((child) => !child.isDir);

  return (
    <>
      <PageHeader title={dir?.name ?? "…"} meta="folder">
        {dir?.parent && (
          <Button variant="outline" render={<Link href={`/folders/${dir.parent}`} />}>
            <ArrowUpIcon /> up
          </Button>
        )}
      </PageHeader>
      <Content>
        {folders.length > 0 && <FolderList folders={folders} />}
        {songs.length > 0 && <TrackList songs={songs} showAlbum={false} numbered="track" asAlbum />}
        {dir && folders.length === 0 && songs.length === 0 && <EmptyState>empty folder</EmptyState>}
      </Content>
    </>
  );
}
