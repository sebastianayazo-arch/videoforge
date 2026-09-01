/**
 * CaptionLayer (Module 3 render) — the active-caption overlay.
 *
 * Given a scene's (or the whole video's) CaptionBlock[], it shows only the
 * blocks live at the current master frame. Blocks carry composition-relative
 * frames, so this reads `useCurrentFrame()` directly and mounts full-bleed.
 * Presentation-only; no timing logic beyond the in-window filter.
 */

import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import type { BrandCaptionsProfile, CaptionBlock } from "../../types.js";
import { Caption, DEFAULT_CAPTIONS_PROFILE } from "./Caption.js";

export const CaptionLayer: React.FC<{
  blocks: CaptionBlock[];
  profile?: BrandCaptionsProfile;
}> = ({ blocks, profile = DEFAULT_CAPTIONS_PROFILE }) => {
  const frame = useCurrentFrame();
  const active = blocks.filter(
    (b) => frame >= b.startFrame && frame <= b.endFrame,
  );

  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {active.map((b) => (
        <Caption key={b.id} block={b} profile={profile} />
      ))}
    </AbsoluteFill>
  );
};
