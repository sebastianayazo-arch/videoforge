/**
 * Tests for the deterministic core: transitions, caption semantics, audio
 * attention budget, and the compliance gate. Run with:
 *   node --test --import tsx test/*.test.ts
 */

import { test } from "node:test";
import assert from "node:assert/strict";

import {
  decideTransition,
  decideSequence,
  flashyBudgetFor,
} from "../src/transitions/decision-engine.js";
import { tagBlock, classifyToken } from "../src/captions/semantic/tagger.js";
import { checkCreative } from "../scripts/policy-check.js";
import { auditAttentionBudget, syncOk, SONIC_HOOKS } from "../src/audio/mix.js";
import type { TransitionDecisionInput, SfxCue } from "../src/types.js";

const baseBoundary = (
  over: Partial<TransitionDecisionInput> = {},
): TransitionDecisionInput => ({
  branch: "demo-directa",
  platform: "tiktok",
  energyOut: 0.5,
  energyIn: 0.5,
  purpose: "continue",
  brand: { weights: {} },
  flashyBudgetUsed: 0,
  flashyBudgetMax: 2,
  ...over,
});

// --- Transitions -----------------------------------------------------------

test("hard-cut is the default on a neutral boundary", () => {
  const d = decideTransition(baseBoundary());
  assert.equal(d.type, "hard-cut");
  assert.equal(d.flashy, false);
});

test("crossfade only on calm mood-first boundaries, never on offers", () => {
  const calm = decideTransition(
    baseBoundary({ energyOut: 0.2, energyIn: 0.2, purpose: "calm" }),
  );
  assert.equal(calm.type, "crossfade");

  const offer = decideTransition(
    baseBoundary({
      branch: "oferta-urgencia",
      energyOut: 0.2,
      energyIn: 0.2,
      purpose: "calm",
    }),
  );
  assert.notEqual(offer.type, "crossfade");
});

test("action-cut-whip needs aligned motion and carries a whoosh SFX", () => {
  const d = decideTransition(
    baseBoundary({
      purpose: "escalate",
      energyOut: 0.4,
      energyIn: 0.8,
      flowOut: { frame: 0, directionDeg: 10, magnitude: 0.9 },
      flowIn: { frame: 0, directionDeg: 15, magnitude: 0.9 },
    }),
  );
  assert.equal(d.type, "action-cut-whip");
  assert.equal(d.sfx, "whoosh");
  assert.equal(d.flashy, true);
});

test("flashy budget caps flashy transitions across a sequence", () => {
  const flashyBoundary = {
    ...baseBoundary({
      purpose: "escalate" as const,
      energyOut: 0.3,
      energyIn: 0.9,
      beatFrame: 30,
    }),
  };
  const decisions = decideSequence(
    [flashyBoundary, flashyBoundary, flashyBoundary, flashyBoundary],
    2,
  );
  const flashyCount = decisions.filter((d) => d.flashy).length;
  assert.ok(flashyCount <= 2, `expected ≤2 flashy, got ${flashyCount}`);
});

test("brand can ban a transition type", () => {
  const d = decideTransition(
    baseBoundary({
      purpose: "contrast",
      brand: { weights: { glitch: 0.9 }, banned: ["glitch"] },
    }),
  );
  assert.notEqual(d.type, "glitch");
});

test("flashy budget scales with duration", () => {
  assert.equal(flashyBudgetFor(20), 1);
  assert.equal(flashyBudgetFor(45), 2);
  assert.equal(flashyBudgetFor(90), 3);
});

// --- Caption semantics -----------------------------------------------------

test("classifyToken tags numbers, CTAs, benefits and connectors", () => {
  assert.equal(classifyToken("50%", new Set()), "numero_dato");
  assert.equal(classifyToken("compra", new Set()), "accion_cta");
  assert.equal(classifyToken("moldea", new Set()), "keyword_beneficio");
  assert.equal(classifyToken("de", new Set()), "conector");
  assert.equal(classifyToken("Silueta", new Set(["silueta"])), "nombre_producto");
});

test("tagBlock emphasises at most one word (CTA wins over benefit)", () => {
  const tokens = tagBlock(["compra", "y", "moldea", "hoy"]);
  const emphasised = tokens.filter((t) => t.emphasised);
  assert.equal(emphasised.length, 1);
  assert.equal(emphasised[0]?.text, "compra");
});

test("a block of only connectors emphasises nothing", () => {
  const tokens = tagBlock(["y", "de", "la"]);
  assert.equal(tokens.filter((t) => t.emphasised).length, 0);
});

// --- Compliance gate -------------------------------------------------------

test("weight-loss claim for shapewear is red on both platforms", () => {
  const r = checkCreative({
    category: "shapewear",
    lines: ["Esta faja te ayuda a adelgazar rápido"],
    market: "CO",
    adPlatforms: ["meta", "tiktok"],
  });
  assert.equal(r.overall, "red");
});

test("positive-aspirational shaping copy passes green", () => {
  const r = checkCreative({
    category: "shapewear",
    lines: ["Realza tu silueta y siéntete segura", "Compra hoy"],
    market: "CO",
    adPlatforms: ["meta", "tiktok"],
    minTargetAge: 25,
  });
  assert.equal(r.overall, "green");
});

test("body-shame angle is flagged with a suggested rewrite", () => {
  const r = checkCreative({
    category: "shapewear",
    lines: ["Esconde tus rollitos"],
    market: "CO",
    adPlatforms: ["meta"],
  });
  assert.equal(r.overall, "red");
  const finding = r.findings.find((f) => f.suggestion);
  assert.ok(finding?.suggestion?.includes("realza tu silueta"));
});

test("targeting under 18 is red on Meta", () => {
  const r = checkCreative({
    category: "shapewear",
    lines: ["Realza tu silueta"],
    market: "CO",
    adPlatforms: ["meta"],
    minTargetAge: 16,
  });
  assert.equal(r.overall, "red");
});

test("unsubstantiated medical claim degrades to red", () => {
  const r = checkCreative({
    category: "shapewear",
    lines: ["Soporte cómodo"],
    market: "CO",
    adPlatforms: ["meta"],
    isMedicalLine: true,
    hasSubstantiation: false,
    minTargetAge: 30,
  });
  assert.equal(r.overall, "red");
});

// --- Audio attention -------------------------------------------------------

test("every branch has a sonic hook", () => {
  for (const branch of [
    "problema-solucion",
    "demo-directa",
    "oferta-urgencia",
    "ugc-testimonio",
    "lanzamiento",
  ] as const) {
    assert.ok(SONIC_HOOKS[branch]);
  }
});

test("attention budget flags two impacts too close together", () => {
  const fps = 30;
  const sfx: SfxCue[] = [
    { id: "a", kind: "impact", source: "generated", license: "x", frame: 30, reason: "" },
    { id: "b", kind: "impact", source: "generated", license: "x", frame: 60, reason: "" },
  ];
  const res = auditAttentionBudget(sfx, fps, new Set(), 4);
  assert.equal(res.ok, false);
});

test("planned points are exempt from the attention budget", () => {
  const fps = 30;
  const sfx: SfxCue[] = [
    { id: "a", kind: "impact", source: "generated", license: "x", frame: 0, reason: "" },
    { id: "b", kind: "riser", source: "generated", license: "x", frame: 30, reason: "" },
  ];
  const res = auditAttentionBudget(sfx, fps, new Set([0, 30]), 4);
  assert.equal(res.ok, true);
});

test("sync tolerance is ±2 frames", () => {
  assert.equal(syncOk(30, 32), true);
  assert.equal(syncOk(30, 33), false);
});
