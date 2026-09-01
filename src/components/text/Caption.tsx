/**
 * Caption (Module 3 render) — one CaptionBlock, presentation-only.
 *
 * The caption IS the product: karaoke highlight walks word-by-word off
 * `wordFrames`, the single `emphasised` token gets the accent colour + a
 * `spring` pop, and contrast is guaranteed by an outline and/or plate so the
 * words survive over any footage. Frames are composition-relative (the layer
 * mounts at composition level), so `useCurrentFrame()` here is the master
 * frame — entrance is measured from `block.startFrame`.
 *
 * Styling comes entirely from a BrandCaptionsProfile (a small default below).
 */

import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type {
  BrandCaptionsProfile,
  CaptionBlock,
  CaptionLevel,
} from "../../types.js";

/** Small, safe default so Studio renders without a real brand profile. */
export const DEFAULT_CAPTIONS_PROFILE: BrandCaptionsProfile = {
  h1Font: "Inter, system-ui, sans-serif",
  h2Font: "Inter, system-ui, sans-serif",
  baseFont: "Inter, system-ui, sans-serif",
  accentColor: "#FF2D7E",
  highlightColor: "#FFD400",
  baseTextColor: "#FFFFFF",
  outlineColor: "#0A0A0A",
  contrastStrategy: "both",
  diacriticsVerified: true,
};

/** Typographic level → font size (px, master 1080-wide canvas). */
const LEVEL_SIZE: Record<CaptionLevel, number> = { H1: 96, H2: 68, base: 48 };

/** 8-direction hard outline; the cheap, compression-proof contrast trick. */
const outlineShadow = (color: string, px = 3): string => {
  const dirs: [number, number][] = [
    [px, px], [-px, -px], [px, -px], [-px, px],
    [px, 0], [-px, 0], [0, px], [0, -px],
  ];
  return dirs.map(([x, y]) => `${x}px ${y}px 0 ${color}`).join(", ");
};

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const Caption: React.FC<{
  block: CaptionBlock;
  profile?: BrandCaptionsProfile;
}> = ({ block, profile = DEFAULT_CAPTIONS_PROFILE }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const since = frame - block.startFrame;

  // --- block-level entrance --------------------------------------------------
  let opacity = 1;
  let translateY = 0;
  let containerScale = 1;
  switch (block.entrance) {
    case "fade":
      opacity = interpolate(since, [0, 8], [0, 1], clamp);
      break;
    case "pop":
      containerScale = spring({
        frame: since,
        fps,
        config: { damping: 14, stiffness: 180, mass: 0.7 },
      });
      opacity = interpolate(since, [0, 4], [0, 1], clamp);
      break;
    case "slide-up": {
      const s = spring({ frame: since, fps, config: { damping: 18 } });
      translateY = interpolate(s, [0, 1], [40, 0]);
      opacity = interpolate(since, [0, 6], [0, 1], clamp);
      break;
    }
    case "typewriter":
      // reveal is per-word below; container stays put.
      break;
  }

  const useOutline = profile.contrastStrategy !== "plate";
  const usePlate = profile.contrastStrategy !== "outline";
  const font =
    block.level === "H1"
      ? profile.h1Font
      : block.level === "H2"
        ? profile.h2Font
        : profile.baseFont;

  return (
    <div
      style={{
        position: "absolute",
        left: `${block.anchor.x * 100}%`,
        top: `${block.anchor.y * 100}%`,
        transform: `translate(-50%, -50%) translateY(${translateY}px) scale(${containerScale})`,
        opacity,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
        alignItems: "baseline",
        gap: "0.28em",
        width: "84%",
        textAlign: "center",
        fontFamily: font,
        fontSize: LEVEL_SIZE[block.level],
        fontWeight: 800,
        lineHeight: 1.05,
        letterSpacing: "-0.01em",
        ...(usePlate
          ? {
              padding: "0.18em 0.42em",
              borderRadius: 18,
              background: "rgba(0,0,0,0.42)",
              backdropFilter: "blur(2px)",
            }
          : {}),
      }}
    >
      {block.wordFrames.map((wf, i) => {
        const token = block.tokens[i]; // guard: noUncheckedIndexedAccess
        const emph = token?.emphasised ?? false;
        const spoken = frame >= wf.startFrame;

        // karaoke: base → highlight when spoken; the emphasised word → accent.
        const color = emph
          ? spoken
            ? profile.accentColor
            : profile.baseTextColor
          : spoken
            ? profile.highlightColor
            : profile.baseTextColor;

        // emphasised token pops on its own onset (spring clamps pre-onset to 0).
        const pop = emph
          ? spring({
              frame: frame - wf.startFrame,
              fps,
              config: { damping: 12, stiffness: 220, mass: 0.6 },
              durationInFrames: 14,
            })
          : 0;
        const wordScale = 1 + 0.2 * pop;

        // typewriter hides unspoken words while preserving layout width.
        const wordOpacity =
          block.entrance === "typewriter" ? (spoken ? 1 : 0) : 1;

        return (
          <span
            key={`${block.id}-${i}`}
            style={{
              display: "inline-block",
              color,
              opacity: wordOpacity,
              transform: `scale(${wordScale})`,
              transformOrigin: "center bottom",
              textShadow: useOutline
                ? outlineShadow(profile.outlineColor)
                : "none",
              transition: "none",
            }}
          >
            {wf.text}
          </span>
        );
      })}
    </div>
  );
};
