/**
 * SceneView — the per-scene surface.
 *
 * With a real clip (`scene.src`, public-relative) it decodes the footage with
 * <OffthreadVideo> — the ad-render-safe path (no <video> flakiness in headless
 * Chromium) — cropped to fill 9:16, trimmed to `scene.inFrame`, and muted when
 * the scene's recorded audio is unusable (B-roll). Without a clip it falls back
 * to a labelled animated placeholder so Studio previews still read as scenes.
 * Captions, callouts and transitions layer on top elsewhere.
 */

import React from "react";
import {
  AbsoluteFill,
  OffthreadVideo,
  interpolate,
  staticFile,
  useCurrentFrame,
} from "remotion";
import type { Scene } from "../types.js";

export const SceneView: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame(); // sequence-relative (0 at scene start)

  if (scene.src) {
    return (
      <AbsoluteFill style={{ backgroundColor: "#000" }}>
        <OffthreadVideo
          src={staticFile(scene.src)}
          startFrom={scene.inFrame || 0}
          muted={scene.muteClipAudio === true}
          style={{ width: "100%", height: "100%", objectFit: "cover" }}
        />
      </AbsoluteFill>
    );
  }

  // --- Placeholder (no footage): energy-driven gradient with scene labels. ---
  const speed = 0.5 + scene.energy * 2.5;
  const angle = (frame * speed) % 360;
  const wobble = interpolate(Math.sin(frame / 18), [-1, 1], [0, 55]);
  const hueA = 220 + wobble;
  const hueB = 320 - wobble;

  return (
    <AbsoluteFill
      style={{
        background: `linear-gradient(${angle}deg, hsl(${hueA} 68% 22%), hsl(${hueB} 62% 13%))`,
        color: "#fff",
        fontFamily: "Inter, system-ui, sans-serif",
        alignItems: "center",
        justifyContent: "center",
        padding: 64,
      }}
    >
      <div style={{ textAlign: "center", maxWidth: "80%" }}>
        <div style={{ fontSize: 30, opacity: 0.7, letterSpacing: "0.14em" }}>
          {scene.clipId.toUpperCase()}
        </div>
        <div style={{ marginTop: 18, fontSize: 52, fontWeight: 800, lineHeight: 1.1, letterSpacing: "-0.02em" }}>
          {scene.purpose}
        </div>
        <div style={{ marginTop: 28, display: "inline-block", padding: "8px 18px", borderRadius: 999, background: "rgba(255,255,255,0.14)", fontSize: 26, fontWeight: 700 }}>
          energy {scene.energy.toFixed(2)}
        </div>
      </div>
    </AbsoluteFill>
  );
};
