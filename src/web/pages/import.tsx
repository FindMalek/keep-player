import { useQuery } from "@tanstack/react-query";
import { DownloadIcon, SearchIcon, UploadIcon } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { Content, EmptyState, PageHeader, Section } from "@/components/library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { plural } from "@/lib/format";
import { buildPlan, counts, type ImportRow, missingTracks, pick, rowBucket, toRow, trackKey } from "@/lib/import-plan";
import { notify } from "@/lib/notify";
import { queries, queryClient } from "@/lib/queries";
import { api, HEADERS } from "@/lib/subsonic";
import type { Bucket, Candidate, ImportMatch } from "../../shared/import-match";
import type { SearchResults } from "../../shared/search";
import { dedupe, type ImportSet, type ImportTrack, missingCsv, parseExport } from "../../shared/spotify-import";

const BATCH = 100;

/** Every distinct track of the export, playlists and liked songs together. */
const allTracks = (set: ImportSet): ImportTrack[] => dedupe([...set.playlists.flatMap((playlist) => playlist.tracks), ...set.liked]);

async function matchBatch(tracks: ImportTrack[]): Promise<ImportMatch[]> {
  const response = await fetch("/api/import/match", {
    method: "POST",
    headers: { ...HEADERS, "content-type": "application/json" },
    body: JSON.stringify({ tracks }),
  });
  if (!response.ok) throw new Error(`match: ${response.status}`);
  return ((await response.json()) as { matches: ImportMatch[] }).matches;
}

async function searchSongs(text: string): Promise<Candidate[]> {
  const response = await fetch(`/api/search?${new URLSearchParams({ q: text, limit: "6" })}`, { headers: HEADERS });
  if (!response.ok) return [];
  const { songs } = (await response.json()) as SearchResults;
  return songs.map((song) => ({
    id: String(song.id),
    title: String(song.title ?? ""),
    artist: String(song.artist ?? ""),
    ...(song.album ? { album: String(song.album) } : {}),
    confidence: 1,
  }));
}

function download(name: string, body: string): void {
  const url = URL.createObjectURL(new Blob([body], { type: "text/csv" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: name });
  link.click();
  URL.revokeObjectURL(url);
}

/** One song to choose from: a button with its title and artist. */
function Choice({ song, onPick }: { song: Candidate; onPick: (song: Candidate) => void }) {
  return (
    <Button variant="outline" size="xs" className="max-w-full justify-start font-normal" onClick={() => onPick(song)}>
      <span className="truncate">
        {song.title} · {song.artist}
        {song.album ? ` · ${song.album}` : ""}
      </span>
    </Button>
  );
}

function ReviewRow({ row, onChange }: { row: ImportRow; onChange: (row: ImportRow) => void }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [found, setFound] = useState<Candidate[]>([]);
  const choose = (song: Candidate) => {
    onChange(pick(row, song));
    setOpen(false);
  };
  return (
    <TableRow className={row.skipped ? "opacity-50" : undefined}>
      <TableCell className="max-w-72 align-top">
        <div className="truncate">{row.track.title}</div>
        <div className="truncate text-muted-foreground text-xs">
          {row.track.artist}
          {row.track.album ? ` · ${row.track.album}` : ""}
        </div>
      </TableCell>
      <TableCell className="max-w-96 align-top">
        {row.choice ? (
          <>
            <div className="truncate">{row.choice.title}</div>
            <div className="truncate text-muted-foreground text-xs">
              {row.choice.artist}
              {row.choice.album ? ` · ${row.choice.album}` : ""}
            </div>
          </>
        ) : (
          <span className="text-muted-foreground">not in your library</span>
        )}
        {open && (
          <div className="mt-2 flex flex-col gap-1.5">
            <div className="flex gap-1.5">
              <Input
                aria-label={`search for ${row.track.title}`}
                className="h-7"
                placeholder="search your library"
                value={text}
                onChange={(event) => {
                  setText(event.target.value);
                  if (event.target.value.trim().length > 1) void searchSongs(event.target.value).then(setFound);
                  else setFound([]);
                }}
              />
            </div>
            {[...row.match.alternatives, ...found].slice(0, 8).map((song) => (
              <Choice key={song.id} song={song} onPick={choose} />
            ))}
          </div>
        )}
      </TableCell>
      <TableCell className="w-16 text-right align-top font-mono text-muted-foreground text-xs tabular-nums">
        {row.choice ? `${Math.round(row.choice.confidence * 100)}%` : ""}
      </TableCell>
      <TableCell className="w-44 align-top">
        <div className="flex justify-end gap-1.5">
          <Button size="xs" variant="outline" onClick={() => setOpen(!open)}>
            <SearchIcon /> change
          </Button>
          <Button
            size="xs"
            variant={row.skipped ? "default" : "outline"}
            aria-pressed={row.skipped}
            onClick={() => onChange({ ...row, skipped: !row.skipped })}
          >
            skip
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

/** Import from Spotify (#48): drop the export, check what matched, then make the playlists and stars. */
export function ImportPage() {
  const [set, setSet] = useState<ImportSet | null>(null);
  const [rows, setRows] = useState<Map<string, ImportRow>>(new Map());
  const [progress, setProgress] = useState<number | null>(null);
  const [bucket, setBucket] = useState<Bucket>("review");
  const [folder, setFolder] = useState("Spotify");
  const [working, setWorking] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const existing = useQuery(queries.playlists());

  const tally = useMemo(() => counts(rows.values()), [rows]);
  const shown = useMemo(() => [...rows.values()].filter((row) => (row.skipped ? false : rowBucket(row) === bucket)), [rows, bucket]);

  async function read(files: FileList | File[]): Promise<void> {
    const parsed: unknown[] = [];
    for (const file of files)
      try {
        parsed.push(JSON.parse(await file.text()));
      } catch {
        notify({ kind: "error", message: `${file.name} isn't JSON` });
      }
    const next = parseExport(parsed);
    setSet(next);
    setRows(new Map());
    setDone(null);
    if (!next.playlists.length && !next.liked.length) notify({ message: "no playlists or liked songs in those files" });
  }

  async function run(): Promise<void> {
    if (!set) return;
    const tracks = allTracks(set);
    const next = new Map<string, ImportRow>();
    setProgress(0);
    try {
      for (let start = 0; start < tracks.length; start += BATCH) {
        const batch = tracks.slice(start, start + BATCH);
        const matches = await matchBatch(batch);
        for (const [index, track] of batch.entries())
          next.set(trackKey(track), toRow(track, matches[index] ?? { best: null, alternatives: [] }));
        setProgress(Math.min(1, (start + BATCH) / tracks.length));
      }
      setRows(next);
      const found = counts(next.values());
      setBucket(found.review ? "review" : found.missing ? "missing" : "matched");
    } catch {
      notify({ kind: "error", message: "couldn't match the tracks, try again" });
    } finally {
      setProgress(null);
    }
  }

  async function create(): Promise<void> {
    if (!set) return;
    const plan = buildPlan(set, rows, folder);
    setWorking(true);
    try {
      const playlists = await queryClient.fetchQuery({ ...queries.playlists(), staleTime: 0 });
      let made = 0;
      for (const playlist of plan.playlists) {
        if (!playlist.songIds.length) continue;
        // Importing again rewrites the playlist it made last time instead of making a second one.
        const same = playlists.find((candidate) => candidate.name === playlist.name);
        await api(
          "createPlaylist",
          same ? { playlistId: same.id, songId: playlist.songIds } : { name: playlist.name, songId: playlist.songIds },
        );
        made += 1;
      }
      for (let start = 0; start < plan.liked.length; start += BATCH) await api("star", { id: plan.liked.slice(start, start + BATCH) });
      await queryClient.invalidateQueries({ queryKey: queries.playlists().queryKey });
      await queryClient.invalidateQueries({ queryKey: ["starred"] });
      setDone(`${plural(made, "playlist")} and ${plural(plan.liked.length, "liked song")} are in your library`);
    } catch {
      notify({ kind: "error", message: "couldn't finish the import, run it again to pick up where it stopped" });
    } finally {
      setWorking(false);
    }
  }

  const matched = rows.size > 0;
  return (
    <>
      <PageHeader
        title="import from spotify"
        meta={set ? `${plural(set.playlists.length, "playlist")} · ${plural(set.liked.length, "liked song")}` : undefined}
      />
      <Content>
        <input
          ref={input}
          type="file"
          accept="application/json,.json"
          multiple
          className="sr-only"
          aria-label="spotify export files"
          onChange={(event) => event.target.files && void read(event.target.files)}
        />
        <button
          type="button"
          className="mb-4 flex w-full max-w-2xl flex-col items-center gap-2 border border-dashed px-6 py-8 text-center text-muted-foreground text-sm hover:bg-card"
          onClick={() => input.current?.click()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            void read(event.dataTransfer.files);
          }}
        >
          <UploadIcon />
          <span>drop your Spotify export here, or click to choose files</span>
          <span className="text-xs">Playlist1.json and YourLibrary.json from “download your data”</span>
        </button>

        {set && !matched && (
          <div className="flex max-w-2xl flex-col gap-3">
            {set.playlists.length === 0 && set.liked.length === 0 ? (
              <EmptyState>nothing to import in those files</EmptyState>
            ) : (
              <>
                <p className="text-sm">{plural(allTracks(set).length, "distinct track")} to look for in your library.</p>
                <div className="flex items-center gap-3">
                  <Button onClick={() => void run()} disabled={progress !== null}>
                    match with my library
                  </Button>
                  {progress !== null && <Progress value={progress * 100} className="w-48" aria-label="matching" />}
                </div>
              </>
            )}
          </div>
        )}

        {matched && set && (
          <>
            <Section title="review">
              <ToggleGroup
                variant="outline"
                size="sm"
                aria-label="group"
                value={[bucket]}
                onValueChange={(value: string[]) => value[0] && setBucket(value[0] as Bucket)}
                className="mb-3"
              >
                <ToggleGroupItem value="matched" className="font-mono font-normal">
                  matched {tally.matched}
                </ToggleGroupItem>
                <ToggleGroupItem value="review" className="font-mono font-normal">
                  review {tally.review}
                </ToggleGroupItem>
                <ToggleGroupItem value="missing" className="font-mono font-normal">
                  missing {tally.missing}
                </ToggleGroupItem>
              </ToggleGroup>
              {tally.skipped > 0 && <span className="ml-3 font-mono text-muted-foreground text-xs">{tally.skipped} skipped</span>}
              {shown.length === 0 ? (
                <EmptyState>nothing in this group</EmptyState>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>on spotify</TableHead>
                      <TableHead>in your library</TableHead>
                      <TableHead className="text-right">match</TableHead>
                      <TableHead />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shown.slice(0, 200).map((row) => (
                      <ReviewRow
                        key={trackKey(row.track)}
                        row={row}
                        onChange={(next) => setRows(new Map(rows).set(trackKey(row.track), next))}
                      />
                    ))}
                  </TableBody>
                </Table>
              )}
              {shown.length > 200 && (
                <p className="mt-2 font-mono text-muted-foreground text-xs">showing the first 200 of {shown.length}</p>
              )}
            </Section>
            <Section title="import">
              <div className="flex max-w-2xl flex-col gap-3">
                <div className="flex items-center gap-3 text-sm">
                  <label htmlFor="import-folder" className="w-28 text-muted-foreground">
                    playlist folder
                  </label>
                  <Input id="import-folder" className="h-8 w-56" value={folder} onChange={(event) => setFolder(event.target.value)} />
                </div>
                <p className="text-muted-foreground text-xs">
                  playlists go in that folder (empty for none) and liked songs become stars. importing again rewrites the playlists it made
                  before{existing.data ? "" : "…"}.
                </p>
                <div className="flex flex-wrap items-center gap-3">
                  <Button onClick={() => void create()} disabled={working}>
                    create playlists and stars
                  </Button>
                  <Button
                    variant="outline"
                    disabled={tally.missing + tally.skipped === 0}
                    onClick={() => download("spotify-missing.csv", missingCsv(missingTracks(rows.values())))}
                  >
                    <DownloadIcon /> missing list (csv)
                  </Button>
                </div>
                {done && <p className="font-mono text-sm">{done}</p>}
              </div>
            </Section>
          </>
        )}
      </Content>
    </>
  );
}
