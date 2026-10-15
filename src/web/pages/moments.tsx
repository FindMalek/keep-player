import { useQuery } from "@tanstack/react-query";
import { LinkIcon, PlayIcon, Trash2Icon } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Cover } from "@/components/cover";
import { EditableText } from "@/components/editable-text";
import { Hint } from "@/components/hint";
import { Content, EmptyState, PageHeader, Section } from "@/components/library";
import { Link } from "@/components/link";
import { TrackListSkeleton } from "@/components/skeletons";
import { Button } from "@/components/ui/button";
import { clock, plural } from "@/lib/format";
import { deleteMoment, momentLink, momentsQuery, playReel, setMomentNote } from "@/lib/moments";
import { notify } from "@/lib/notify";
import { player } from "@/lib/player";
import { replace } from "@/lib/router";
import { api } from "@/lib/subsonic";
import type { Song } from "@/lib/types";
import type { Moment } from "../../shared/moments";

function MomentRow({ moment }: { moment: Moment }) {
  const song = moment.song as unknown as Song;
  return (
    <li className="group flex items-center gap-3 border-b py-1.5 last:border-b-0">
      <Hint label={`play from ${clock(moment.at)}`}>
        <Button
          variant="ghost"
          size="xs"
          className="w-14 justify-start font-mono tabular-nums"
          aria-label={`play ${song.title} from ${clock(moment.at)}`}
          onClick={() =>
            player.play([song], 0, { startAt: moment.at, source: { kind: "moments", name: "your moments", href: "/moments" } })
          }
        >
          <PlayIcon />
          {clock(moment.at)}
        </Button>
      </Hint>
      <div className="min-w-0 flex-1">
        <EditableText
          value={moment.note}
          editable
          label={`note for the moment at ${clock(moment.at)}`}
          placeholder="add a note"
          className="text-sm"
          onSave={(note) => void setMomentNote(moment.id, note)}
        />
      </div>
      <div className="flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
        <Hint label="copy a link to this moment">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label="copy link"
            onClick={() =>
              void navigator.clipboard.writeText(momentLink(song.id, moment.at)).then(
                () => notify({ message: "link copied" }),
                () => notify({ kind: "error", message: "couldn't copy the link" }),
              )
            }
          >
            <LinkIcon />
          </Button>
        </Hint>
        <Hint label="delete this moment">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`delete the moment at ${clock(moment.at)}`}
            onClick={() => void deleteMoment(moment.id)}
          >
            <Trash2Icon />
          </Button>
        </Hint>
      </div>
    </li>
  );
}

/** `g m`: every moment you saved, by song, newest song first; play them all as a highlight reel. */
export function MomentsPage() {
  const { data, isPending, isError } = useQuery(momentsQuery());
  // One group per song, in the order you last added to it; moments inside in time order.
  const songs = useMemo(() => {
    const groups = new Map<string, Moment[]>();
    for (const moment of data ?? []) groups.set(moment.song.id, [...(groups.get(moment.song.id) ?? []), moment]);
    return [...groups.values()].map((moments) => moments.sort((a, b) => a.at - b.at));
  }, [data]);
  const reel = useMemo(() => songs.flat(), [songs]);

  return (
    <>
      <PageHeader title="moments" meta={data ? `${plural(data.length, "moment")} in ${plural(songs.length, "song")}` : undefined}>
        <Button variant="outline" size="sm" disabled={!reel.length} onClick={() => playReel(reel)}>
          <PlayIcon />
          play the highlight reel
        </Button>
      </PageHeader>
      <Content>
        {isError ? (
          <EmptyState>couldn't load your moments</EmptyState>
        ) : isPending ? (
          <TrackListSkeleton count={6} />
        ) : songs.length === 0 ? (
          <EmptyState>press b while a song plays to save the moment · each one plays 30 s in the highlight reel</EmptyState>
        ) : null}
      </Content>
      {songs.map((moments) => {
        const song = (moments[0] as Moment).song as unknown as Song;
        return (
          <Section key={song.id} title={`${song.title}${song.artist ? ` · ${song.artist}` : ""}`}>
            <div className="flex gap-4">
              <Link
                href={song.albumId ? `/album/${encodeURIComponent(song.albumId)}` : "/moments"}
                className="shrink-0"
                aria-label={song.album ?? song.title}
              >
                <Cover id={song.coverArt} size={48} alt="" />
              </Link>
              <ul className="min-w-0 flex-1">
                {moments.map((moment) => (
                  <MomentRow key={moment.id} moment={moment} />
                ))}
              </ul>
            </div>
          </Section>
        );
      })}
    </>
  );
}

/** `/song/:id?t=151`: plays the song from 2:31 and shows its album. */
export function SongLink({ id }: { id: string }) {
  useEffect(() => {
    const t = Number(new URLSearchParams(location.search).get("t")) || 0;
    let cancelled = false;
    void api<{ song: Song }>("getSong", { id })
      .then(({ song }) => {
        if (cancelled) return;
        player.play([song], 0, { startAt: Math.max(0, t), source: { kind: "link", name: "a shared link", href: `/song/${id}` } });
        replace(song.albumId ? `/album/${encodeURIComponent(song.albumId)}` : "/");
      })
      .catch(() => {
        if (!cancelled) notify({ kind: "error", message: "couldn't find that song" });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);
  return <TrackListSkeleton count={8} />;
}
