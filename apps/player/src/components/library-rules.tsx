import { Button } from "@keep/ui/components/button";
import { BanIcon, EyeOffIcon, ScissorsIcon } from "lucide-react";
import type { ReactNode } from "react";
import { clock } from "@/lib/format";
import { allPrefs, usePrefsVersion } from "@/lib/prefs";
import { changeAlbum, changeSong } from "@/lib/prefs-edit";
import type { Song } from "@/lib/types";

/** Settings → library: every rule you set on a song or album (#62), each with the button that undoes it. */
export function LibraryRules() {
  usePrefsVersion();
  const { songs, albums } = allPrefs();
  const known = (pref: (typeof songs)[number]) => (pref.song ?? { id: pref.id, title: pref.id }) as unknown as Song;
  const rows: { key: string; icon: ReactNode; text: string; detail: string; action: string; run: () => void }[] = [
    ...songs.flatMap((pref) => {
      const song = known(pref);
      const name = `${song.title}${song.artist ? ` · ${song.artist}` : ""}`;
      return [
        ...(pref.hidden
          ? [
              {
                key: `h-${pref.id}`,
                icon: <EyeOffIcon className="size-3.5" />,
                text: name,
                detail: "hidden: shows only on its album",
                action: "unhide",
                run: () => void changeSong(song, { hidden: false }, `${song.title} is back everywhere`),
              },
            ]
          : []),
        ...(pref.never
          ? [
              {
                key: `n-${pref.id}`,
                icon: <BanIcon className="size-3.5" />,
                text: name,
                detail: "never in shuffle or radio",
                action: "allow",
                run: () => void changeSong(song, { never: false }, `${song.title} can come up in shuffle and radio again`),
              },
            ]
          : []),
        ...(pref.trimStart !== null || pref.trimEnd !== null
          ? [
              {
                key: `t-${pref.id}`,
                icon: <ScissorsIcon className="size-3.5" />,
                text: name,
                detail: `plays ${clock(pref.trimStart ?? 0)} – ${pref.trimEnd !== null ? clock(pref.trimEnd) : "end"}`,
                action: "clear trim",
                run: () => void changeSong(song, { trimStart: null, trimEnd: null }, `cleared the trim on ${song.title}`),
              },
            ]
          : []),
      ];
    }),
    ...albums.flatMap((pref) => [
      ...(pref.keepOrder
        ? [
            {
              key: `k-${pref.id}`,
              icon: <ScissorsIcon className="size-3.5 opacity-0" />,
              text: pref.name || pref.id,
              detail: "stays in order when shuffled",
              action: "shuffle song by song",
              run: () => void changeAlbum(pref, { keepOrder: false }, `${pref.name} shuffles song by song again`),
            },
          ]
        : []),
      ...(pref.never
        ? [
            {
              key: `an-${pref.id}`,
              icon: <BanIcon className="size-3.5" />,
              text: pref.name || pref.id,
              detail: "album: never in shuffle or radio",
              action: "allow",
              run: () => void changeAlbum(pref, { never: false }, `${pref.name} can come up in shuffle and radio again`),
            },
          ]
        : []),
    ]),
  ];
  if (!rows.length)
    return (
      <p className="py-3 text-muted-foreground text-xs">
        nothing set. right-click a song or album to trim it, keep it in order, hide it, or keep it out of shuffle and radio.
      </p>
    );
  return (
    <ul aria-label="library rules">
      {rows.map((row) => (
        <li key={row.key} className="flex items-center gap-3 border-b py-2 text-sm last:border-b-0">
          <span className="text-muted-foreground">{row.icon}</span>
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">{row.text}</span>
            <span className="font-mono text-muted-foreground text-xs">{row.detail}</span>
          </div>
          <Button variant="outline" size="xs" onClick={row.run}>
            {row.action}
          </Button>
        </li>
      ))}
    </ul>
  );
}
