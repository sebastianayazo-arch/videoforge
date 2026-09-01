/**
 * Sonic Architecture of Attention (Module 9).
 *
 * Sound doesn't accompany the video — it competes for attention on equal
 * footing with the visual, with a physiological edge (the brain processes
 * audio ~2x faster; a hit on the exact cut frame reorients attention
 * involuntarily). Two layers:
 *   9A — attention (hooks & sonic cues that capture)
 *   9B — craft (the professional mix)
 *
 * Guiding principle: design for sound OFF, reward sound ON. The video must
 * work muted; with audio it must be a multiplier.
 *
 * This module owns the *decisions*: the mix hierarchy (levels/ducking), the
 * attention budget ("if everything sounds, nothing sounds"), the sonic-hook
 * catalogue by branch, and frame-exact placement of SFX cues.
 */

import type { Branch, Frame, SfxCue, SfxKind, VideoPlan } from "../types.js";

// ---------------------------------------------------------------------------
// 9B.2 — Mix hierarchy. Levels are dBFS targets relative to the master.
// Voice up front; attention/text SFX below voice, above music; music ducked.
// ---------------------------------------------------------------------------

export const MIX = {
  voiceTargetDb: -3,
  /** Music sits −18..−14 LUFS under voice, with automatic ducking. */
  musicUnderVoiceDb: -16,
  musicNoVoiceDb: -10,
  duckDepthDb: -9,
  duckAttackMs: 80,
  duckReleaseMs: 250,
  /** Attention/text SFX: under voice, over music. */
  sfxAttentionDb: -8,
  sfxTextDb: -12,
  /** Hook SFX in 0–1s (no voice yet) may take the full front. */
  hookFrontDb: -1,
  /** 9B.4 — final normalisation per platform. */
  integratedLUFS: -14,
  truePeakDb: -1,
} as const;

// ---------------------------------------------------------------------------
// 9A.1 — Sonic hook catalogue by branch (frames 0–24 pattern interrupt).
// ---------------------------------------------------------------------------

export interface SonicHook {
  kind: SfxKind;
  note: string;
}

export const SONIC_HOOKS: Record<Branch, SonicHook> = {
  "oferta-urgencia": {
    kind: "impact",
    note: "sub‑drop seco — el interrupt de la oferta",
  },
  lanzamiento: {
    kind: "riser",
    note: "riser corto que resuelve en el primer corte (reveal)",
  },
  "demo-directa": {
    kind: "product-asmr",
    note: "sonido diegético amplificado (tela/zipper/broche) — el hook más honesto",
  },
  "ugc-testimonio": {
    kind: "product-asmr",
    note: "sonido real del producto ajustándose — difícil de scrollear",
  },
  "problema-solucion": {
    kind: "silence-cut",
    note: "silencio abrupto tras 0.5s de música — el corte de audio también es interrupt",
  },
};

/**
 * 9A.1 rule: the interrupt must connect to what follows. A shock sound that
 * doesn't pay off destroys completion. This flags a hook whose kind clashes
 * with the opening content tag.
 */
export function hookConnects(hook: SonicHook, openingContentTag: string): boolean {
  if (hook.kind === "silence-cut") return true; // always safe
  if (hook.kind === "product-asmr") return /producto|demo|ajuste|tela|ugc/.test(openingContentTag);
  return true;
}

// ---------------------------------------------------------------------------
// 9A.5 — Attention budget. Max one attention event per 3–5s window,
// outside the deliberately planned points (hook, re-hooks, CTA).
// ---------------------------------------------------------------------------

const ATTENTION_KINDS: ReadonlySet<SfxKind> = new Set([
  "riser",
  "impact",
  "sub-drop",
  "notification-original",
]);

export function isAttentionSfx(kind: SfxKind): boolean {
  return ATTENTION_KINDS.has(kind);
}

/**
 * Validate the attention budget across a plan's SFX cues. `plannedFrames` are
 * the frames of deliberately-planned events (hook, re-hooks, CTA) which are
 * exempt from the density cap.
 */
export function auditAttentionBudget(
  sfx: SfxCue[],
  fps: number,
  plannedFrames: ReadonlySet<Frame>,
  windowSec = 4,
): { ok: boolean; violations: { frame: Frame; reason: string }[] } {
  const windowFrames = windowSec * fps;
  const attention = sfx
    .filter((c) => isAttentionSfx(c.kind) && !plannedFrames.has(c.frame))
    .sort((a, b) => a.frame - b.frame);

  const violations: { frame: Frame; reason: string }[] = [];
  for (let i = 1; i < attention.length; i++) {
    const prev = attention[i - 1]!;
    const cur = attention[i]!;
    if (cur.frame - prev.frame < windowFrames) {
      violations.push({
        frame: cur.frame,
        reason: `evento de atención a <${windowSec}s del anterior (${prev.kind}@${prev.frame})`,
      });
    }
  }
  return { ok: violations.length === 0, violations };
}

// ---------------------------------------------------------------------------
// 9B.3 — Frame-exact sync tolerance. Offsets > 2 frames read as an error.
// ---------------------------------------------------------------------------

export const SYNC_TOLERANCE_FRAMES = 2;

export function syncOk(cueFrame: Frame, eventFrame: Frame): boolean {
  return Math.abs(cueFrame - eventFrame) <= SYNC_TOLERANCE_FRAMES;
}

/**
 * Build the mandatory hook SFX cue for a plan (frame 0) plus assert that every
 * transition that requires an SFX has a matching cue on its boundary frame.
 * Returns the list of missing cues so QC (Module 9B.6) can fail loudly.
 */
export function auditPlanSfx(plan: VideoPlan): {
  hookCue: SfxCue;
  missing: string[];
} {
  const branch = plan.branch;
  const hook = SONIC_HOOKS[branch];
  const hookCue: SfxCue = {
    id: "hook-0",
    kind: hook.kind,
    source: "generated",
    license: "generated-original",
    frame: 0,
    reason: `hook sonoro (${branch}): ${hook.note}`,
  };

  const missing: string[] = [];
  const cueFrames = new Set(plan.sfx.map((c) => c.frame));
  for (const b of plan.boundaries) {
    if (!b.decision.sfx) continue;
    // The boundary frame is the start of scene fromScene+1.
    const next = plan.scenes[b.fromScene + 1];
    if (!next) continue;
    const boundaryFrame = next.inFrame;
    const hasCloseCue = [...cueFrames].some((f) => syncOk(f, boundaryFrame));
    if (!hasCloseCue) {
      missing.push(
        `frontera @${boundaryFrame} (${b.decision.type}) requiere SFX "${b.decision.sfx}" y no hay cue en ±${SYNC_TOLERANCE_FRAMES}f`,
      );
    }
  }
  return { hookCue, missing };
}
