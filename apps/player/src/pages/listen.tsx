import { CopyIcon, UsersIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Content, EmptyState, PageHeader, Section } from "@/components/library";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { listen, useListen } from "@/lib/listen";
import { HEADERS } from "@/lib/subsonic";
import type { Song } from "@/lib/types";

async function searchSongs(text: string): Promise<Song[]> {
  const response = await fetch(`/api/search?${new URLSearchParams({ q: text, limit: "6" })}`, { headers: HEADERS });
  if (!response.ok) return [];
  return ((await response.json()) as { songs: Song[] }).songs;
}

/** A listener's way to put a song on the host's queue. */
function AddSong() {
  const [text, setText] = useState("");
  const [found, setFound] = useState<Song[]>([]);
  const latest = useRef("");
  return (
    <div className="flex max-w-md flex-col gap-1.5">
      <Input
        aria-label="search the library to add a song"
        placeholder="add a song to the queue"
        value={text}
        onChange={(event) => {
          const asked = event.target.value;
          setText(asked);
          latest.current = asked;
          if (asked.trim().length < 2) return setFound([]);
          void searchSongs(asked).then((songs) => {
            if (latest.current === asked) setFound(songs);
          });
        }}
      />
      {found.map((song) => (
        <Button
          key={song.id}
          variant="outline"
          size="xs"
          className="justify-start font-normal"
          onClick={() => {
            listen.add(song);
            setText("");
            setFound([]);
          }}
        >
          <span className="truncate">
            {song.title} · {song.artist}
          </span>
        </Button>
      ))}
    </div>
  );
}

/** `/listen` starts or ends a session; `/listen/<code>` joins one. */
export function ListenPage({ code }: { code: string | null }) {
  const session = useListen();
  const [joinCode, setJoinCode] = useState("");
  const [anyoneCanSkip, setAnyoneCanSkip] = useState(false);
  const [copied, setCopied] = useState(false);

  // Opening a shared link joins it (once).
  useEffect(() => {
    if (code && listen.getState().status === "off") listen.join(code);
  }, [code]);

  const link = session.code ? `${location.origin}/listen/${session.code}` : "";
  const connected = session.status === "host" || session.status === "listener";
  return (
    <>
      <PageHeader title="listen together" meta={connected ? `${session.members.length} listening` : undefined} />
      <Content>
        {session.status === "ended" ? (
          <EmptyState>the host ended the session</EmptyState>
        ) : session.status === "failed" ? (
          <EmptyState>couldn't connect · the session may be over</EmptyState>
        ) : session.status === "connecting" ? (
          <EmptyState>connecting…</EmptyState>
        ) : connected ? (
          <div className="flex max-w-xl flex-col gap-4">
            <p className="text-muted-foreground text-sm">
              {session.status === "host"
                ? "you're the host: whatever you play, everyone here hears in sync."
                : "you're following the host: playback matches theirs. leave to play your own music again."}
            </p>
            {session.status === "host" && (
              <div className="flex items-center gap-2">
                <Input readOnly aria-label="session link" value={link} className="font-mono" onFocus={(event) => event.target.select()} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    void navigator.clipboard?.writeText(link);
                    setCopied(true);
                  }}
                >
                  <CopyIcon />
                  {copied ? "copied" : "copy"}
                </Button>
              </div>
            )}
            {session.status === "host" && (
              <div className="flex items-center gap-2 text-sm">
                <Switch
                  aria-label="anyone can skip"
                  checked={session.anyoneCanSkip}
                  onCheckedChange={(checked) => listen.setAnyoneCanSkip(checked === true)}
                />
                anyone can skip
              </div>
            )}
            {session.status === "listener" && (
              <div className="flex flex-col gap-3">
                <AddSong />
                {session.anyoneCanSkip && (
                  <Button variant="outline" size="sm" className="w-fit" onClick={() => listen.skip()}>
                    skip
                  </Button>
                )}
              </div>
            )}
            <ul aria-label="listeners" className="flex flex-col gap-1 font-mono text-sm">
              {session.members.map((member) => (
                <li key={member.user} className="flex items-center gap-2">
                  <UsersIcon className="size-3.5 text-muted-foreground" />
                  {member.user}
                  {member.host && <span className="text-muted-foreground">host</span>}
                </li>
              ))}
            </ul>
            {session.notes.length > 0 && (
              <ul aria-label="activity" className="flex flex-col gap-0.5 font-mono text-muted-foreground text-xs">
                {session.notes.map((text, index) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: a short append-only log
                  <li key={`${index}-${text}`}>{text}</li>
                ))}
              </ul>
            )}
            <Button variant="outline" size="sm" className="w-fit" onClick={() => listen.leave()}>
              {session.status === "host" ? "end session" : "leave"}
            </Button>
          </div>
        ) : (
          <div className="flex max-w-md flex-col gap-4">
            <p className="text-muted-foreground text-sm">
              play music together with people on this server. start a session and share its link: they sign in with their own account and
              hear what you play.
            </p>
            <div className="flex items-center gap-2 text-sm">
              <Switch
                aria-label="anyone can skip before starting"
                checked={anyoneCanSkip}
                onCheckedChange={(checked) => setAnyoneCanSkip(checked === true)}
              />
              anyone can skip
            </div>
            <Button size="sm" className="w-fit" onClick={() => void listen.host(anyoneCanSkip)}>
              start a session
            </Button>
          </div>
        )}
      </Content>
      {!connected && session.status !== "connecting" && (
        <Section title="join a session">
          <form
            className="flex max-w-md gap-2 px-4 pb-4"
            onSubmit={(event) => {
              event.preventDefault();
              if (joinCode.trim()) listen.join(joinCode.trim().toLowerCase());
            }}
          >
            <Input
              aria-label="session code"
              className="font-mono"
              placeholder="session code"
              value={joinCode}
              onChange={(event) => setJoinCode(event.target.value)}
            />
            <Button type="submit" variant="outline" size="sm">
              join
            </Button>
          </form>
        </Section>
      )}
    </>
  );
}
