/**
 * EndCard (Module 13 render) — the 2s brand sting.
 *
 * Logo reveal (spring scale + opacity) over a brand-palette background, then a
 * CTA line springs up under it. Fully driven by brand props so it can be
 * reused across marcas. Presentation-only.
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

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

export const EndCard: React.FC<{
  brand: string;
  /** Brand palette; [0] = ground, [1] = accent. */
  palette?: Hex[];
  cta?: string;
  /** Optional logo asset; falls back to brand initials. */
  logoSrc?: string;
}> = ({
  brand,
  palette = ["#0A1F44", "#FF2D7E"],
  cta = "Link en la bio",
  logoSrc,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // AUDIO: dispara el sonic-logo (brand.sonicLogo) en el frame 0 de esta
  // Sequence — p.ej. <Audio src={sonicLogo} /> montado junto a este componente.

  const ground = palette[0] ?? "#0A1F44";
  const accent = palette[1] ?? "#FF2D7E";

  const logoIn = spring({ frame, fps, config: { damping: 12, mass: 0.8 } });
  const logoScale = interpolate(logoIn, [0, 1], [0.6, 1]);
  const logoOpacity = interpolate(frame, [0, 10], [0, 1], clamp);

  const ctaIn = spring({ frame: frame - 14, fps, config: { damping: 16 } });
  const ctaY = interpolate(ctaIn, [0, 1], [30, 0]);
  const ctaOpacity = interpolate(frame - 14, [0, 8], [0, 1], clamp);

  const initials = brand
    .split(/\s+/)
    .map((w) => w[0] ?? "")
    .join("")
    .slice(0, 3)
    .toUpperCase();

  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(120% 120% at 50% 35%, ${accent}22, ${ground})`,
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 40,
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#fff",
      }}
    >
      <div
        style={{
          transform: `scale(${logoScale})`,
          opacity: logoOpacity,
        }}
      >
        {logoSrc ? (
          <Img src={logoSrc} style={{ width: 320, height: "auto" }} />
        ) : (
          <div
            style={{
              width: 240,
              height: 240,
              borderRadius: 48,
              background: accent,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 96,
              fontWeight: 900,
              letterSpacing: "-0.03em",
            }}
          >
            {initials}
          </div>
        )}
      </div>

      <div
        style={{
          transform: `translateY(${ctaY}px)`,
          opacity: ctaOpacity,
          fontSize: 56,
          fontWeight: 800,
          letterSpacing: "-0.02em",
          textShadow: "0 2px 8px rgba(0,0,0,0.4)",
        }}
      >
        {cta}
      </div>
    </AbsoluteFill>
  );
};
