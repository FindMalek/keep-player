import type { DragEvent } from "react";
import { notify } from "./notify";
import type { MenuTarget } from "./targets";
import type { Song } from "./types";

/** The songs a drop stands for; the fetching code loads on the first drop (the sidebar is on the first screen). */
export const dropSongs = (target: MenuTarget): Promise<Song[]> => import("./targets").then((module) => module.songsOf(target));

/** A drop whose songs couldn't be loaded says so. */
export const dropFailed = () => notify({ kind: "error", message: "couldn't drop that, try again" });

/** `dragleave` also fires moving between a target's own children: true only when the pointer really left it. */
export const leftTarget = (event: { currentTarget: EventTarget; relatedTarget: EventTarget | null }) =>
  !(event.relatedTarget instanceof Node && event.currentTarget instanceof Node && event.currentTarget.contains(event.relatedTarget));

/*
 * Drag and drop with the browser's own events (they work with virtualized lists, where a library's rows come and go):
 * rows, cards and queue entries are drag sources; playlists in the sidebar, the queue panel and the player bar are drop
 * targets. What's being dragged lives here, in this tab; the custom type only marks the drag as ours.
 */
export const DRAG_TYPE = "application/x-keep-music";

interface Dragging {
  target: MenuTarget;
  /** Set when dragging within a list to reorder it: which list, and from where (a position, or an entry's id). */
  reorder?: { list: string; index: number; key?: string };
}

let dragging: Dragging | null = null;

const labelOf = (target: MenuTarget): string => {
  if (target.kind === "songs") return target.songs.length === 1 ? (target.songs[0]?.title ?? "1 song") : `${target.songs.length} songs`;
  if (target.kind === "album") return target.album.name;
  if (target.kind === "artist") return target.artist.name;
  return target.playlist.name;
};

/** Start dragging `target`, with a small label ("3 songs") as the drag image. */
export function startDrag(event: DragEvent, target: MenuTarget, reorder?: Dragging["reorder"]): void {
  dragging = { target, reorder };
  event.dataTransfer.effectAllowed = "copyMove";
  event.dataTransfer.setData(DRAG_TYPE, "1");
  // A link too, so dropping onto another app or the address bar does something sensible.
  if (target.kind === "album") event.dataTransfer.setData("text/uri-list", new URL(`/album/${target.album.id}`, location.origin).href);
  const ghost = document.createElement("div");
  ghost.textContent = labelOf(target);
  ghost.className = "fixed -top-96 left-0 border bg-popover px-2 py-1 font-mono text-popover-foreground text-xs";
  document.body.append(ghost);
  event.dataTransfer.setDragImage(ghost, 8, 8);
  requestAnimationFrame(() => ghost.remove());
}

export function endDrag(): void {
  dragging = null;
}

/** What's being dragged, if it's ours. */
export function current(event: DragEvent): Dragging | null {
  return event.dataTransfer.types.includes(DRAG_TYPE) ? dragging : null;
}

/**
 * Props for a drop target that takes songs. `active` lights it up while something of ours is over it. `accept` can
 * refuse a drag (a playlist dragged onto itself).
 */
export function dropTarget(
  onSongs: (songs: Song[]) => unknown,
  setActive: (active: boolean) => void,
  accept: (drag: Dragging) => boolean = () => true,
) {
  return {
    onDragOver: (event: DragEvent) => {
      const drag = current(event);
      if (!drag || !accept(drag)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setActive(true);
    },
    onDragLeave: (event: DragEvent) => {
      if (leftTarget(event)) setActive(false);
    },
    onDrop: (event: DragEvent) => {
      const drag = current(event);
      setActive(false);
      if (!drag || !accept(drag)) return;
      event.preventDefault();
      endDrag();
      void dropSongs(drag.target).then(onSongs).catch(dropFailed);
    },
  };
}
