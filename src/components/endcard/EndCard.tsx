/**
 * EndCard — the brand tapa (outro).
 *
 * A clean brand close on a base-palette ground: the Salomé wordmark (a real logo
 * asset if provided, else an elegant Playfair wordmark), the website and the
 * Instagram handle. Designed to feel like the brand, not break the aesthetic.
 * Presentation-only; springs in.
 */
import React from "react";
import {
  AbsoluteFill,
  Img,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { Hex } from "../../types.js";
import { PLAYFAIR, INTER } from "../../fonts.js";

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const EndCard: React.FC<{
  brand: string;
  /** Brand palette; [0] = ground. */
  palette?: Hex[];
  cta?: string;
  logoSrc?: string;
  web?: string;
  instagram?: string;
  /** Text colour on the ground (defaults to a light cream). */
  ink?: Hex;
  accent?: Hex;
}> = ({
  brand,
  palette = ["#2B1B2E", "#C9748A", "#E8C9B0", "#F4EDE6"],
  logoSrc,
  web,
  instagram,
  ink = "#F4EDE6",
  accent = "#C9748A",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const ground = palette[0] ?? "#2B1B2E";

  const logoIn = spring({ frame, fps, config: { damping: 14, mass: 0.8 } });
  const logoScale = interpolate(logoIn, [0, 1], [0.82, 1]);
  const logoOpacity = interpolate(frame, [0, 12], [0, 1], clamp);

  const metaIn = spring({ frame: frame - 12, fps, config: { damping: 18 } });
  const metaY = interpolate(metaIn, [0, 1], [24, 0]);
  const metaOpacity = interpolate(frame - 12, [0, 10], [0, 1], clamp);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: ground,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 40,
      }}
    >
      <div style={{ opacity: logoOpacity, transform: `scale(${logoScale})`, textAlign: "center" }}>
        {logoSrc ? (
          <Img src={logoSrc} style={{ width: 620, maxWidth: "80%", objectFit: "contain" }} />
        ) : (
          <div
            style={{
              fontFamily: PLAYFAIR,
              fontWeight: 700,
              fontSize: 150,
              color: ink,
              letterSpacing: "0.02em",
              lineHeight: 1,
            }}
          >
            {brand}
          </div>
        )}
        {/* thin rule under the wordmark */}
        <div style={{ height: 3, width: 220, background: accent, margin: "26px auto 0" }} />
      </div>

      <div
        style={{
          opacity: metaOpacity,
          transform: `translateY(${metaY}px)`,
          textAlign: "center",
          fontFamily: INTER,
          color: ink,
        }}
      >
        {web ? <div style={{ fontSize: 40, fontWeight: 600, letterSpacing: "0.02em" }}>{web}</div> : null}
        {instagram ? (
          <div style={{ fontSize: 40, fontWeight: 600, marginTop: 12, color: accent }}>{instagram}</div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};
