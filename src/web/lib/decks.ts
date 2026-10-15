import { equalPower, fitFade, SKIP_FADE_SECONDS } from "./crossfade";
import { BANDS, FLAT, headroom } from "./eq";

/*
 * Two audio decks for gapless playback. One plays; the other holds the next song, preloaded. A few milliseconds before
 * the playing song ends, the idle deck starts (each deck has its own gain node, ramped over 5 ms so the handover never
 * clicks) and the decks swap roles. The engine (player.ts) only talks songs; this module owns elements and the graph:
 *
 *   deck A ─ MediaElementSource ─ gain (ReplayGain) ─┐
 *   deck B ─ MediaElementSource ─ gain (ReplayGain) ─┴─ bus ─ 10 EQ filters ─ master (volume) ─ destination
 *
 * With a crossfade the idle deck starts `fade` seconds early and the two gains follow equal-power curves; a manual
 * skip fades the old song out over 300 ms instead.
 */

/** How early the next song starts: covers the element's start-up latency so the two meet without a gap. */
const LEAD_SECONDS = 0.03;
const RAMP_SECONDS = 0.005;
/** Within this much of the end, a timer is armed for the handover (timeupdate alone fires only ~4 times a second). */
const ARM_SECONDS = 0.6;

export interface DeckEvents {
  playing: () => void;
  pause: () => void;
  waiting: () => void;
  canPlay: () => void;
  /** The playing song's download moved forward (fires a few times a second while bytes arrive). */
  progress: () => void;
  duration: (seconds: number) => void;
  /** About 4/s from the playing deck; the engine uses it for scrobbling and for position while hidden. */
  time: (seconds: number) => void;
  seeked: (seconds: number) => void;
  /** The playing song ended and no preloaded song took over. */
  ended: () => void;
  /** The preloaded song took over gaplessly; the engine should advance its queue without loading anything. */
  handover: () => void;
  error: () => void;
}

interface Deck {
  element: HTMLAudioElement;
  gain: GainNode | null;
  /** Song id loaded in this deck, if any. */
  songId: string | null;
  /** ReplayGain factor for that song. */
  factor: number;
  /** Crossfade into this song when it takes over (0: gapless). */
  fade: number;
}

export class Decks {
  private readonly decks: [Deck, Deck];
  private active = 0;
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Where both decks meet, ahead of the equalizer: takes the loudest boost off so boosted bands don't clip. */
  private bus: GainNode | null = null;
  private filters: BiquadFilterNode[] = [];
  private eq = { on: false, gains: FLAT };
  private timer: ReturnType<typeof setTimeout> | undefined;
  private sinkId = "";
  private volume = 1;
  /** Until then the idle deck is still playing out the previous song's last milliseconds; don't reload it yet. */
  private tailUntil = 0;
  /** The deck whose handover timer is set, so per-frame checks don't re-arm it. */
  private armed: Deck | null = null;
  /** A crossfade is set, so a manual skip fades (300 ms) instead of cutting. */
  private fadesSkips = false;

  constructor(private readonly events: DeckEvents) {
    this.decks = [this.createDeck(), this.createDeck()];
  }

  private createDeck(): Deck {
    const element = new Audio();
    element.preload = "auto";
    const deck: Deck = { element, gain: null, songId: null, factor: 1, fade: 0 };
    // Only the playing deck reports; the idle one is silently preloading.
    const on = (name: string, handler: () => void) =>
      element.addEventListener(name, () => {
        if (this.playing.element === element) handler();
      });
    on("playing", this.events.playing);
    on("pause", this.events.pause);
    on("waiting", this.events.waiting);
    on("canplay", this.events.canPlay);
    on("progress", this.events.progress);
    on("suspend", this.events.progress);
    on("canplaythrough", this.events.progress);
    on("durationchange", () => this.events.duration(Number.isFinite(element.duration) ? element.duration : 0));
    on("seeked", () => this.events.seeked(element.currentTime));
    on("error", this.events.error);
    on("timeupdate", () => {
      this.events.time(element.currentTime);
      this.armHandover();
    });
    on("ended", () => {
      clearTimeout(this.timer);
      if (!this.handover()) this.events.ended();
    });
    return deck;
  }

  private get playing(): Deck {
    return this.decks[this.active] as Deck;
  }

  private get idle(): Deck {
    return this.decks[1 - this.active] as Deck;
  }

  get element(): HTMLAudioElement {
    return this.playing.element;
  }

  /** Builds the Web Audio graph; browsers only allow it after a user gesture, so call this from play. */
  ensureGraph(): void {
    if (this.context) return;
    try {
      const context = new AudioContext();
      const master = context.createGain();
      master.connect(context.destination);
      const bus = context.createGain();
      // Peaking bands between a low shelf and a high shelf; all at 0 dB (a straight wire) until the equalizer is on.
      this.filters = BANDS.map((frequency, index) => {
        const filter = context.createBiquadFilter();
        filter.type = index === 0 ? "lowshelf" : index === BANDS.length - 1 ? "highshelf" : "peaking";
        filter.frequency.value = frequency;
        filter.Q.value = 1.1;
        return filter;
      });
      this.bus = bus;
      bus.connect(this.filters[0] as BiquadFilterNode);
      this.filters.reduce((from, to) => (from.connect(to), to)).connect(master);
      for (const deck of this.decks) {
        deck.gain = context.createGain();
        context.createMediaElementSource(deck.element).connect(deck.gain).connect(bus);
        this.setGain(deck, deck === this.playing ? deck.factor : 0);
        deck.element.volume = 1;
      }
      this.context = context;
      this.master = master;
      this.applyEq();
      this.applyVolume();
      void this.setSink(this.sinkId);
    } catch {
      this.context = null;
    }
    void this.context?.resume();
  }

  /** Set a deck's gain outright, dropping any fade still scheduled on it (a value set inside a curve would throw). */
  private setGain(deck: Deck, value: number): void {
    if (!deck.gain) return;
    deck.gain.gain.cancelScheduledValues(0);
    deck.gain.gain.value = value;
  }

  /** Whether a manual skip should fade out rather than cut (true while a crossfade is set). */
  setFadesSkips(on: boolean): void {
    this.fadesSkips = on;
  }

  /** The equalizer: on or off, and each band's gain in dB. Off is the same graph with every band at 0 dB. */
  setEq(on: boolean, gains: number[]): void {
    this.eq = { on, gains };
    this.applyEq();
  }

  private applyEq(): void {
    const { on, gains } = this.eq;
    const time = this.context?.currentTime ?? 0;
    for (const [index, filter] of this.filters.entries()) filter.gain.setTargetAtTime(on ? (gains[index] ?? 0) : 0, time, 0.01);
    this.bus?.gain.setTargetAtTime(on ? headroom(gains) : 1, time, 0.01);
  }

  /** Volume 0..1 (already 0 when muted). Through the master gain once the graph exists, else on the element. */
  setVolume(volume: number): void {
    this.volume = volume;
    this.applyVolume();
  }

  private applyVolume(): void {
    if (this.master) this.master.gain.value = this.volume;
    else for (const deck of this.decks) deck.element.volume = this.volume;
  }

  /** ReplayGain for the playing song (shuffle toggles can change album vs track gain mid-song). */
  setFactor(factor: number): void {
    this.playing.factor = factor;
    this.setGain(this.playing, factor);
  }

  async setSink(id: string): Promise<void> {
    this.sinkId = id;
    const target = (this.context ?? null) as { setSinkId?: (id: string) => Promise<void> } | null;
    if (target?.setSinkId) await target.setSinkId(id);
    else
      await Promise.all(
        this.decks.map((deck) => (deck.element as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }).setSinkId?.(id)),
      );
  }

  /**
   * Make `songId` the playing song. If the idle deck already holds it (preloaded), swap to it instead of loading, so
   * "next" is instant too.
   */
  load(songId: string, url: string, factor: number, startAt: number, autoplay: boolean): void {
    clearTimeout(this.timer);
    this.armed = null;
    let faded = false;
    // A preload that failed (silently: the idle deck doesn't report) is loaded afresh rather than handed the error.
    if (this.idle.songId === songId && this.idle.element.src && !this.idle.element.error) {
      const from = this.playing;
      this.active = 1 - this.active;
      const to = this.playing;
      // Skipping with a crossfade set: the old song fades out over 300 ms under the new one instead of being cut.
      if (this.fadesSkips && autoplay && !from.element.paused && from.gain && to.gain && this.context) {
        const { incoming, outgoing } = equalPower(factor, from.factor);
        const time = this.context.currentTime;
        from.gain.gain.cancelScheduledValues(time);
        from.gain.gain.setValueCurveAtTime(outgoing, time, SKIP_FADE_SECONDS);
        to.gain.gain.cancelScheduledValues(time);
        to.gain.gain.setValueCurveAtTime(incoming, time, SKIP_FADE_SECONDS);
        this.parkAfter(from, SKIP_FADE_SECONDS * 1000 + 50);
        faded = true;
      } else from.element.pause();
    } else {
      this.playing.element.pause();
      this.playing.songId = songId;
      this.playing.element.src = url;
    }
    const deck = this.playing;
    deck.factor = factor;
    if (!faded) {
      this.setGain(deck, factor);
      this.setGain(this.idle, 0);
    }
    this.events.duration(Number.isFinite(deck.element.duration) ? deck.element.duration : 0);
    if (startAt) {
      // Seeking before metadata is loaded is ignored by some browsers.
      if (deck.element.readyState >= HTMLMediaElement.HAVE_METADATA) deck.element.currentTime = startAt;
      else deck.element.addEventListener("loadedmetadata", () => (deck.element.currentTime = startAt), { once: true });
    } else if (deck.element.currentTime) deck.element.currentTime = 0;
    if (autoplay) void this.play();
  }

  /** Put the song that comes next into the idle deck (null clears it, e.g. at the end of the queue). */
  preload(songId: string | null, url: string | null, factor: number, startAt = 0, fade = 0): void {
    const wait = this.tailUntil - performance.now();
    if (wait > 0) {
      setTimeout(() => this.preload(songId, url, factor, startAt, fade), wait);
      return;
    }
    const idle = this.idle;
    if (idle.songId === songId) {
      idle.factor = factor;
      idle.fade = fade;
      return;
    }
    clearTimeout(this.timer);
    this.armed = null;
    idle.element.pause();
    idle.songId = songId;
    idle.factor = factor;
    idle.fade = fade;
    if (url) {
      idle.element.src = url;
      idle.element.load();
      // A trimmed song starts where you said (an intro skipped), also when it takes over gaplessly.
      if (startAt) idle.element.addEventListener("loadedmetadata", () => (idle.element.currentTime = startAt), { once: true });
    } else idle.element.removeAttribute("src");
  }

  /** Load the playing song again from `startAt` (stall recovery: a fresh request after the old one died). */
  reload(url: string, startAt: number): void {
    const deck = this.playing;
    deck.element.src = url;
    deck.element.addEventListener("loadedmetadata", () => (deck.element.currentTime = startAt), { once: true });
    void this.play().catch((error) => this.rejected(error));
  }

  /**
   * A refused play(). Interrupted by a newer load or a pause (AbortError) or blocked by autoplay rules
   * (NotAllowedError): nothing is broken. Only a real media error on the playing deck is reported.
   */
  private rejected(error: unknown): void {
    if (error instanceof DOMException && error.name !== "NotSupportedError") return;
    if (this.playing.element.error) this.events.error();
  }

  /** Why the playing deck failed, if it did. */
  get errorCode(): number | null {
    return this.playing.element.error?.code ?? null;
  }

  /** Ramp the master volume to `volume` over `seconds` (sleep timer fade). */
  fade(volume: number, seconds: number): Promise<void> {
    if (!this.master || !this.context) {
      this.setVolume(volume);
      return Promise.resolve();
    }
    const time = this.context.currentTime;
    this.master.gain.cancelScheduledValues(time);
    this.master.gain.setValueAtTime(this.master.gain.value, time);
    this.master.gain.linearRampToValueAtTime(volume, time + seconds);
    return new Promise((resolve) => setTimeout(resolve, seconds * 1000));
  }

  async play(): Promise<void> {
    this.ensureGraph();
    await this.playing.element.play();
  }

  pause(): void {
    clearTimeout(this.timer);
    this.armed = null;
    this.playing.element.pause();
  }

  seek(seconds: number): void {
    clearTimeout(this.timer);
    this.armed = null;
    this.playing.element.currentTime = seconds;
  }

  stop(): void {
    clearTimeout(this.timer);
    for (const deck of this.decks) {
      deck.element.pause();
      deck.element.removeAttribute("src");
      deck.songId = null;
    }
  }

  /** Called every frame by the engine's position ticker (timeupdate covers hidden tabs). */
  tick(): void {
    this.armHandover();
  }

  /** The crossfade the next takeover uses: what was lined up for it, no longer than half of either song. */
  private fadeNow(): number {
    return fitFade(this.idle.fade, this.playing.element.duration, this.idle.element.duration || Number.POSITIVE_INFINITY);
  }

  /** Arm a timer for the handover once the playing song is within ARM_SECONDS (plus the crossfade) of its end. */
  private armHandover(): void {
    const element = this.playing.element;
    const remaining = element.duration - element.currentTime;
    const fade = this.fadeNow();
    if (element.paused || !Number.isFinite(remaining) || remaining > ARM_SECONDS + fade || !this.idle.songId || this.armed === this.playing)
      return;
    clearTimeout(this.timer);
    this.armed = this.playing;
    const expected = this.playing;
    this.timer = setTimeout(
      () => {
        // The next song may still be loading (a crossfade starts early): ask again on the next frame, until it is
        // ready or the song ends and the plain path takes over.
        if (this.playing === expected && !this.handover()) this.armed = null;
      },
      Math.max(0, (remaining - LEAD_SECONDS - fade) * 1000),
    );
  }

  /** Let the old deck play out `milliseconds` (under the fade), then park it; `preload` waits until it has. */
  private parkAfter(from: Deck, milliseconds: number): void {
    this.tailUntil = performance.now() + milliseconds;
    setTimeout(() => {
      if (from !== this.playing) from.element.pause();
    }, milliseconds);
    from.songId = null;
  }

  /** Start the idle deck and swap roles. False when there's nothing ready to take over. */
  private handover(): boolean {
    const from = this.playing;
    const to = this.idle;
    if (!to.songId || to.element.readyState < HTMLMediaElement.HAVE_FUTURE_DATA) return false;
    const time = this.context?.currentTime ?? 0;
    // Only while the old song still has the fade left; a song that ended on its own hands over with the 5 ms ramp.
    const left = from.element.duration - from.element.currentTime;
    const fade = this.context && left > 0.05 ? Math.min(this.fadeNow(), left) : 0;
    if (to.gain && from.gain) {
      to.gain.gain.cancelScheduledValues(time);
      from.gain.gain.cancelScheduledValues(time);
      if (fade > RAMP_SECONDS) {
        const { incoming, outgoing } = equalPower(to.factor, from.factor);
        to.gain.gain.setValueCurveAtTime(incoming, time, fade);
        from.gain.gain.setValueCurveAtTime(outgoing, time, fade);
      } else {
        to.gain.gain.setValueAtTime(0, time);
        to.gain.gain.linearRampToValueAtTime(to.factor, time + RAMP_SECONDS);
        from.gain.gain.setValueAtTime(from.factor, time + LEAD_SECONDS);
        from.gain.gain.linearRampToValueAtTime(0, time + LEAD_SECONDS + RAMP_SECONDS);
      }
    }
    this.armed = null;
    this.active = 1 - this.active;
    void to.element.play().catch((error) => this.rejected(error));
    // Let the old song play out under the fade (or its last few milliseconds under the ramp), then park it.
    this.parkAfter(from, fade > RAMP_SECONDS ? fade * 1000 + 50 : (LEAD_SECONDS + RAMP_SECONDS) * 1000 + 50);
    this.events.handover();
    return true;
  }

  /** End of the buffered range around the playhead, in seconds. */
  buffered(): number {
    const element = this.playing.element;
    for (let i = 0; i < element.buffered.length; i += 1)
      if (element.buffered.start(i) <= element.currentTime + 0.5) {
        const end = element.buffered.end(i);
        if (end >= element.currentTime) return end;
      }
    return 0;
  }

  /**
   * Whether the playing song is far enough ahead that downloading the next ones can't starve it: `seconds` past the
   * playhead (or the rest of the song) are actually buffered, or the browser has stopped downloading it by itself
   * (`suspend`: idle network with enough data), so nothing would compete. `HAVE_ENOUGH_DATA` alone isn't enough: it's
   * the browser's guess at the current download rate, which another download would change.
   */
  bufferedAhead(seconds: number): boolean {
    const element = this.playing.element;
    if (element.networkState === HTMLMediaElement.NETWORK_IDLE && element.readyState >= HTMLMediaElement.HAVE_ENOUGH_DATA) return true;
    const end = this.buffered();
    return end - element.currentTime >= seconds || (element.duration > 0 && end >= element.duration - 0.5);
  }

  get preloadedId(): string | null {
    return this.idle.songId;
  }
}
