/**
 * Transition Decision Engine (Module 6).
 *
 * Transitions are grammar, not decoration. Every boundary between two scenes
 * gets ONE decision, justified in one line, chosen from a fixed taxonomy by:
 *   - energy delta between scenes
 *   - narrative purpose
 *   - branch + platform
 *   - the *real* motion of the footage (optical flow)
 *   - the brand's detected transition grammar (weights)
 *
 * Global rules enforced here:
 *   - hard-cut is the default; it survives mobile compression best.
 *   - crossfade ONLY on low-energy / mood-first; NEVER on beat edits or offers.
 *   - flashy transitions are budgeted (max ~2 per <60s video).
 *   - every flashy transition carries an SFX cue.
 *   - whip/action cuts require real directional motion on BOTH sides.
 *   - glitch only if brand grammar validates it; never on premium.
 */

import type {
  TransitionDecision,
  TransitionDecisionInput,
  TransitionType,
} from "../types.js";

const FLASHY: ReadonlySet<TransitionType> = new Set([
  "action-cut-whip",
  "zoom-punch",
  "speed-ramp",
  "glitch",
  "luma-matte",
  "shape-mask",
]);

/** SFX that MUST accompany each transition type (undefined = none required). */
const REQUIRED_SFX: Partial<Record<TransitionType, string>> = {
  "action-cut-whip": "whoosh",
  "zoom-punch": "impact",
  "speed-ramp": "riser",
  "luma-matte": "whoosh",
  "shape-mask": "impact",
  glitch: "glitch-sfx",
};

const DEFAULT_DURATION: Record<TransitionType, number> = {
  "hard-cut": 0,
  "invisible-cut": 0,
  "action-cut-whip": 4,
  "match-cut": 0,
  crossfade: 12,
  "luma-matte": 10,
  "shape-mask": 12,
  "zoom-punch": 6,
  "speed-ramp": 8,
  glitch: 4,
};

const isFlashy = (t: TransitionType) => FLASHY.has(t);

/** Weighted directional agreement of the two flow samples, 0..1. */
function directionalAgreement(i: TransitionDecisionInput): number {
  if (!i.flowOut || !i.flowIn) return 0;
  const diff = Math.abs(i.flowOut.directionDeg - i.flowIn.directionDeg) % 360;
  const delta = diff > 180 ? 360 - diff : diff;
  const aligned = 1 - delta / 180; // 1 = same direction, 0 = opposite
  const strength = Math.min(i.flowOut.magnitude, i.flowIn.magnitude);
  return aligned * strength;
}

/**
 * Decide the transition for a single boundary. Pure and deterministic so it
 * is trivially testable and auditable in the plan.
 */
export function decideTransition(
  input: TransitionDecisionInput,
): TransitionDecision {
  const {
    branch,
    energyOut,
    energyIn,
    purpose,
    matchDetected,
    beatFrame,
    brand,
    flashyBudgetUsed,
    flashyBudgetMax,
  } = input;

  const energyDelta = energyIn - energyOut;
  const bothCalm = energyOut < 0.35 && energyIn < 0.35;
  const budgetLeft = flashyBudgetUsed < flashyBudgetMax;
  const banned = new Set(brand.banned ?? []);
  const brandBudget = (t: TransitionType) =>
    banned.has(t) ? -1 : brand.weights[t] ?? 0;

  // Candidate scoring. Higher score wins; brand weights bias ties.
  const candidates: { type: TransitionType; score: number; reason: string }[] =
    [];

  const push = (type: TransitionType, score: number, reason: string) => {
    if (banned.has(type)) return;
    candidates.push({ type, score: score + brandBudget(type), reason });
  };

  // --- Match cut: strongest when a real composition/gesture match exists. ---
  if (matchDetected) {
    push(
      "match-cut",
      0.9,
      "composición/gesto coincidente entre salida y entrada — corte invisible por coincidencia",
    );
  }

  // --- Action cut + whip: needs real, aligned motion on both sides. ---
  const agreement = directionalAgreement(input);
  if (agreement > 0.45 && budgetLeft && (purpose === "escalate" || energyDelta > 0.2)) {
    push(
      "action-cut-whip",
      0.7 + agreement * 0.2,
      `movimiento direccional alineado (${Math.round(agreement * 100)}%) — whip en el frame de la acción, con whoosh`,
    );
  }

  // --- Zoom punch / speed ramp: emphasis on a beat, escalating energy. ---
  if (budgetLeft && beatFrame !== undefined && energyDelta > 0.25) {
    if (purpose === "escalate") {
      push("zoom-punch", 0.68, "énfasis en beat con salto de energía — zoom punch");
    } else {
      push("speed-ramp", 0.6, "aceleración hacia el beat — speed ramp de énfasis");
    }
  }

  // --- Reveal: branded shape mask / luma matte when an element crosses frame. ---
  if (purpose === "reveal" && budgetLeft) {
    push(
      "shape-mask",
      0.66,
      "reveal brandeado — máscara con forma del logo",
    );
    push("luma-matte", 0.62, "un elemento cruza el cuadro — luma matte");
  }

  // --- Crossfade: ONLY low energy / mood-first. Never on beat edits or offers. ---
  const offerLike = branch === "oferta-urgencia";
  if (bothCalm && purpose === "calm" && !offerLike && beatFrame === undefined) {
    push("crossfade", 0.5, "baja energía / mood-first — crossfade suave");
  }

  // --- Invisible cut: hide the seam in a full frame or blur. ---
  if (purpose === "continue" && Math.abs(energyDelta) < 0.15) {
    push(
      "invisible-cut",
      0.45,
      "continuidad — corte invisible escondido en frame lleno/blur",
    );
  }

  // --- Glitch: only if brand grammar explicitly validates it, never premium. ---
  if ((brand.weights.glitch ?? 0) > 0.3 && budgetLeft && purpose === "contrast") {
    push("glitch", 0.4 + (brand.weights.glitch ?? 0), "contraste validado por gramática de marca — glitch");
  }

  // --- Hard cut: always available, the reliable default. ---
  push(
    "hard-cut",
    0.5 + (beatFrame !== undefined ? 0.15 : 0),
    beatFrame !== undefined
      ? "corte duro en el beat — default que sobrevive la compresión"
      : "corte duro — default limpio",
  );

  candidates.sort((a, b) => b.score - a.score);
  const chosen = candidates[0]!;

  // If the winner is flashy but the budget is spent, fall back to hard cut.
  let type = chosen.type;
  let reason = chosen.reason;
  if (isFlashy(type) && !budgetLeft) {
    type = "hard-cut";
    reason =
      "presupuesto de transiciones llamativas agotado — corte duro en su lugar";
  }

  const sfx = REQUIRED_SFX[type];
  return {
    type,
    reason,
    sfx,
    flashy: isFlashy(type),
    durationFrames: DEFAULT_DURATION[type],
  };
}

/**
 * Resolve an entire sequence of boundaries, tracking the shared flashy budget
 * left-to-right so the whole video respects the "max 2 flashy" rule.
 */
export function decideSequence(
  boundaries: Omit<TransitionDecisionInput, "flashyBudgetUsed" | "flashyBudgetMax">[],
  flashyBudgetMax: number,
): TransitionDecision[] {
  let used = 0;
  return boundaries.map((b) => {
    const decision = decideTransition({
      ...b,
      flashyBudgetUsed: used,
      flashyBudgetMax,
    });
    if (decision.flashy) used += 1;
    return decision;
  });
}

/** Flashy budget for a video of the given duration (<60s ⇒ 2). */
export function flashyBudgetFor(durationSec: number): number {
  if (durationSec < 30) return 1;
  if (durationSec < 60) return 2;
  return 3;
}
