import { Video } from "@remotion/media";
import type { ReactNode } from "react";
import { AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame } from "remotion";
import { Ambient } from "./ambient";
import events from "./session.json";
import { BG, clamp, EASE_CAMERA, EASE_OUT, FG, FPS, LINE, MONO, useBox } from "./theme";

type Event =
  | { kind: "move"; t0: number; t1: number; from: { x: number; y: number }; to: { x: number; y: number } }
  | { kind: "click"; t: number; at: { x: number; y: number }; button: "left" | "right" }
  | { kind: "key"; t: number; label: string };

export const EVENTS = events as Event[];

/** The screen sits in a rounded frame with room around it, so the camera has somewhere to move. */

export interface View {
  t: number;
  x: number;
  y: number;
  z: number;
}

function viewAt(keys: View[], t: number): View {
  const first = keys[0] as View;
  if (t <= first.t) return first;
  for (let i = 1; i < keys.length; i += 1) {
    const to = keys[i] as View;
    const from = keys[i - 1] as View;
    if (t <= to.t) {
      const e = to.t === from.t ? 1 : EASE_CAMERA((t - from.t) / (to.t - from.t));
      return { t, x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e, z: from.z + (to.z - from.z) * e };
    }
  }
  return keys[keys.length - 1] as View;
}

const ease = (p: number) => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2);

/** Where the cursor was at a moment of the recording: the same glides the recorder performed. */
function cursorAt(t: number): { x: number; y: number } {
  let at = { x: 1500, y: 760 };
  for (const event of EVENTS) {
    if (event.kind !== "move") continue;
    if (t >= event.t1) at = event.to;
    else if (t >= event.t0) {
      const e = ease((t - event.t0) / (event.t1 - event.t0));
      return { x: event.from.x + (event.to.x - event.from.x) * e, y: event.from.y + (event.to.y - event.from.y) * e };
    }
  }
  return at;
}

/**
 * A stretch of the recorded session, post-produced: the recording in the frame, a camera that eases between the views in
 * `cam` (times are seconds into the recording), our own cursor, a ripple on every click and a key hint on shortcuts.
 */
/** A part of the screen to light while the rest dims: `rect` is in screen pixels (1920x1080), `from` and `to` are seconds into the recording. */
export interface Spot {
  rect: { x: number; y: number; w: number; h: number };
  from: number;
  to: number;
}

/** A ring on something in the recording with a label on a leader line. `x` and `y` are recording pixels; `dx` and `dy` place the label from the ring in screen pixels. */
export interface Callout {
  x: number;
  y: number;
  r: number;
  label: string;
  dx: number;
  dy: number;
  from: number;
  to: number;
}

/** The hero cover lifting out of a row and flying to a spot: both ends are recording pixels, times are seconds into the recording. */
export interface Flight {
  from: { x: number; y: number; size: number };
  to: { x: number; y: number; size: number };
  at: number;
  length: number;
}

export function Session({
  from,
  cam,
  rate = 1,
  enter = false,
  spot,
  callouts = [],
  flight,
  fadeIn = 0,
  glow,
  children,
}: {
  from: number;
  cam: View[];
  rate?: number;
  enter?: boolean;
  spot?: Spot;
  callouts?: Callout[];
  flight?: Flight;
  /** Frames to fade in over, for a crossfade from the cut before it. */
  fadeIn?: number;
  glow?: [number, number];
  children?: ReactNode;
}) {
  const frame = useCurrentFrame();
  const t = from + (frame / FPS) * rate;
  const FRAME = useBox();
  const cover = Math.max(FRAME.w / 1920, FRAME.h / 1080);
  const view = viewAt(cam, t);
  // A narrow portrait crop would slice text at the edges, so the same moves are softened.
  const scale = cover * (FRAME.portrait ? Math.max(1, view.z * 0.66) : view.z);
  const tx = Math.min(0, Math.max(FRAME.w - 1920 * scale, FRAME.w / 2 - view.x * scale));
  const ty = Math.min(0, Math.max(FRAME.h - 1080 * scale, FRAME.h / 2 - view.y * scale));
  const cursor = cursorAt(t);
  const screen = { x: tx + cursor.x * scale, y: ty + cursor.y * scale };
  const intro = enter ? interpolate(frame, [0, 24], [0, 1], clamp) : 1;
  const shown = EVENTS.filter(
    (event): event is Extract<Event, { kind: "key" }> =>
      event.kind === "key" && (event.label === "y" || event.label === "q") && t >= event.t && t < event.t + 1.6,
  );
  return (
    <AbsoluteFill style={{ background: BG, opacity: fadeIn ? interpolate(frame, [0, fadeIn], [0, 1], clamp) : 1 }}>
      <Ambient hues={glow} />
      <div
        style={{
          position: "absolute",
          left: FRAME.x,
          top: FRAME.y,
          width: FRAME.w,
          height: FRAME.h,
          borderRadius: 14,
          overflow: "hidden",
          border: `1px solid ${LINE}`,
          boxShadow: "0 50px 140px rgba(0,0,0,.65), 0 0 0 1px rgba(0,0,0,.6)",
          background: "#0e0f10",
          opacity: intro,
          transform: `scale(${0.97 + intro * 0.03})`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: 1920,
            height: 1080,
            transformOrigin: "0 0",
            transform: `translate(${tx}px, ${ty}px) scale(${scale})`,
          }}
        >
          <Video
            src={staticFile("clips/session.mp4")}
            trimBefore={Math.round(from * FPS)}
            playbackRate={rate}
            muted
            style={{ width: 1920, height: 1080 }}
          />
        </div>
        {spot && (
          <div
            style={{
              position: "absolute",
              left: tx + spot.rect.x * scale,
              top: ty + spot.rect.y * scale,
              width: spot.rect.w * scale,
              height: spot.rect.h * scale,
              borderRadius: 10,
              boxShadow: "0 0 0 4000px rgba(8,9,10,0.7)",
              opacity: interpolate(t, [spot.from, spot.from + 0.7, spot.to - 0.4, spot.to], [0, 1, 1, 0], clamp),
              pointerEvents: "none",
            }}
          />
        )}
        {callouts.map((callout) => {
          const p = EASE_OUT(interpolate(t, [callout.from, callout.from + 0.5], [0, 1], clamp));
          const out = interpolate(t, [callout.to - 0.35, callout.to], [1, 0], clamp);
          if (t < callout.from || t > callout.to) return null;
          const cx = tx + callout.x * scale;
          const cy = ty + callout.y * scale;
          const r = callout.r * scale;
          const lx = cx + callout.dx;
          const ly = cy + callout.dy;
          return (
            <div key={callout.label} style={{ position: "absolute", inset: 0, pointerEvents: "none", opacity: p * out }}>
              <svg
                role="img"
                aria-label={callout.label}
                width={FRAME.w}
                height={FRAME.h}
                style={{ position: "absolute", left: 0, top: 0, overflow: "visible" }}
              >
                <title>{callout.label}</title>
                <circle
                  cx={cx}
                  cy={cy}
                  r={r * (0.6 + 0.4 * p)}
                  fill="rgba(255,255,255,0.06)"
                  stroke="rgba(255,255,255,0.9)"
                  strokeWidth={2.5}
                />
                <line
                  x1={cx + Math.sign(callout.dx) * r * 0.72}
                  y1={cy + Math.sign(callout.dy) * r * 0.72}
                  x2={cx + (lx - cx) * p}
                  y2={cy + (ly - cy) * p}
                  stroke="rgba(255,255,255,0.85)"
                  strokeWidth={2}
                />
              </svg>
              <span
                style={{
                  position: "absolute",
                  left: lx,
                  top: ly,
                  transform: `translate(${callout.dx < 0 ? "-100%" : "0"}, -50%)`,
                  padding: "9px 18px",
                  borderRadius: 999,
                  background: FG,
                  color: "#0a0a0a",
                  fontFamily: MONO,
                  fontWeight: 600,
                  fontSize: 24,
                  whiteSpace: "nowrap",
                  boxShadow: "0 10px 30px rgba(0,0,0,.45)",
                }}
              >
                {callout.label}
              </span>
            </div>
          );
        })}
        {flight &&
          t >= flight.at &&
          t <= flight.at + flight.length &&
          (() => {
            const p = EASE_OUT((t - flight.at) / flight.length);
            const lift = Math.sin(p * Math.PI) * 120;
            const x = flight.from.x + (flight.to.x - flight.from.x) * p;
            const y = flight.from.y + (flight.to.y - flight.from.y) * p - lift;
            const size = (flight.from.size + (flight.to.size - flight.from.size) * p) * scale * (1 + Math.sin(p * Math.PI) * 1.6);
            return (
              <Img
                src={staticFile("shots/cover.svg")}
                style={{
                  position: "absolute",
                  left: tx + x * scale - size / 2,
                  top: ty + y * scale - size / 2,
                  width: size,
                  height: size,
                  borderRadius: 8,
                  boxShadow: `0 ${18 + lift / 4}px ${40 + lift / 2}px rgba(0,0,0,.55)`,
                  opacity: interpolate(p, [0, 0.08, 0.92, 1], [0, 1, 1, 0], clamp),
                }}
              />
            );
          })()}
        {EVENTS.map((event) => {
          if (event.kind !== "click" || t < event.t || t > event.t + 0.5) return null;
          const p = (t - event.t) / 0.5;
          return (
            <span
              key={event.t}
              style={{
                position: "absolute",
                left: tx + event.at.x * scale - 30 * p - 8,
                top: ty + event.at.y * scale - 30 * p - 8,
                width: 60 * p + 16,
                height: 60 * p + 16,
                borderRadius: 999,
                border: "2px solid rgba(255,255,255,.85)",
                opacity: (1 - p) ** 1.5,
              }}
            />
          );
        })}
        <svg
          role="img"
          aria-label="cursor"
          width="30"
          height="38"
          viewBox="0 0 38 46"
          style={{ position: "absolute", left: screen.x - 4, top: screen.y - 3, filter: "drop-shadow(0 3px 6px rgba(0,0,0,.55))" }}
        >
          <title>cursor</title>
          <path
            d="M4 3 L4 36 L12 28 L18 42 L24 39.5 L18 26 L30 26 Z"
            fill="white"
            stroke="#0a0a0a"
            strokeWidth="2.5"
            strokeLinejoin="round"
          />
        </svg>
        {shown.map((event) => (
          <span
            key={event.t}
            style={{
              position: "absolute",
              right: 30,
              bottom: 30,
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "10px 18px 10px 14px",
              borderRadius: 12,
              background: "rgba(14,15,16,.9)",
              border: `1px solid ${LINE}`,
              fontFamily: MONO,
              fontSize: 24,
              color: "#f7f8f8",
              opacity: interpolate(t - event.t, [0, 0.15, 1.3, 1.6], [0, 1, 1, 0], clamp),
            }}
          >
            <span
              style={{
                display: "grid",
                placeItems: "center",
                width: 38,
                height: 38,
                borderRadius: 8,
                background: "#26282c",
                boxShadow: "0 3px 0 #08090a",
                fontWeight: 700,
              }}
            >
              {event.label.toUpperCase()}
            </span>
            {event.label === "y" ? "lyrics" : "queue"}
          </span>
        ))}
      </div>
      {children}
    </AbsoluteFill>
  );
}
