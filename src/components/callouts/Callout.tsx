/**
 * Callout (Module 9 render) — a spring-in badge/pill.
 *
 * A pattern-interrupt micro-event: a price tag, a "NUEVO" flag, a stat pop
 * dropped on the timeline to reset attention at a known drop-off. Overshoots
 * on entry, settles, then can be un-mounted by its wrapping <Sequence>.
 * Presentation-only; the parent decides when and where it fires.
 */

import React from "react";
import { interpolate, spring, useCurrentFrame, useVideoConfig } from "remotion";
import type { Hex } from "../../types.js";

export const Callout: React.FC<{
  label: string;
  sublabel?: string;
  /** Pill fill + text colours (brand-driven). */
  bg?: Hex;
  fg?: Hex;
  /** Normalised anchor on the frame. */
  anchor?: { x: number; y: number };
  /** Frames to wait before the spring fires. */
  delay?: number;
}> = ({
  label,
  sublabel,
  bg = "#FF2D7E",
  fg = "#FFFFFF",
  anchor = { x: 0.78, y: 0.24 },
  delay = 0,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const s = spring({
    frame: frame - delay,
    fps,
    config: { damping: 10, stiffness: 200, mass: 0.6 },
  });
  const scale = interpolate(s, [0, 1], [0.3, 1]);
  const rotate = interpolate(s, [0, 1], [-8, 0]);

  return (
    <div
      style={{
        position: "absolute",
        left: `${anchor.x * 100}%`,
        top: `${anchor.y * 100}%`,
        transform: `translate(-50%, -50%) scale(${scale}) rotate(${rotate}deg)`,
        background: bg,
        color: fg,
        padding: "14px 26px",
        borderRadius: 999,
        boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
        fontFamily: "Inter, system-ui, sans-serif",
        textAlign: "center",
        lineHeight: 1.05,
      }}
    >
      <div style={{ fontSize: 52, fontWeight: 900, letterSpacing: "-0.02em" }}>
        {label}
      </div>
      {sublabel ? (
        <div style={{ fontSize: 22, fontWeight: 700, opacity: 0.92 }}>
          {sublabel}
        </div>
      ) : null}
    </div>
  );
};
