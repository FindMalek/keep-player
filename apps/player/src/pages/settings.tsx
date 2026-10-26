import { Button } from "@keep/ui/components/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@keep/ui/components/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@keep/ui/components/dropdown-menu";
import { Slider } from "@keep/ui/components/slider";
import { Switch } from "@keep/ui/components/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@keep/ui/components/tabs";
import { ToggleGroup, ToggleGroupItem } from "@keep/ui/components/toggle-group";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDownIcon,
  DatabaseIcon,
  DownloadIcon,
  ExternalLinkIcon,
  HardDriveDownloadIcon,
  LogOutIcon,
  MonitorSmartphoneIcon,
} from "lucide-react";
import { lazy, type ReactNode, Suspense, useState } from "react";
import { LibraryRules } from "@/components/library-rules";
import { Link } from "@/components/link";
import { OutputDevice } from "@/components/output-device";
import { apiQueries } from "@/lib/api-queries";
import { MAX_CROSSFADE } from "@/lib/crossfade";
import { doctorQuery } from "@/lib/doctor-query";
import { install, useInstallState } from "@/lib/install";
import { installHelp, isArc } from "@/lib/install-help";
import { MINI_PLAYER_SUPPORTED } from "@/lib/mini-player";
import { previewNotice } from "@/lib/notify";
import { type Settings, setSetting, TOAST_LEVELS, TOAST_POSITIONS, type ToastPosition, useSetting } from "@/lib/settings";
import { isStreamQuality, QUALITIES } from "@/lib/stream-quality";
import { HEADERS, logout, useUser } from "@/lib/subsonic";
import { setTheme, type Theme, useTheme } from "@/lib/theme";

const EqualizerSheet = lazy(() => import("@/components/equalizer-sheet").then((module) => ({ default: module.EqualizerSheet })));
const StorageDialog = lazy(() => import("@/components/storage-dialog").then((module) => ({ default: module.StorageDialog })));
const IndexDialog = lazy(() => import("@/components/index-dialog").then((module) => ({ default: module.IndexDialog })));
const SessionsDialog = lazy(() => import("@/components/sessions-dialog").then((module) => ({ default: module.SessionsDialog })));

const SECTIONS = ["playback", "appearance", "library", "sync", "storage", "lyrics", "shortcuts", "account", "about"] as const;
type Section = (typeof SECTIONS)[number];

/** One setting: what it is and why you'd change it on the left, the control on the right. */
function Row({ label, hint, children, id }: { label: string; hint?: ReactNode; children: ReactNode; id?: string }) {
  return (
    <div className="flex items-center justify-between gap-6 border-b py-3 last:border-b-0">
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={id} className="text-sm">
          {label}
        </label>
        {hint && <p className="text-muted-foreground text-xs">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

type BooleanSetting = { [K in keyof Settings]: Settings[K] extends boolean ? K : never }[keyof Settings];

function Toggle({ setting, label, hint }: { setting: BooleanSetting; label: string; hint?: ReactNode }) {
  const value = useSetting(setting);
  const id = `setting-${setting}`;
  return (
    <Row id={id} label={label} hint={hint}>
      <Switch id={id} checked={value} onCheckedChange={(checked) => setSetting(setting, checked === true)} />
    </Row>
  );
}

const NORMALIZATIONS = [
  ["off", "off"],
  ["track", "track"],
  ["album", "album"],
  ["auto", "auto"],
] as const;

/** ReplayGain mode and a pre-amp on top (#24). Auto uses the album's gain while an album plays in order. */
function Loudness() {
  const mode = useSetting("normalization");
  const preamp = useSetting("preamp");
  return (
    <>
      <Row
        label="normalization"
        hint={<>even out loudness with the replaygain in your files · auto: album gain while an album plays in order · {SYNCED}</>}
      >
        <ToggleGroup
          variant="outline"
          size="sm"
          aria-label="normalization"
          value={[mode]}
          onValueChange={(value: string[]) => value[0] && setSetting("normalization", value[0] as Settings["normalization"])}
        >
          {NORMALIZATIONS.map(([value, name]) => (
            <ToggleGroupItem key={value} value={value} className="font-mono font-normal">
              {name}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
      </Row>
      <Row label="pre-amp" hint={<>extra gain on top of normalization · {SYNCED}</>}>
        <div className="flex w-56 items-center gap-3">
          <Slider
            thumbLabel="pre-amp decibels"
            min={-12}
            max={12}
            step={1}
            value={[preamp]}
            onValueChange={(value) => setSetting("preamp", Array.isArray(value) ? (value[0] ?? 0) : value)}
          />
          <span className="w-14 text-right font-mono text-xs tabular-nums">{preamp > 0 ? `+${preamp}` : preamp} dB</span>
        </div>
      </Row>
    </>
  );
}

/** How chatty the pop-ups at the bottom are. Errors always show. */
function ToastsRow() {
  const level = useSetting("toasts");
  return (
    <Row
      label="notifications"
      hint={<>all: every confirmation · important: only those with a button (undo, resume) · errors: only problems · {SYNCED}</>}
    >
      <ToggleGroup
        variant="outline"
        size="sm"
        aria-label="notifications"
        value={[level]}
        onValueChange={(value: string[]) => {
          const next = TOAST_LEVELS.find((item) => item === value[0]);
          if (!next) return;
          setSetting("toasts", next);
          previewNotice(next === "errors" ? "only problems pop up now, like this one" : "notifications look like this");
        }}
      >
        {TOAST_LEVELS.map((value) => (
          <ToggleGroupItem key={value} value={value} className="font-mono font-normal">
            {value}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Row>
  );
}

/** Which corner toasts use; picking one shows a sample there. */
function ToastPositionRow() {
  const position = useSetting("toastPosition");
  return (
    <Row label="notifications show" hint={<>bottom ones stay above the player bar and the up next card · {SYNCED}</>}>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              variant="outline"
              size="sm"
              aria-label={`notifications show: ${position}`}
              className="w-36 justify-between font-mono font-normal"
            />
          }
        >
          {position.replace("-", " ")}
          <ChevronDownIcon />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-36">
          <DropdownMenuRadioGroup
            value={position}
            onValueChange={(value) => {
              setSetting("toastPosition", value as ToastPosition);
              previewNotice("notifications show up here");
            }}
          >
            {TOAST_POSITIONS.map((value) => (
              <DropdownMenuRadioItem key={value} value={value} className="font-mono">
                {value.replace("-", " ")}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </Row>
  );
}

/** What to stream (#24): the original file, or a transcode for a slow or metered connection. Kept per device. */
function StreamQualityRow() {
  const quality = useSetting("streamQuality");
  return (
    <Row label="stream quality" hint={<>original plays your files as they are · a transcode saves data on a slow connection · {DEVICE}</>}>
      <ToggleGroup
        variant="outline"
        size="sm"
        aria-label="stream quality"
        value={[quality]}
        onValueChange={(value: string[]) => isStreamQuality(value[0]) && setSetting("streamQuality", value[0])}
      >
        {QUALITIES.map(([value, name]) => (
          <ToggleGroupItem key={value} value={value} className="font-mono font-normal">
            {name}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </Row>
  );
}

/** Crossfade length: off to 12 s. Songs that follow each other on an album never fade, so live records stay whole. */
function Crossfade() {
  const seconds = useSetting("crossfade");
  return (
    <Row
      id="setting-crossfade"
      label="crossfade"
      hint={<>the next song starts before this one ends · never between album tracks played in order · {SYNCED}</>}
    >
      <div className="flex w-56 items-center gap-3">
        <Slider
          id="setting-crossfade"
          thumbLabel="crossfade seconds"
          min={0}
          max={MAX_CROSSFADE}
          step={1}
          value={[seconds]}
          onValueChange={(value) => setSetting("crossfade", Array.isArray(value) ? (value[0] ?? 0) : value)}
        />
        <span className="w-10 text-right font-mono text-xs tabular-nums">{seconds ? `${seconds} s` : "off"}</span>
      </div>
    </Row>
  );
}

const SYNCED = <span className="font-mono">follows you to every browser</span>;
const DEVICE = <span className="font-mono">this device only</span>;

/** Everything you can set, by topic. The tab is in the address (`/settings/sync`), so a link opens the right one. */
/** Admins: the library's health score, from the doctor's checks, and the way to the full report. */
function DoctorRow() {
  const doctor = useQuery(doctorQuery);
  const health = doctor.data?.health;
  return (
    <Row label="library doctor" hint="missing covers, tags and replaygain, duplicates, odd formats">
      <span className="font-mono text-sm">{doctor.isError ? "—" : health === undefined ? "…" : `${health}%`}</span>
      <Button variant="outline" size="sm" render={<Link href="/doctor" />}>
        open
      </Button>
    </Row>
  );
}

/** A sign-in for the now-playing mod in Claude Code or OpenCode: made here, pasted there as one command. */
function TerminalRow() {
  const [command, setCommand] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const make = async () => {
    const response = await fetch("/api/remote/token", { method: "POST", headers: HEADERS }).catch(() => null);
    if (!response?.ok) return setFailed(true);
    const { token } = (await response.json()) as { token: string };
    setCommand(`/keep-music connect ${location.origin} ${token}`);
  };
  return (
    <Row
      label="now playing in your terminal"
      hint={
        command ? (
          <>paste it in claude code or opencode · shown once · sign it out under account → sessions</>
        ) : (
          <>the song, its lyric line and play/pause above the prompt of claude code or opencode</>
        )
      }
    >
      {command ? (
        <>
          <input readOnly aria-label="connect command" value={command} className="h-8 w-56 border bg-transparent px-2 font-mono text-xs" />
          <Button variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(command)}>
            copy
          </Button>
        </>
      ) : (
        <Button variant="outline" size="sm" onClick={() => void make()}>
          {failed ? "try again" : "connect"}
        </Button>
      )}
    </Row>
  );
}

/** A token for your own scripts and apps against the API (`/api` documents it): made here, shown once. */
function ApiTokenRow() {
  const [token, setToken] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const make = async () => {
    const response = await fetch("/auth/api-token", { method: "POST", headers: HEADERS }).catch(() => null);
    if (!response?.ok) return setFailed(true);
    setToken(((await response.json()) as { token: string }).token);
  };
  return (
    <Row
      label="api token"
      hint={
        token ? (
          <>send it as Authorization: Bearer · shown once · sign it out under account → sessions</>
        ) : (
          <>
            for your own scripts and apps ·{" "}
            <a href="/api" target="_blank" rel="noreferrer" className="underline underline-offset-2">
              the api
            </a>
          </>
        )
      }
    >
      {token ? (
        <>
          <input readOnly aria-label="api token" value={token} className="h-8 w-56 border bg-transparent px-2 font-mono text-xs" />
          <Button variant="outline" size="sm" onClick={() => void navigator.clipboard.writeText(token)}>
            copy
          </Button>
        </>
      ) : (
        <Button variant="outline" size="sm" onClick={() => void make()}>
          {failed ? "try again" : "make one"}
        </Button>
      )}
    </Row>
  );
}

/** Settings float over the page you were on: a sidebar of sections on the left, the rows on the right. */
export function SettingsPage({ section, onClose }: { section: string | null; onClose: () => void }) {
  const [tab, setTab] = useState<Section>((SECTIONS as readonly string[]).includes(section ?? "") ? (section as Section) : "playback");
  const theme = useTheme();
  const queueSync = useSetting("queueSync");
  const user = useUser();
  const session = useQuery(apiQueries.session()).data;
  const version = useQuery(apiQueries.version()).data;
  const installState = useInstallState();
  const [storageOpen, setStorageOpen] = useState(false);
  const [eqOpen, setEqOpen] = useState(false);
  const eqOn = useSetting("eqOn");
  const [sessionsOpen, setSessionsOpen] = useState(false);
  const [indexOpen, setIndexOpen] = useState(false);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[min(640px,85vh)] gap-0 p-0 sm:max-w-3xl">
        <Tabs
          orientation="vertical"
          value={tab}
          onValueChange={(value) => {
            setTab(value as Section);
            window.history.replaceState(window.history.state, "", `/settings/${value}`);
          }}
          className="min-h-0 w-full gap-0"
        >
          <nav className="flex w-40 shrink-0 flex-col gap-3 border-r p-3 max-sm:w-32">
            <DialogTitle className="px-2 font-mono text-sm">settings</DialogTitle>
            <DialogDescription className="sr-only">preferences for playback, look, library, sync and your account</DialogDescription>
            <TabsList variant="line" className="w-full items-stretch font-mono">
              {SECTIONS.map((section) => (
                <TabsTrigger key={section} value={section}>
                  {section}
                </TabsTrigger>
              ))}
            </TabsList>
          </nav>
          <div className="min-w-0 flex-1 overflow-y-auto px-5 py-3">
            <TabsContent value="playback">
              <Row label="output device" hint={<>speakers or headphones to play through · {DEVICE}</>}>
                <OutputDevice />
              </Row>
              {MINI_PLAYER_SUPPORTED && (
                <Toggle
                  setting="miniPlayerWhenHidden"
                  label="mini player when you leave the tab"
                  hint={<>an always-on-top window while music plays · {DEVICE}</>}
                />
              )}
              <Crossfade />
              <Loudness />
              <StreamQualityRow />
              <Row label="equalizer" hint={<>ten bands with presets, off by default · {SYNCED}</>}>
                <div className="flex items-center gap-3">
                  <Switch aria-label="equalizer on" checked={eqOn} onCheckedChange={(checked) => setSetting("eqOn", checked === true)} />
                  <Button variant="outline" size="sm" onClick={() => setEqOpen(true)}>
                    adjust
                  </Button>
                </div>
              </Row>
              <p className="py-3 text-muted-foreground text-xs">songs play gapless with replaygain from your tags.</p>
            </TabsContent>

            <TabsContent value="appearance">
              <Row label="theme" hint={SYNCED}>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        variant="outline"
                        size="sm"
                        aria-label={`theme: ${theme}`}
                        className="w-28 justify-between font-mono font-normal"
                      />
                    }
                  >
                    {theme}
                    <ChevronDownIcon />
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="min-w-28">
                    <DropdownMenuRadioGroup value={theme} onValueChange={(value) => setTheme(value as Theme)}>
                      {(["system", "dark", "light"] as const).map((value) => (
                        <DropdownMenuRadioItem key={value} value={value} className="font-mono">
                          {value}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </Row>
              <ToastsRow />
              <ToastPositionRow />
              <Toggle
                setting="upNext"
                label="up next card"
                hint={<>the next song and a skip button, shown over the bar as a song ends · {SYNCED}</>}
              />
              <Toggle setting="loadingBar" label="loading bar" hint={<>a thin line at the top while things refresh · {SYNCED}</>} />
              <Toggle
                setting="offlineInBar"
                label="offline mark in the player bar"
                hint={<>the arrow next to the format when a song is saved for offline · track rows always show it · {SYNCED}</>}
              />
              <Toggle
                setting="ratings"
                label="show ratings"
                hint={<>1–5 stars in track lists, for smart playlists in other clients · {SYNCED}</>}
              />
            </TabsContent>

            <TabsContent value="library">
              <p className="pb-2 text-muted-foreground text-xs">
                your rules for songs and albums, on every browser. <span className="font-mono">follows you to every browser</span>
              </p>
              <Row
                label="import from spotify"
                hint="rebuild your playlists and liked songs from a Spotify export, with a screen to check each match"
              >
                <Button variant="outline" size="sm" render={<Link href="/import" />}>
                  open
                </Button>
              </Row>
              {session?.admin && <DoctorRow />}
              {session?.admin && (
                <Row label="upload music" hint="your own files or album folders, straight into the library's import folder">
                  <Button variant="outline" size="sm" render={<Link href="/upload" />}>
                    open
                  </Button>
                </Row>
              )}
              <LibraryRules />
            </TabsContent>

            <TabsContent value="sync">
              <Toggle
                setting="queueSync"
                label="sync with your other devices"
                hint={<>saves the queue to navidrome and offers queues from arpeggi or other browsers · {SYNCED}</>}
              />
              {queueSync && (
                <Toggle
                  setting="followOtherDevices"
                  label="pick up their queue without asking"
                  hint={<>never while this one plays · {SYNCED}</>}
                />
              )}
              <TerminalRow />
              <ApiTokenRow />
            </TabsContent>

            <TabsContent value="storage">
              <Row label="offline storage" hint={<>songs kept for offline and the next few precached · {DEVICE}</>}>
                <Button variant="outline" size="sm" onClick={() => setStorageOpen(true)}>
                  <HardDriveDownloadIcon />
                  manage
                </Button>
              </Row>
            </TabsContent>

            <TabsContent value="lyrics">
              <Row label="lyrics coverage" hint="how much of your library has synced lyrics, and what's missing">
                <Button variant="outline" size="sm" render={<Link href="/lyrics" />}>
                  open
                </Button>
              </Row>
              <p className="py-3 text-muted-foreground text-xs">
                lyrics come from navidrome first, then lrclib. the server can also save them as .lrc files next to your music (
                <span className="font-mono">LYRICS_WRITE_LRC</span>).
              </p>
            </TabsContent>

            <TabsContent value="shortcuts">
              <Row label="every shortcut" hint="press ? anywhere to see them all">
                <Button variant="outline" size="sm" onClick={() => window.dispatchEvent(new Event("keep:cheat-sheet"))}>
                  show
                </Button>
              </Row>
            </TabsContent>

            <TabsContent value="account">
              <Row
                label={user ?? "signed out"}
                hint={session?.server ? `on ${session.server}${session.admin ? " · navidrome admin" : ""}` : undefined}
              >
                <Button variant="outline" size="sm" onClick={() => void logout()}>
                  <LogOutIcon />
                  log out
                </Button>
              </Row>
              {session?.admin && (
                <Row label="library index" hint="the search and lyrics index the server keeps; rebuild it after big changes">
                  <Button variant="outline" size="sm" onClick={() => setIndexOpen(true)}>
                    <DatabaseIcon />
                    manage
                  </Button>
                </Row>
              )}
              <Row label="sessions" hint="every browser signed in as you, and a way to sign one out">
                <Button variant="outline" size="sm" onClick={() => setSessionsOpen(true)}>
                  <MonitorSmartphoneIcon />
                  manage
                </Button>
              </Row>
            </TabsContent>

            <TabsContent value="about">
              <Row label="install keep music" hint="its own window, in your dock or start menu, with media keys">
                {installState === "installed" ? (
                  <span className="font-mono text-muted-foreground text-xs">installed</span>
                ) : installState === "available" ? (
                  <Button variant="outline" size="sm" onClick={() => void install()}>
                    <DownloadIcon />
                    install
                  </Button>
                ) : (
                  <span className="max-w-64 text-right font-mono text-muted-foreground text-xs">
                    {installHelp(navigator.userAgent, isArc())}
                  </span>
                )}
              </Row>
              <Row
                label={version ? `keep music v${version.version}` : "keep music"}
                hint={version?.updateAvailable ? `v${version.latest} is out` : "a monochrome web player for navidrome"}
              >
                <Button
                  variant="outline"
                  size="sm"
                  render={<a href="https://github.com/FindMalek/keep-player" target="_blank" rel="noreferrer" />}
                >
                  <ExternalLinkIcon />
                  github
                </Button>
              </Row>
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
      {storageOpen && (
        <Suspense>
          <StorageDialog open={storageOpen} onOpenChange={setStorageOpen} />
        </Suspense>
      )}
      {eqOpen && (
        <Suspense>
          <EqualizerSheet open={eqOpen} onOpenChange={setEqOpen} />
        </Suspense>
      )}
      {indexOpen && (
        <Suspense>
          <IndexDialog open={indexOpen} onOpenChange={setIndexOpen} />
        </Suspense>
      )}
      {sessionsOpen && (
        <Suspense>
          <SessionsDialog open={sessionsOpen} onOpenChange={setSessionsOpen} />
        </Suspense>
      )}
    </Dialog>
  );
}
