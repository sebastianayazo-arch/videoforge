/**
 * Main — the top-level composition.
 *
 * Lays the plan onto the timeline with a <TransitionSeries>: each scene is a
 * Sequence (length = out - in), and each plan.boundary becomes a
 * <TransitionSeries.Transition> resolved by the transition library
 * (resolveTransition maps the engine decision → a Remotion presentation +
 * timing; flowDeg orients directional whips). The caption overlay mounts once at
 * composition level (frames are composition-relative, already compressed to the
 * TransitionSeries layout), retention re-hooks fire as <Callout>s, and the brand
 * <EndCard> closes after the scenes.
 */

import React from "react";
import {
  AbsoluteFill,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { TransitionSeries } from "@remotion/transitions";
import type { VideoPlan, Boundary } from "./types.js";

/** A brief white flash accent on a motivated cut (whip / punch). Peaks on the
 *  cut frame and decays over a few frames — the "flash" a hard/action cut earns. */
const Flash: React.FC<{ peak: number; frames: number }> = ({ peak, frames }) => {
  const f = useCurrentFrame(); // sequence-relative (0 at the cut)
  const opacity = interpolate(f, [0, frames], [peak, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <AbsoluteFill style={{ backgroundColor: "#fff", opacity, pointerEvents: "none" }} />
  );
};
import { SceneView } from "./scenes/index.js";
import { resolveTransition } from "./transitions/library/index.js";
import { CaptionLayer } from "./components/text/CaptionLayer.js";
import { DEFAULT_CAPTIONS_PROFILE } from "./components/text/Caption.js";
import { AdCopy } from "./components/text/AdCopy.js";
import "./fonts.js"; // registers Montserrat / Inter / Playfair Display
import { Callout } from "./components/callouts/Callout.js";
import { EndCard } from "./components/endcard/EndCard.js";

export type MainProps = { plan: VideoPlan };

const sceneLen = (s: VideoPlan["scenes"][number]): number =>
  Math.max(1, s.outFrame - s.inFrame);

/** Frames a boundary's transition consumes (overlap) — mirrors the library. */
const transitionFrames = (b: Boundary): number =>
  b.decision.type === "hard-cut" || b.decision.type === "match-cut"
    ? 1
    : Math.max(1, b.decision.durationFrames || 1);

export const Main: React.FC<MainProps> = ({ plan }) => {
  const { fps } = useVideoConfig();

  // Compressed scene span: sum(len) − sum(transition overlaps).
  const scenesTotal =
    plan.scenes.reduce((n, s) => n + sceneLen(s), 0) -
    plan.boundaries.reduce((n, b) => n + transitionFrames(b), 0);
  const endCardFrames = Math.round(2.6 * fps);

  const blocks = plan.scenes.flatMap((s) => s.captions);

  // Build interleaved TransitionSeries children: Seq, Trans, Seq, Trans, …
  const children: React.ReactNode[] = [];
  plan.scenes.forEach((scene, i) => {
    children.push(
      <TransitionSeries.Sequence key={scene.id} durationInFrames={sceneLen(scene)}>
        <SceneView scene={scene} />
      </TransitionSeries.Sequence>,
    );
    const b = plan.boundaries.find((bo) => bo.fromScene === i);
    if (b && i < plan.scenes.length - 1) {
      const { presentation, timing } = resolveTransition(b.decision, fps, b.flowDeg);
      children.push(
        <TransitionSeries.Transition
          key={`t-${i}`}
          presentation={presentation}
          timing={timing}
        />,
      );
    }
  });

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      <TransitionSeries>{children}</TransitionSeries>

      {/* Ad-copy headlines (designed, no plate) — the primary text layer. */}
      {(plan.copy ?? []).map((cb) => (
        <Sequence
          key={cb.id}
          from={cb.startFrame}
          durationInFrames={Math.max(1, cb.endFrame - cb.startFrame)}
          name={`copy-${cb.id}`}
        >
          <AbsoluteFill>
            <AdCopy block={cb} profile={plan.captionsProfile ?? DEFAULT_CAPTIONS_PROFILE} />
          </AbsoluteFill>
        </Sequence>
      ))}

      {/* Legacy karaoke captions only if a plan still uses them (none here). */}
      {blocks.length > 0 && (
        <CaptionLayer
          blocks={blocks}
          profile={plan.captionsProfile ?? DEFAULT_CAPTIONS_PROFILE}
        />
      )}

      {/* retention re-hooks → pattern-interrupt callouts. */}
      {plan.retention.reHooks.map((rh, i) => (
        <Sequence
          key={`rehook-${i}`}
          from={Math.round(rh.atSec * fps)}
          durationInFrames={Math.round(1.4 * fps)}
          name={`rehook-${rh.kind}`}
        >
          <Callout label="$89.900" sublabel="NUEVO" />
        </Sequence>
      ))}

      {/* motivated-cut flash accents (tied to the SFX cues at flashy cuts). */}
      {plan.sfx.map((cue, i) => {
        // kind is an open label here (transform/whoosh accents aren't in the
        // strict SfxKind union). The transform/whip flash must be a 2–3 frame
        // "paf" that HIDES the seam of a match-cut — not a perceptible wipe.
        const k = cue.kind as string;
        const isCut = k === "whoosh" || k === "transform";
        const dur = isCut ? 3 : 4; // frames
        return (
          <Sequence
            key={`flash-${i}`}
            from={cue.frame - 1}
            durationInFrames={dur}
            name={`flash-${cue.kind}`}
          >
            <Flash peak={isCut ? 0.85 : 0.45} frames={dur} />
          </Sequence>
        );
      })}

      {/* brand end card / tapa. */}
      <Sequence from={scenesTotal} durationInFrames={endCardFrames} name="end-card">
        <EndCard
          brand={plan.brand}
          palette={plan.endCard?.palette}
          logoSrc={plan.endCard?.logoSrc}
          web={plan.endCard?.web}
          instagram={plan.endCard?.instagram}
          ink={plan.endCard?.ink}
          accent={plan.endCard?.accent}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
