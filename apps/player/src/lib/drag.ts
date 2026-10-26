import type { DragEvent } from "react";
import { notify } from "./notify";
import type { MenuTarget } from "./targets";
import type { Song } from "./types";

export const dropSongs = (target: MenuTarget): Promise<Song[]> => import("./targets").then((module) => module.songsOf(target));

export const dropFailed = () => notify({ kind: "error", message: "couldn't drop that, try again" });

/** `dragleave` also fires moving between a target's own children: true only when the pointer really left it. */
export const leftTarget = (event: { currentTarget: EventTarget; relatedTarget: EventTarget | null }) =>
  !(event.relatedTarget instanceof Node && event.currentTarget instanceof Node && event.currentTarget.contains(event.relatedTarget));

// Native drag events (they work with virtualized lists); what's dragged lives here, the custom type only marks it ours.
const DRAG_TYPE = "application/x-keep-music";

interface Dragging {
  target: MenuTarget;
  reorder?: { list: string; index: number; key?: string };
}

let dragging: Dragging | null = null;

const labelOf = (target: MenuTarget): string => {
  if (target.kind === "songs") return target.songs.length === 1 ? (target.songs[0]?.title ?? "1 song") : `${target.songs.length} songs`;
  if (target.kind === "album") return target.album.name;
  if (target.kind === "artist") return target.artist.name;
  return target.playlist.name;
};

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

export function current(event: DragEvent): Dragging | null {
  return event.dataTransfer.types.includes(DRAG_TYPE) ? dragging : null;
}

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
