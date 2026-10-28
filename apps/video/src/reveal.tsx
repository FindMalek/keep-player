import { useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { useEffect, useMemo, useState } from "react";
import { AbsoluteFill, continueRender, delayRender, Easing, Img, interpolate, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import type { CanvasTexture } from "three";
import { Ambient } from "./ambient";
import { showcaseTextures } from "./cover-art";
import { BG, clamp, EASE_OUT, FG, FPS, LINE, MONO, MUTED, SANS, useBox } from "./theme";

const FOV = 50;
const APP_Z = -120;
const COVERS = 340;
const LAND = 3.2; // seconds: the camera has landed square on the app
const SETTLE = 4; // seconds: the app has settled into the frame the next shot uses

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

/** A canyon of real sleeve art, seeded so every frame sees the same field. */
function useField(textures: CanvasTexture[]) {
  return useMemo(() => {
    const rand = random(7);
    const covers = Array.from({ length: COVERS }, () => {
      const angle = rand() * Math.PI * 2;
      const z = -rand() * 112;
      // Near the app the field opens up, so the last stretch of the flight stays clear.
      const radius = 3.6 + rand() ** 1.4 * 9 + (z < -92 ? 7 : 0);
      return {
        x: Math.cos(angle) * radius * 1.35,
        y: Math.sin(angle) * radius * 0.8,
        z,
        size: 2.4 + rand() * 2.2,
        rotY: (rand() - 0.5) * 0.9,
        rotZ: (rand() - 0.5) * 0.22,
        texture: textures[Math.floor(rand() * textures.length)],
      };
    });
    const dust = new Float32Array(600 * 3);
    for (let i = 0; i < 600; i += 1) {
      dust[i * 3] = (rand() - 0.5) * 36;
      dust[i * 3 + 1] = (rand() - 0.5) * 22;
      dust[i * 3 + 2] = -rand() * 118;
    }
    return { covers, dust };
  }, [textures]);
}

/** The camera punches off the impact and brakes into the app: fast at first, then easing to a stop square on it. */
function cameraAt(t: number, appFit: number) {
  const progress = interpolate(t, [0, LAND], [0, 1], { ...clamp, easing: Easing.bezier(0.12, 0.65, 0.2, 1) });
  const live = 1 - interpolate(t, [LAND - 1.1, LAND], [0, 1], { ...clamp, easing: Easing.bezier(0.5, 0, 0.2, 1) });
  return {
    x: Math.sin(t * 1.6) * 0.9 * live,
    y: Math.cos(t * 2.1) * 0.6 * live,
    z: 10 + (APP_Z + appFit - 10) * progress,
    roll: Math.sin(t * 2.4) * 0.07 * live,
    fov: FOV + Math.exp(-t * 3) * 6 * live,
  };
}

function Flight({ appFit, textures }: { appFit: number; textures: CanvasTexture[] }) {
  const t = useCurrentFrame() / FPS;
  const camera = useThree((state) => state.camera);
  const { covers, dust } = useField(textures);
  const state = cameraAt(t, appFit);
  const cam = camera as unknown as {
    position: { set: (x: number, y: number, z: number) => void };
    rotation: { z: number };
    fov: number;
    updateProjectionMatrix: () => void;
  };
  cam.position.set(state.x, state.y, state.z);
  cam.rotation.z = state.roll;
  cam.fov = state.fov;
  cam.updateProjectionMatrix();
  return (
    <>
      <color attach="background" args={["#08090a"]} />
      <fog attach="fog" args={["#08090a", 30, 112]} />
      {covers.map((cover) => (
        <mesh key={`${cover.x}:${cover.y}:${cover.z}`} position={[cover.x, cover.y, cover.z]} rotation={[0, cover.rotY, cover.rotZ]}>
          <planeGeometry args={[cover.size, cover.size]} />
          <meshBasicMaterial map={cover.texture} toneMapped={false} />
        </mesh>
      ))}
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[dust, 3]} />
        </bufferGeometry>
        <pointsMaterial size={0.07} color="#ffffff" transparent opacity={0.7} sizeAttenuation />
      </points>
    </>
  );
}

/** The sleeve art, loaded in the DOM tree (a three.js tree mounts too late for the render to wait on it). */
function useCovers(): CanvasTexture[] {
  const [covers, setCovers] = useState<CanvasTexture[]>([]);
  const [handle] = useState(() => delayRender("loading sleeve art"));
  useEffect(() => {
    showcaseTextures()
      .then(setCovers)
      .finally(() => requestAnimationFrame(() => requestAnimationFrame(() => continueRender(handle))));
  }, [handle]);
  return covers;
}

/**
 * The reveal. The impact lands on frame 0 and the camera punches through a canyon of the library's own sleeve art, the name
 * flying through with it, then brakes square onto the app, which settles into the frame the first shot starts from.
 */
export function Reveal() {
  const covers = useCovers();
  const frame = useCurrentFrame();
  const t = frame / FPS;
  const { width, height } = useVideoConfig();
  const box = useBox();
  const fit = Math.max(4.5 / Math.tan((FOV / 2) * (Math.PI / 180)), 8 / (Math.tan((FOV / 2) * (Math.PI / 180)) * (width / height)));
  const cam = cameraAt(t, fit);
  const px = height / 2 / Math.tan((cam.fov / 2) * (Math.PI / 180));
  const unit = px / (cam.z - APP_Z);
  // The app is a 16:9 plane at the end of the canyon, drawn as a layer at the size and spot the camera would see it.
  const appOpacity = interpolate(cam.z - APP_Z, [56, 78], [1, 0], clamp);
  const settle = EASE_OUT(interpolate(t, [LAND, SETTLE], [0, 1], clamp));
  const flare = interpolate(t, [0, 0.1, 1.3], [0, 1, 0], clamp);
  const exit = interpolate(t, [1.5, 2.4], [0, 1], { ...clamp, easing: Easing.bezier(0.7, 0, 1, 0.6) });
  const rise = (at: number) => EASE_OUT(interpolate(t, [at, at + 0.7], [0, 1], clamp));
  const canvasOpacity = 1 - interpolate(t, [LAND, LAND + 0.4], [0, 1], clamp);
  // The landed app settles into the frame the next shot uses (a crop of it, in portrait).
  const flight = {
    left: width / 2 - 8 * unit - cam.x * unit,
    top: height / 2 - 4.5 * unit + cam.y * unit,
    width: 16 * unit,
    height: 9 * unit,
  };
  const landed = {
    left: flight.left + (box.x - flight.left) * settle,
    top: flight.top + (box.y - flight.top) * settle,
    width: flight.width + (box.w - flight.width) * settle,
    height: flight.height + (box.h - flight.height) * settle,
    opacity: appOpacity,
  };
  const size = (box.portrait ? 126 : 230) * (box.portrait ? 1 : 1);
  const letters = "keep music".split("");
  return (
    <AbsoluteFill style={{ background: BG }}>
      <Ambient hues={[18, 285]} level={1.3} />
      <AbsoluteFill style={{ opacity: canvasOpacity }}>
        <ThreeCanvas width={width} height={height} camera={{ fov: FOV, position: [0, 0, 10], near: 0.1, far: 300 }}>
          <Flight appFit={fit} textures={covers} />
        </ThreeCanvas>
      </AbsoluteFill>
      <Img
        src={staticFile("shots/home.jpg")}
        style={{
          position: "absolute",
          ...landed,
          rotate: `${cam.roll * (1 - settle)}rad`,
          borderRadius: 14 * settle,
          border: settle > 0.02 ? `1px solid ${LINE}` : "none",
          boxShadow: `0 ${50 * settle}px ${140 * settle}px rgba(0,0,0,.65)`,
          objectFit: "cover",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "-10%",
          right: "-10%",
          top: "46%",
          height: 6,
          background: "linear-gradient(90deg, transparent, #fff 30%, #fff 70%, transparent)",
          boxShadow: "0 0 70px 18px rgba(255,255,255,.7), 0 0 240px 60px rgba(255,150,90,.5)",
          transform: `scaleX(${EASE_OUT(interpolate(t, [0, 0.6], [0.1, 1.2], clamp))})`,
          opacity: flare,
        }}
      />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          opacity: 1 - exit,
          transform: `scale(${1 + exit * 2.2})`,
          filter: `blur(${exit * 22}px)`,
        }}
      >
        <div
          style={{
            display: "flex",
            fontFamily: SANS,
            fontWeight: 700,
            fontSize: size,
            color: FG,
            letterSpacing: -size * 0.04,
            textShadow: "0 8px 80px rgba(0,0,0,.75)",
          }}
        >
          {letters.map((letter, index) => {
            const p = rise(0.25 + index * 0.05);
            return (
              <span
                // biome-ignore lint/suspicious/noArrayIndexKey: the letters of a fixed title
                key={index}
                style={{
                  display: "inline-block",
                  whiteSpace: "pre",
                  transform: `translateY(${(1 - p) * 120}px) rotate(${(1 - p) * 8}deg)`,
                  opacity: p,
                }}
              >
                {letter}
              </span>
            );
          })}
        </div>
        <div style={{ marginTop: 18, fontFamily: MONO, fontSize: box.portrait ? 30 : 38, color: MUTED, opacity: rise(0.9) }}>
          Spotify, for music you own.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
