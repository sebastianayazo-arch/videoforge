/**
 * Main — the top-level composition.
 *
 * Lays the plan onto the timeline: scenes run back-to-back inside a <Series>
 * (each Series.Sequence auto-appends, length = out - in), the caption overlay
 * mounts once at composition level (caption frames are composition-relative),
 * retention re-hooks fire as spring-in <Callout>s, and the brand <EndCard>
 * closes on a trailing <Sequence>. Transitions live in the plan.boundaries and
 * are resolved by the transition engine; here we render the scene surfaces.
 */

import React from "react";
import { AbsoluteFill, Sequence, Series, useVideoConfig } from "remotion";
import type { VideoPlan } from "./types.js";
import { SceneView } from "./scenes/index.js";
import { CaptionLayer } from "./components/text/CaptionLayer.js";
import { DEFAULT_CAPTIONS_PROFILE } from "./components/text/Caption.js";
import { Callout } from "./components/callouts/Callout.js";
import { EndCard } from "./components/endcard/EndCard.js";

/** Props flow through Composition → calculateMetadata → here. */
export type MainProps = { plan: VideoPlan };

/** Scene length on the master timeline. */
const sceneLen = (s: VideoPlan["scenes"][number]): number =>
  Math.max(1, s.outFrame - s.inFrame);

export const Main: React.FC<MainProps> = ({ plan }) => {
  const { fps } = useVideoConfig();

  // scenes are sequential; the end card sits right after the last one.
  const scenesEnd = plan.scenes.reduce((n, s) => n + sceneLen(s), 0);
  const endCardFrames = Math.round(2 * fps);

  // caption frames are composition-relative → flatten and overlay once.
  const blocks = plan.scenes.flatMap((s) => s.captions);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* scene stack — Series auto-places each clip after the previous. */}
      <Series>
        {plan.scenes.map((scene) => (
          <Series.Sequence
            key={scene.id}
            durationInFrames={sceneLen(scene)}
            name={scene.id}
          >
            <SceneView scene={scene} />
          </Series.Sequence>
        ))}
      </Series>

      {/* caption overlay (composition-relative frames). */}
      <CaptionLayer blocks={blocks} profile={DEFAULT_CAPTIONS_PROFILE} />

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

      {/* brand end card / logo sting. */}
      <Sequence from={scenesEnd} durationInFrames={endCardFrames} name="end-card">
        <EndCard brand={plan.brand} cta={plan.intake.cta} />
      </Sequence>
    </AbsoluteFill>
  );
};
