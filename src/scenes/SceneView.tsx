/**
 * SceneView — the per-scene surface.
 *
 * Raw clip files don't live in the repo, so in Studio a scene renders as a
 * labelled placeholder: an animated gradient (angle + hue driven by
 * `useCurrentFrame`, speed scaled by `scene.energy`) with the scene's purpose,
 * clip id and energy printed on top. It reads as a real scene so previews and
 * caption/transition timing can be judged without footage.
 *
 * In production the placeholder is replaced by the decoded clip:
 *   <OffthreadVideo src={clipSrc(scene.clipId)} startFrom={scene.inFrame} />
 * (OffthreadVideo is the ad-render-safe path — no <video> flakiness in headless
 * Chromium). Everything else — captions, callouts, transitions — layers on top.
 */

import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame } from "remotion";
import type { Scene } from "../types.js";

export const SceneView: React.FC<{ scene: Scene }> = ({ scene }) => {
  const frame = useCurrentFrame(); // sequence-relative (0 at scene start)

  // energy → motion: hotter scenes churn the gradient faster.
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
      {/* PRODUCCIÓN: sustituir este bloque por <OffthreadVideo .../> (ver cabecera). */}
      <div style={{ textAlign: "center", maxWidth: "80%" }}>
        <div style={{ fontSize: 30, opacity: 0.7, letterSpacing: "0.14em" }}>
          {scene.clipId.toUpperCase()}
        </div>
        <div
          style={{
            marginTop: 18,
            fontSize: 52,
            fontWeight: 800,
            lineHeight: 1.1,
            letterSpacing: "-0.02em",
          }}
        >
          {scene.purpose}
        </div>
        <div
          style={{
            marginTop: 28,
            display: "inline-block",
            padding: "8px 18px",
            borderRadius: 999,
            background: "rgba(255,255,255,0.14)",
            fontSize: 26,
            fontWeight: 700,
          }}
        >
          energy {scene.energy.toFixed(2)}
        </div>
      </div>
    </AbsoluteFill>
  );
};
