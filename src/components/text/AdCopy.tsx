/**
 * AdCopy — designed advertising copy, NOT karaoke subtitles.
 *
 * Renders a CopyBlock as a layered headline (mixed fonts/sizes/italics, one key
 * word in the brand accent), over negative space, with a soft drop shadow + thin
 * outline for contrast — never a black plate. Matches the brand's Reels copy
 * style (elegant serif + sans, coloured hero word, top/negative-space placement).
 */
import React from "react";
import {
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { BrandCaptionsProfile, CopyBlock, CopyLine } from "../../types.js";

const SIZE: Record<CopyLine["size"], number> = { xl: 116, lg: 86, md: 58, sm: 42 };

/**
 * A hand-drawn marker ellipse that wraps its parent, in the brand accent colour,
 * animated to "draw on" (a Salomé copy treatment for a hero word/number). The
 * path overshoots its start so it reads as a quick marker loop, not a perfect
 * vector ellipse.
 */
const HandCircle: React.FC<{ color: string; progress: number }> = ({ color, progress }) => (
  <svg
    viewBox="0 0 200 100"
    preserveAspectRatio="none"
    style={{ position: "absolute", left: "-11%", top: "-16%", width: "122%", height: "132%", pointerEvents: "none", overflow: "visible" }}
  >
    <path
      d="M104 8 C40 4 8 30 10 54 C12 82 74 96 122 92 C176 88 196 60 188 38 C181 18 138 6 96 9"
      fill="none"
      stroke={color}
      strokeWidth={4.5}
      strokeLinecap="round"
      pathLength={1}
      strokeDasharray={1}
      strokeDashoffset={1 - Math.max(0, Math.min(1, progress))}
    />
  </svg>
);

/** Soft, legible contrast without a box: thin dark outline + a drop shadow. */
function copyShadow(outline: string): string {
  const o = 2.5;
  const ring = [
    [o, o], [-o, -o], [o, -o], [-o, o], [o, 0], [-o, 0], [0, o], [0, -o],
  ]
    .map(([x, y]) => `${x}px ${y}px 0 ${outline}`)
    .join(", ");
  return `${ring}, 0 6px 18px rgba(0,0,0,0.45)`;
}

export const AdCopy: React.FC<{
  block: CopyBlock;
  profile: BrandCaptionsProfile;
}> = ({ block, profile }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const fam = (f: CopyLine["font"]) =>
    f === "display" ? profile.h1Font : f === "body" ? profile.baseFont : profile.scriptFont ?? profile.h1Font;
  const col = (c: CopyLine["color"]) =>
    c === "accent" ? profile.accentColor : c === "highlight" ? profile.highlightColor : profile.baseTextColor;

  // Entrance: fade + rise (or spring pop), settles quickly then holds.
  const inN = block.entrance === "pop"
    ? spring({ frame, fps, config: { damping: 14, stiffness: 200, mass: 0.7 }, durationInFrames: 16 })
    : interpolate(frame, [0, 10], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  const rise = block.entrance === "fade-up" ? interpolate(inN, [0, 1], [26, 0]) : 0;
  const scale = block.entrance === "pop" ? 0.9 + 0.1 * inN : 1;

  const shadow = copyShadow(profile.outlineColor);

  return (
    <div
      style={{
        position: "absolute",
        left: `${block.anchor.x * 100}%`,
        top: `${block.anchor.y * 100}%`,
        transform: `translate(${block.align === "center" ? "-50%" : "0"}, 0) translateY(${rise}px) scale(${scale})`,
        transformOrigin: block.align === "center" ? "center top" : "left top",
        width: "88%",
        maxWidth: block.align === "center" ? "88%" : "72%",
        textAlign: block.align,
        opacity: inN,
        lineHeight: 1.02,
        pointerEvents: "none",
      }}
    >
      {block.lines.map((ln, i) => {
        const content = ln.accentWord
          ? highlightWord(ln.text, ln.accentWord, profile.accentColor)
          : ln.text;
        const inner = ln.highlight === "circle" ? (
          <span style={{ position: "relative", display: "inline-block", padding: "0 0.12em" }}>
            <HandCircle color={profile.accentColor} progress={interpolate(frame, [5, 22], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })} />
            <span style={{ position: "relative" }}>{content}</span>
          </span>
        ) : content;
        return (
          <div
            key={i}
            style={{
              fontFamily: fam(ln.font),
              fontSize: SIZE[ln.size],
              fontWeight: ln.weight ?? (ln.font === "display" ? 800 : ln.font === "script" ? 700 : 600),
              fontStyle: ln.italic ? "italic" : "normal",
              color: col(ln.color),
              textShadow: shadow,
              letterSpacing: ln.font === "display" ? "-0.02em" : "0",
              marginTop: i === 0 ? 0 : "0.04em",
            }}
          >
            {inner}
          </div>
        );
      })}
    </div>
  );
};

/** Paint a single word inside a line with the accent colour. */
function highlightWord(text: string, word: string, accent: string): React.ReactNode {
  const parts = text.split(new RegExp(`(\\b${word}\\b)`, "i"));
  return parts.map((p, i) =>
    p.toLowerCase() === word.toLowerCase()
      ? <span key={i} style={{ color: accent }}>{p}</span>
      : <React.Fragment key={i}>{p}</React.Fragment>,
  );
}
