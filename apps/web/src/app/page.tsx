import { buttonVariants } from "@keep/ui/components/button";
import { cn } from "@keep/ui/lib/utils";
import {
  AppleIcon,
  AudioLinesIcon,
  BracesIcon,
  CheckIcon,
  CommandIcon,
  ContainerIcon,
  EyeOffIcon,
  FolderLockIcon,
  type LucideIcon,
  MicVocalIcon,
  MinusIcon,
  MonitorSmartphoneIcon,
  SmartphoneIcon,
  SparklesIcon,
  StarIcon,
  TerminalIcon,
  UserRoundCheckIcon,
  WandSparklesIcon,
} from "lucide-react";
import Image from "next/image";
import type { ReactNode } from "react";
import { Art } from "@/components/art";
import { DevicesDemo, LyricsDemo, PaletteDemo } from "@/components/demos";
import { Island } from "@/components/island";
import { SiteFooter, SiteHeader } from "@/components/site";
import { DOCS, MAC_APP, REPO, SELF_HOSTING, SITE_URL, stars } from "@/lib/site";

export const revalidate = 86_400;

// What search engines read about the app (schema.org).
const JSON_LD = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "keep music",
  applicationCategory: "MultimediaApplication",
  operatingSystem: "Web, macOS",
  description:
    "A self-hosted music player for Navidrome: made-for-you mixes, synced lyrics, one session across your devices and the song in your Mac's notch.",
  offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
  license: "https://opensource.org/licenses/MIT",
  codeRepository: REPO,
  url: SITE_URL,
};

const YOURS: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: FolderLockIcon,
    title: "your files stay put",
    text: "navidrome serves them from your disk, mounted read-only. keep music never copies, moves or uploads your library.",
  },
  {
    icon: UserRoundCheckIcon,
    title: "your navidrome account",
    text: "no new sign-up, no email. you sign in with the account you already have, and the browser never keeps your password.",
  },
  {
    icon: EyeOffIcon,
    title: "no tracking",
    text: "no analytics, no accounts with us. lyrics are looked up on lrclib (empty LRCLIB_URL turns it off), and the release check is off unless you turn it on.",
  },
  {
    icon: ContainerIcon,
    title: "one container",
    text: "docker compose up next to navidrome. the self-hosting guide is written so a coding agent can follow it top to bottom.",
  },
  {
    icon: BracesIcon,
    title: "an api for the rest",
    text: "every procedure the player uses, documented at /api with a playground. make a token in settings and build your own.",
  },
  {
    icon: StarIcon,
    title: "open source",
    text: "the player, the server and the mac app, mit licensed. read it, fork it, run it the way you like.",
  },
];

// Only what's certain for each: a dash means "doesn't have it", not "unknown".
const COMPARE: { feature: string; keep: boolean; spotify: boolean; navidrome: boolean }[] = [
  { feature: "plays the files you own", keep: true, spotify: false, navidrome: true },
  { feature: "no subscription, no ads", keep: true, spotify: false, navidrome: true },
  { feature: "no tracking", keep: true, spotify: false, navidrome: true },
  { feature: "daily mixes, discover weekly, a daylist", keep: true, spotify: true, navidrome: false },
  { feature: "one session across your devices", keep: true, spotify: true, navidrome: false },
  { feature: "a year in review", keep: true, spotify: true, navidrome: false },
  { feature: "the song in your mac's notch", keep: true, spotify: false, navidrome: false },
];

const MIXES = [
  { name: "daily mix 1", art: 0 },
  { name: "discover weekly", art: 5 },
  { name: "daylist", art: 2 },
  { name: "release radar", art: 1 },
];

/** A bento cell: icon and title, a line of text, and a live picture of the feature. */
function Cell({
  icon: Icon,
  title,
  text,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  text: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={cn("reveal flex flex-col gap-4 bg-background p-6", className)}>
      <div className="flex items-center gap-2">
        <Icon className="size-4" strokeWidth={1.5} />
        <h3 className="font-medium">{title}</h3>
      </div>
      <p className="text-muted-foreground text-sm">{text}</p>
      {children && <div className="mt-auto">{children}</div>}
    </div>
  );
}

function Section({ id, title, intro, children }: { id: string; title: ReactNode; intro: string; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
      <h2 className="reveal max-w-2xl font-medium text-3xl tracking-tight sm:text-4xl">{title}</h2>
      <p className="reveal mt-4 max-w-xl text-muted-foreground">{intro}</p>
      <div className="mt-12">{children}</div>
    </section>
  );
}

/** A screenshot in the page's theme: `name.png` in dark mode, `name-light.png` in light mode. */
function Shot({ name, alt, className, priority }: { name: string; alt: string; className?: string; priority?: boolean }) {
  const image = (src: string, visibility: string) => (
    <Image
      src={src}
      alt={alt}
      width={2880}
      height={1800}
      priority={priority}
      sizes="(min-width: 1152px) 1100px, 100vw"
      className={cn("h-auto w-full", visibility)}
    />
  );
  return (
    <div className={cn("overflow-hidden border bg-card", className)}>
      {image(`/shots/${name}-light.png`, "dark:hidden")}
      {image(`/shots/${name}.png`, "hidden dark:block")}
    </div>
  );
}

function Mark({ on }: { on: boolean }) {
  return on ? (
    <CheckIcon aria-label="yes" className="mx-auto size-4" />
  ) : (
    <MinusIcon aria-label="no" className="mx-auto size-4 text-muted-foreground/50" />
  );
}

export default async function Home() {
  const count = await stars();
  const github = (
    <a href={REPO} className={buttonVariants({ variant: "outline", size: "lg" })}>
      github{count !== null && count >= 10 && <span className="font-mono text-muted-foreground">★ {count.toLocaleString("en")}</span>}
    </a>
  );
  return (
    <>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: a constant object, serialized */}
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }} />
      <SiteHeader />
      <main>
        <section className="mx-auto max-w-6xl px-4 pt-16 pb-16 sm:px-6 sm:pt-24">
          <div className="grid items-center gap-12 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <p className="hero-in font-mono text-muted-foreground text-xs">a player for navidrome · open source</p>
              <h1 className="hero-in mt-4 font-medium text-5xl leading-[1.02] tracking-tight [animation-delay:80ms] sm:text-7xl">
                a real music app
                <br />
                <span className="text-muted-foreground">for the music</span>
                <br />
                you own.
              </h1>
              <p className="hero-in mt-8 max-w-xl text-lg text-muted-foreground [animation-delay:160ms]">
                mixes made from what you play, synced lyrics, one session across your devices and the song in your mac's notch. your files,
                your server, no tracking.
              </p>
              <div className="hero-in mt-10 flex flex-wrap gap-3 [animation-delay:240ms]">
                <a href={SELF_HOSTING} className={buttonVariants({ size: "lg" })}>
                  self-host it
                </a>
                {github}
              </div>
            </div>
            <div className="hero-in [animation-delay:200ms]">
              <Island />
            </div>
          </div>
          <Shot name="album-lyrics" alt="an album in keep music with its synced lyrics open beside it" className="reveal mt-16" priority />
        </section>

        <Section
          id="features"
          title="everything a streaming app does, for your own library"
          intro="the parts that make spotify feel finished, rebuilt on top of navidrome and your files. these are live: watch them."
        >
          <div className="grid gap-px border bg-border md:grid-cols-2 lg:grid-cols-3">
            <Cell
              icon={SparklesIcon}
              title="made for you"
              text="daily mixes, discover weekly, a daylist that changes through the day, release radar. made from what you play, saved as navidrome playlists so your phone has them too."
              className="lg:col-span-2"
            >
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {MIXES.map((mix) => (
                  <div key={mix.name} className="group">
                    <div className="relative overflow-hidden">
                      <Art seed={mix.art} className="w-full transition-transform duration-500 group-hover:scale-105" />
                      <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 pt-8 font-medium font-mono text-meta text-white">
                        {mix.name}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </Cell>
            <Cell
              icon={MicVocalIcon}
              title="synced lyrics"
              text="from your .lrc files and lrclib. the line being sung stands out; click one to jump there."
            >
              <LyricsDemo />
            </Cell>
            <Cell
              icon={CommandIcon}
              title="⌘K for everything"
              text="ranked search that forgives typos and puts your likes first, with filters, and every action by name."
            >
              <PaletteDemo />
            </Cell>
            <Cell
              icon={MonitorSmartphoneIcon}
              title="one session"
              text="every browser of yours is one player. press play anywhere and the rest become remotes."
            >
              <DevicesDemo />
            </Cell>
            <Cell
              icon={AudioLinesIcon}
              title="gapless, replaygain"
              text="two decks for albums that run into each other, album gain when you play one in order, crossfade if you like it."
            >
              <div aria-hidden className="flex h-16 items-end gap-0.75 border bg-card p-3">
                {Array.from({ length: 36 }, (_, index) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: a fixed waveform
                    key={index}
                    className={cn("flex-1", index < 18 ? "bg-foreground" : "bg-muted-foreground/40")}
                    style={{ height: `${30 + Math.abs(Math.sin(index * 1.7)) * 70}%` }}
                  />
                ))}
              </div>
            </Cell>
          </div>

          <div className="mt-px grid gap-px border border-t-0 bg-border lg:grid-cols-3">
            <div className="reveal flex flex-col gap-4 bg-background p-6 lg:col-span-2">
              <div className="flex items-center gap-2">
                <AppleIcon className="size-4" strokeWidth={1.5} />
                <h3 className="font-medium">the mac app</h3>
              </div>
              <p className="max-w-lg text-muted-foreground text-sm">
                the song lives in the notch, with bars that move with the beat. hover for the controls, click for lyrics and the queue.
                updates itself and tells you what changed since the version you last opened.
              </p>
              <div className="mt-auto overflow-hidden border bg-card">
                <Image
                  src="/shots/macos-open.png"
                  alt="the notch island open, with the song, controls and lyrics"
                  width={1280}
                  height={520}
                  className="h-auto w-full"
                />
              </div>
              <a href={MAC_APP} className={cn(buttonVariants({ variant: "outline", size: "sm" }), "self-start")}>
                download for mac
              </a>
            </div>
            <div className="reveal flex flex-col gap-4 bg-background p-6">
              <div className="flex items-center gap-2">
                <WandSparklesIcon className="size-4" strokeWidth={1.5} />
                <h3 className="font-medium">your year, as a reel</h3>
              </div>
              <p className="text-muted-foreground text-sm">
                minutes, your top artist, the album on repeat, your longest streak. a card to share at the end.
              </p>
              <div aria-hidden className="mt-auto flex aspect-[9/12] flex-col justify-between bg-foreground p-5 text-background">
                <span className="font-mono text-meta opacity-70">your 2026</span>
                <div>
                  <p className="font-medium text-5xl tracking-tight">41,208</p>
                  <p className="mt-1 text-sm opacity-70">minutes listened</p>
                </div>
                <div className="flex items-center gap-3">
                  <Art seed={0} className="size-12" />
                  <div className="text-sm">
                    <p className="opacity-70">top artist</p>
                    <p className="font-medium">Massive Attack</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-px grid grid-cols-[minmax(0,1fr)] gap-px border border-t-0 bg-border">
            <div className="reveal flex flex-col gap-4 bg-background p-6 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <TerminalIcon className="mt-0.5 size-4 shrink-0" strokeWidth={1.5} />
                <div>
                  <h3 className="font-medium">in your terminal</h3>
                  <p className="mt-1 text-muted-foreground text-sm">
                    what's playing above the prompt of claude code or opencode, with the lyric line and play/pause.
                  </p>
                </div>
              </div>
              <pre className="overflow-x-auto border bg-card px-4 py-3 font-mono text-meta leading-relaxed">
                <span className="text-muted-foreground">♪ </span>Teardrop · Massive Attack{"  "}
                <span className="text-muted-foreground">1:34 / 5:30 · ⏮ ⏸ ⏭</span>
              </pre>
            </div>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {[
              { name: "search", alt: "⌘K search with songs, albums and artists", caption: "⌘K, ranked the way you listen" },
              {
                name: "stats",
                alt: "listening stats: minutes, top artists and a listening clock",
                caption: "stats from your own plays",
              },
              { name: "queue", alt: "the queue panel, with up next and history", caption: "a queue you can actually shape" },
            ].map((shot) => (
              <figure key={shot.name} className="reveal">
                <Shot name={shot.name} alt={shot.alt} />
                <figcaption className="mt-3 text-muted-foreground text-sm">{shot.caption}</figcaption>
              </figure>
            ))}
          </div>
        </Section>

        <Section
          id="compare"
          title="the best of both"
          intro="the polish of a streaming app, the ownership of a server. here's where each one stands."
        >
          <div className="reveal overflow-x-auto border">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="border-b bg-card font-mono text-muted-foreground text-xs">
                  <th className="px-4 py-3 text-left font-normal" />
                  <th className="w-32 px-4 py-3 font-medium text-foreground">keep music</th>
                  <th className="w-32 px-4 py-3 font-normal">spotify</th>
                  <th className="w-32 px-4 py-3 font-normal">navidrome's web ui</th>
                </tr>
              </thead>
              <tbody>
                {COMPARE.map((row) => (
                  <tr key={row.feature} className="border-b last:border-b-0">
                    <td className="px-4 py-3">{row.feature}</td>
                    <td className="bg-card/60 px-4 py-3">
                      <Mark on={row.keep} />
                    </td>
                    <td className="px-4 py-3">
                      <Mark on={row.spotify} />
                    </td>
                    <td className="px-4 py-3">
                      <Mark on={row.navidrome} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>

        <Section
          id="yours"
          title="yours, all the way down"
          intro="keep music runs next to navidrome on your own machine. here is what that means."
        >
          <div className="grid gap-px border bg-border md:grid-cols-2">
            {YOURS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="reveal flex gap-4 bg-background p-6">
                <Icon className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} />
                <div>
                  <h3 className="font-medium">{title}</h3>
                  <p className="mt-2 text-muted-foreground text-sm">{text}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="reveal mt-8 flex gap-4 border border-dashed p-6">
            <SmartphoneIcon className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} />
            <p className="text-muted-foreground text-sm">
              <span className="font-medium text-foreground">no phone app, on purpose.</span> keep music is made for desktop browsers and the
              mac. on your phone, use any subsonic app (arpeggi, symfonium, substreamer) against the same navidrome: your queue hands off
              both ways, and mixes show up as playlists there.
            </p>
          </div>
        </Section>

        <section className="border-t bg-card">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-4 py-20 sm:flex-row sm:items-end sm:justify-between sm:px-6">
            <div>
              <h2 className="font-medium text-3xl tracking-tight sm:text-5xl">bring your library.</h2>
              <p className="mt-3 text-muted-foreground">one container next to navidrome, a few minutes with the guide.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a href={SELF_HOSTING} className={buttonVariants({ size: "lg" })}>
                self-host it
              </a>
              <a href={DOCS} className={buttonVariants({ variant: "outline", size: "lg" })}>
                read the docs
              </a>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
