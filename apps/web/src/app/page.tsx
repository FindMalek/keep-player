import { buttonVariants } from "@keep/ui/components/button";
import { cn } from "@keep/ui/lib/utils";
import {
  AppleIcon,
  AudioLinesIcon,
  BracesIcon,
  CommandIcon,
  ContainerIcon,
  EyeOffIcon,
  FolderLockIcon,
  type LucideIcon,
  MicVocalIcon,
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
import { DOCS, MAC_APP, REPO, SELF_HOSTING, stars } from "@/lib/site";

export const revalidate = 86_400;

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  {
    icon: SparklesIcon,
    title: "made for you",
    text: "daily mixes, discover weekly, a daylist, release radar and on this day, from what you play. saved as navidrome playlists, so your phone has them too.",
  },
  {
    icon: MicVocalIcon,
    title: "synced lyrics",
    text: "from your .lrc files and lrclib. click a line to jump there, nudge the timing when it drifts.",
  },
  {
    icon: MonitorSmartphoneIcon,
    title: "one session",
    text: "every browser of yours is one player. press play anywhere and the rest become remotes, like spotify connect.",
  },
  {
    icon: AudioLinesIcon,
    title: "gapless, replaygain",
    text: "two decks for albums that run into each other, album gain when you play one in order, crossfade if you like it.",
  },
  {
    icon: WandSparklesIcon,
    title: "recap",
    text: "your month or your year as a reel: top artist, the album on repeat, your longest streak. ends with a card to share.",
  },
  {
    icon: CommandIcon,
    title: "⌘K for everything",
    text: "ranked search with typos forgiven and your likes first, filters like genre:metal year:1990..1999, and every action by name.",
  },
];

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
    title: "nothing phones home",
    text: "no analytics, no tracking, no accounts with us. the one outside call, a daily check for new releases, is off unless you turn it on.",
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

function Section({ id, title, intro, children }: { id: string; title: ReactNode; intro: string; children: ReactNode }) {
  return (
    <section id={id} className="mx-auto w-full max-w-6xl scroll-mt-20 px-4 py-20 sm:px-6 sm:py-28">
      <h2 className="max-w-2xl font-medium text-3xl tracking-tight sm:text-4xl">{title}</h2>
      <p className="mt-4 max-w-xl text-muted-foreground">{intro}</p>
      <div className="mt-12">{children}</div>
    </section>
  );
}

function Shot({ src, alt, className }: { src: string; alt: string; className?: string }) {
  return (
    <div className={cn("overflow-hidden border bg-card", className)}>
      <Image src={src} alt={alt} width={2880} height={1800} sizes="(min-width: 1152px) 1100px, 100vw" className="h-auto w-full" />
    </div>
  );
}

export default async function Home() {
  const count = await stars();
  const github = (
    <a href={REPO} className={buttonVariants({ variant: "outline", size: "lg" })}>
      github{count !== null && <span className="font-mono text-muted-foreground">★ {count.toLocaleString("en")}</span>}
    </a>
  );
  return (
    <>
      <header className="sticky top-0 z-10 border-b bg-background/85 backdrop-blur">
        <nav className="mx-auto flex h-14 max-w-6xl items-center gap-6 px-4 sm:px-6">
          <a href="/" className="flex items-center gap-2.5 font-medium font-mono text-[13px]">
            <span aria-hidden className="size-2.5 bg-foreground" />
            keep music
          </a>
          <div className="ml-auto hidden items-center gap-6 text-muted-foreground text-sm sm:flex">
            <a href="#features" className="hover:text-foreground">
              features
            </a>
            <a href="#yours" className="hover:text-foreground">
              yours
            </a>
            <a href={DOCS} className="hover:text-foreground">
              docs
            </a>
          </div>
          <a href={SELF_HOSTING} className={cn(buttonVariants({ size: "sm" }), "ml-auto sm:ml-0")}>
            self-host it
          </a>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-6xl px-4 pt-20 pb-16 sm:px-6 sm:pt-28">
          <h1 className="font-medium text-5xl leading-[1.02] tracking-tight sm:text-7xl">
            a real music app
            <br />
            <span className="text-muted-foreground">for the music</span>
            <br />
            you own.
          </h1>
          <p className="mt-8 max-w-xl text-lg text-muted-foreground">
            keep music is a player for your navidrome: mixes made from what you play, synced lyrics, one session across your devices and a
            notch island on the mac. your files, your server, nothing phoning home.
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <a href={SELF_HOSTING} className={buttonVariants({ size: "lg" })}>
              self-host it
            </a>
            {github}
          </div>
          <Shot src="/shots/album-lyrics.png" alt="an album in keep music with its synced lyrics open beside it" className="mt-16" />
        </section>

        <Section
          id="features"
          title="everything a streaming app does, for your own library"
          intro="the parts that make spotify feel finished, rebuilt on top of navidrome and your files."
        >
          <div className="grid gap-px border bg-border sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex flex-col gap-3 bg-background p-6">
                <Icon className="size-5" strokeWidth={1.5} />
                <h3 className="font-medium">{title}</h3>
                <p className="text-muted-foreground text-sm">{text}</p>
              </div>
            ))}
          </div>

          <div className="mt-px grid gap-px border border-t-0 bg-border lg:grid-cols-3">
            <div className="flex flex-col gap-4 bg-background p-6 lg:col-span-2">
              <div className="flex items-center gap-2">
                <AppleIcon className="size-5" strokeWidth={1.5} />
                <h3 className="font-medium">the mac app</h3>
              </div>
              <p className="max-w-lg text-muted-foreground text-sm">
                the song lives in the notch, with bars that move with the beat. hover for the controls, click for lyrics and the queue. a
                mini player and a menu bar item for macs without a notch.
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
            <div className="flex flex-col gap-4 bg-background p-6">
              <div className="flex items-center gap-2">
                <TerminalIcon className="size-5" strokeWidth={1.5} />
                <h3 className="font-medium">in your terminal</h3>
              </div>
              <p className="text-muted-foreground text-sm">
                what&apos;s playing above the prompt of claude code or opencode, with the lyric line and play/pause.
              </p>
              <pre className="mt-auto overflow-x-auto border bg-card p-4 font-mono text-[11px] leading-relaxed">
                <span className="text-muted-foreground">♪ </span>Teardrop · Massive Attack
                {"\n"}
                <span className="text-muted-foreground">▮▮▮▮▮▮▯▯▯▯ 1:34 / 5:30 · chrome on mac</span>
                {"\n"}
                <span className="text-muted-foreground">“love, love is a verb”</span>
                {"\n"}⏮ ⏸ ⏭
              </pre>
            </div>
          </div>

          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            <figure>
              <Shot src="/shots/search.png" alt="⌘K search with songs, albums and artists" />
              <figcaption className="mt-3 text-muted-foreground text-sm">⌘K, ranked the way you listen</figcaption>
            </figure>
            <figure>
              <Shot src="/shots/stats.png" alt="listening stats: minutes, top artists and a listening clock" />
              <figcaption className="mt-3 text-muted-foreground text-sm">stats from your own plays</figcaption>
            </figure>
            <figure>
              <Shot src="/shots/queue.png" alt="the queue panel, with up next and history" />
              <figcaption className="mt-3 text-muted-foreground text-sm">a queue you can actually shape</figcaption>
            </figure>
          </div>
        </Section>

        <Section
          id="yours"
          title="yours, all the way down"
          intro="keep music runs next to navidrome on your own machine. here is what that means."
        >
          <div className="grid gap-px border bg-border md:grid-cols-2">
            {YOURS.map(({ icon: Icon, title, text }) => (
              <div key={title} className="flex gap-4 bg-background p-6">
                <Icon className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} />
                <div>
                  <h3 className="font-medium">{title}</h3>
                  <p className="mt-2 text-muted-foreground text-sm">{text}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex gap-4 border border-dashed p-6">
            <SmartphoneIcon className="mt-0.5 size-5 shrink-0" strokeWidth={1.5} />
            <p className="text-muted-foreground text-sm">
              <span className="font-medium text-foreground">no phone app, on purpose.</span> keep music is made for desktop browsers and the
              mac. on your phone, use any subsonic app (arpeggi, symfonium, substreamer) against the same navidrome: your queue hands off
              both ways, and mixes show up as playlists there.
            </p>
          </div>
        </Section>

        <section className="border-t">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-8 px-4 py-20 sm:flex-row sm:items-end sm:justify-between sm:px-6">
            <div>
              <h2 className="font-medium text-3xl tracking-tight sm:text-4xl">bring your library.</h2>
              <p className="mt-3 text-muted-foreground">one container next to navidrome, a few minutes with the guide.</p>
            </div>
            <div className="flex flex-wrap gap-3">
              <a href={SELF_HOSTING} className={buttonVariants({ size: "lg" })}>
                self-host it
              </a>
              {github}
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-8 font-mono text-muted-foreground text-xs sm:px-6">
          <span>keep music · mit</span>
          <a href={REPO} className="hover:text-foreground">
            source
          </a>
          <a href={DOCS} className="hover:text-foreground">
            docs
          </a>
          <a href={`${REPO}/releases`} className="hover:text-foreground">
            releases
          </a>
          <a href="https://github.com/FindMalek" className="ml-auto hover:text-foreground">
            by findmalek
          </a>
        </div>
      </footer>
    </>
  );
}
