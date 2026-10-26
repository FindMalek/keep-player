import { Button } from "@keep/ui/components/button";
import { Item, ItemContent, ItemMedia, ItemTitle } from "@keep/ui/components/item";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpIcon, FolderIcon } from "lucide-react";
import { Content, EmptyState, PageHeader, TrackList } from "@/components/library";
import { Link } from "@/components/link";
import { VirtualGrid } from "@/components/virtual-grid";
import { queries } from "@/lib/queries";
import { go } from "@/lib/router";
import type { Song } from "@/lib/types";

function FolderList({ folders }: { folders: { id: string; name: string }[] }) {
  return (
    <VirtualGrid
      className="mb-5"
      items={folders}
      getKey={(folder) => folder.id}
      min={260}
      gap={16}
      rowGap={2}
      estimateRow={() => 26}
      virtualizeFrom={200}
      actions={{ open: (folder) => go(`/folders/${folder.id}`) }}
      renderItem={(folder) => (
        <Item size="xs" className="h-6.5 px-1.5 py-0 text-body hover:bg-card" render={<Link href={`/folders/${folder.id}`} />}>
          <ItemMedia variant="icon" className="text-muted-foreground">
            <FolderIcon />
          </ItemMedia>
          <ItemContent>
            <ItemTitle className="truncate font-normal text-body">{folder.name}</ItemTitle>
          </ItemContent>
        </Item>
      )}
    />
  );
}

/** The library as it sits on disk: Artist / Album (Year) / tracks. */
export function FoldersPage({ id }: { id: string | null }) {
  const root = useQuery({ ...queries.folders(), enabled: !id });
  const directory = useQuery({ ...queries.directory(id ?? ""), enabled: Boolean(id) });

  if (!id) {
    const entries = (root.data ?? []).flatMap((group) => group.artist);
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

  const dir = directory.data;
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
        {songs.length > 0 && (
          <TrackList
            songs={songs}
            showAlbum={false}
            numbered="track"
            asAlbum
            source={dir ? { kind: "folder", name: dir.name, href: `/folders/${dir.id}` } : undefined}
          />
        )}
        {dir && folders.length === 0 && songs.length === 0 && <EmptyState>empty folder</EmptyState>}
      </Content>
    </>
  );
}
