/**
 * Transition library (Module 6) — bridges an engine `TransitionDecision` to a
 * concrete Remotion `<TransitionSeries.Transition>` presentation + timing.
 *
 * The decision engine (`../decision-engine.ts`) picks WHAT and WHY; this maps
 * that to HOW it renders. Built-in presentations come from `@remotion/transitions`;
 * types with no built-in equivalent (whip, luma matte, shape mask, speed ramp,
 * glitch) map to the nearest built-in with a `custom` flag marking where a
 * bespoke presentation/effect plugs in (luma mattes, shaped masks, speed ramps).
 */

import { linearTiming, springTiming } from "@remotion/transitions";
import type {
  TransitionPresentation,
  TransitionTiming,
} from "@remotion/transitions";
import { none } from "@remotion/transitions/none";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { linearBlur } from "@remotion/transitions";

import type { TransitionDecision, TransitionType } from "../../types.js";

export interface RenderableTransition {
  presentation: TransitionPresentation<Record<string, unknown>>;
  timing: TransitionTiming;
  /** True when the built-in is only an approximation of a bespoke effect. */
  custom: boolean;
  /** Note for the bespoke effect that a production build should implement. */
  customNote?: string;
}

/** Map optical-flow direction (deg) to a slide direction for whips/matches. */
function slideDirFromDeg(deg: number | undefined) {
  if (deg === undefined) return "from-right" as const;
  const d = ((deg % 360) + 360) % 360;
  if (d < 45 || d >= 315) return "from-right" as const;
  if (d < 135) return "from-bottom" as const; // upward motion
  if (d < 225) return "from-left" as const;
  return "from-top" as const;
}

/**
 * Resolve a decision to a renderable transition. `fps` sizes spring timings;
 * `flowDeg` (dominant motion at the boundary) orients directional presentations.
 */
export function resolveTransition(
  decision: TransitionDecision,
  fps: number,
  flowDeg?: number,
): RenderableTransition {
  const frames = Math.max(1, decision.durationFrames || 1);
  const linear: TransitionTiming = linearTiming({ durationInFrames: frames });
  const springy: TransitionTiming = springTiming({
    config: { damping: 200 },
    durationInFrames: frames,
    durationRestThreshold: 0.001,
  });

  const map: Record<TransitionType, () => RenderableTransition> = {
    "hard-cut": () => ({
      presentation: none() as RenderableTransition["presentation"],
      timing: linearTiming({ durationInFrames: 1 }),
      custom: false,
    }),
    "invisible-cut": () => ({
      presentation: linearBlur({ intensity: 0.6 }) as RenderableTransition["presentation"],
      timing: linear,
      custom: false,
    }),
    "match-cut": () => ({
      // A true match cut is a hard cut on coincident composition; render as a
      // near-instant cut and let the shot-matching upstream do the work.
      presentation: none() as RenderableTransition["presentation"],
      timing: linearTiming({ durationInFrames: 1 }),
      custom: false,
    }),
    crossfade: () => ({
      presentation: fade() as RenderableTransition["presentation"],
      timing: linear,
      custom: false,
    }),
    "action-cut-whip": () => ({
      presentation: slide({ direction: slideDirFromDeg(flowDeg) }) as RenderableTransition["presentation"],
      timing: springy,
      custom: true,
      customNote:
        "whip pan real: motion-blur direccional + speed ramp; slide es aproximación",
    }),
    "zoom-punch": () => ({
      presentation: slide({ direction: "from-bottom" }) as RenderableTransition["presentation"],
      timing: springy,
      custom: true,
      customNote: "zoom punch: escala rápida en beat; usar presentación de zoom bespoke",
    }),
    "speed-ramp": () => ({
      presentation: fade() as RenderableTransition["presentation"],
      timing: springy,
      custom: true,
      customNote: "speed ramp: retime del clip (setTimeScale) + easing; no es un crossfade",
    }),
    "luma-matte": () => ({
      presentation: wipe() as RenderableTransition["presentation"],
      timing: linear,
      custom: true,
      customNote: "luma matte real: presentación con máscara por luminancia de un elemento que cruza",
    }),
    "shape-mask": () => ({
      presentation: wipe() as RenderableTransition["presentation"],
      timing: springy,
      custom: true,
      customNote: "máscara con forma del logo: SVG clip-path animado para reveal brandeado",
    }),
    glitch: () => ({
      presentation: linearBlur({ intensity: 0.3 }) as RenderableTransition["presentation"],
      timing: linear,
      custom: true,
      customNote: "glitch: RGB split + displacement; solo si la gramática de marca lo valida",
    }),
  };

  return map[decision.type]();
}
