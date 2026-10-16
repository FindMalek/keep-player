import { clock } from "@/lib/format";
import { useSongMoments } from "@/lib/moments";
import { player } from "@/lib/player";
import { Hint } from "./hint";

/** Your moments in this song as ticks over the seek bar; hover for the note, click to jump there. */
export function MomentTicks({ songId, duration }: { songId: string | undefined; duration: number }) {
  const moments = useSongMoments(songId);
  if (!moments.length || !duration) return null;
  return (
    <fieldset aria-label="moments" className="pointer-events-none absolute inset-x-0 -top-1.5 m-0 h-1.5 min-w-0 border-0 p-0">
      {moments.map((moment) => (
        <Hint key={moment.id} label={moment.note ? `${clock(moment.at)} · ${moment.note}` : clock(moment.at)}>
          <button
            type="button"
            aria-label={`moment at ${clock(moment.at)}${moment.note ? `: ${moment.note}` : ""}`}
            onClick={() => player.seek(moment.at)}
            className="pointer-events-auto absolute top-0 h-1.5 w-0.5 -translate-x-1/2 bg-foreground/70 hover:bg-foreground"
            style={{ left: `${Math.min(100, (moment.at / duration) * 100)}%` }}
          />
        </Hint>
      ))}
    </fieldset>
  );
}
