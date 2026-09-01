/**
 * Root — the <Composition> registry.
 *
 * Registers the master 9:16 composition plus reframed 4:5 and 1:1 exports,
 * all reusing <Main>. `calculateMetadata` pulls fps/duration off the VideoPlan
 * in props (defaulting to an inline sample so Studio opens with no external
 * files); each composition fixes its own width/height per aspect ratio.
 */

import React from "react";
import { Composition } from "remotion";
import type { CalculateMetadataFunction } from "remotion";
import { Main } from "./Main.js";
import type { MainProps } from "./Main.js";
import type { VideoPlan } from "./types.js";

// ---------------------------------------------------------------------------
// Inline sample plan — enough of the domain to preview end-to-end in Studio.
// ---------------------------------------------------------------------------
const SAMPLE_PLAN: VideoPlan = {
  version: 1,
  brand: "AuraFit",
  intake: {
    objective: "ventas",
    platforms: ["tiktok", "instagram"],
    audience: "mujeres 25-40",
    productAngle: "faja invisible que moldea sin apretar",
    cta: "Compra en el link",
    durationSec: 8,
    market: "CO",
    paid: true,
    adPlatforms: ["meta"],
    ratios: ["9:16", "4:5", "1:1"],
  },
  branch: "problema-solucion",
  framework: "PAS",
  fps: 30,
  durationFrames: 240, // 3 scenes × 60f (6s) + 2s end card
  scenes: [
    {
      id: "sc-1",
      clipId: "clip-hook-01",
      inFrame: 0,
      outFrame: 60,
      purpose: "Hook: el dolor, a cámara",
      vo: { text: "Adiós a los rollitos", source: "recorded" },
      energy: 0.35,
      captions: [
        {
          id: "cap-1",
          level: "H2",
          startFrame: 6,
          endFrame: 56,
          anchor: { x: 0.5, y: 0.78 },
          entrance: "slide-up",
          beatAligned: false,
          tokens: [
            { text: "Adiós", klass: "negacion_dolor", emphasised: true },
            { text: "a", klass: "conector", emphasised: false },
            { text: "los", klass: "conector", emphasised: false },
            { text: "rollitos", klass: "negacion_dolor", emphasised: false },
          ],
          wordFrames: [
            { text: "Adiós", startFrame: 6, endFrame: 18 },
            { text: "a", startFrame: 18, endFrame: 24 },
            { text: "los", startFrame: 24, endFrame: 30 },
            { text: "rollitos", startFrame: 30, endFrame: 52 },
          ],
        },
      ],
    },
    {
      id: "sc-2",
      clipId: "clip-demo-01",
      inFrame: 0,
      outFrame: 60,
      purpose: "Demo: moldea la silueta",
      energy: 0.7,
      captions: [
        {
          id: "cap-2",
          level: "H1",
          startFrame: 66,
          endFrame: 116,
          anchor: { x: 0.5, y: 0.5 },
          entrance: "pop",
          beatAligned: true,
          tokens: [
            { text: "Moldea", klass: "keyword_beneficio", emphasised: true },
            { text: "tu", klass: "conector", emphasised: false },
            { text: "silueta", klass: "keyword_beneficio", emphasised: false },
          ],
          wordFrames: [
            { text: "Moldea", startFrame: 66, endFrame: 84 },
            { text: "tu", startFrame: 84, endFrame: 92 },
            { text: "silueta", startFrame: 92, endFrame: 112 },
          ],
        },
      ],
    },
    {
      id: "sc-3",
      clipId: "clip-cta-01",
      inFrame: 0,
      outFrame: 60,
      purpose: "Cierre + CTA",
      vo: { text: "Cómpralo hoy", source: "cloned" },
      energy: 0.9,
      captions: [
        {
          id: "cap-3",
          level: "H2",
          startFrame: 126,
          endFrame: 176,
          anchor: { x: 0.5, y: 0.82 },
          entrance: "typewriter",
          beatAligned: true,
          tokens: [
            { text: "Cómpralo", klass: "accion_cta", emphasised: true },
            { text: "hoy", klass: "accion_cta", emphasised: false },
          ],
          wordFrames: [
            { text: "Cómpralo", startFrame: 126, endFrame: 146 },
            { text: "hoy", startFrame: 146, endFrame: 166 },
          ],
        },
      ],
    },
  ],
  boundaries: [
    {
      fromScene: 0,
      decision: {
        type: "hard-cut",
        reason: "default; sobrevive la compresión móvil",
        flashy: false,
        durationFrames: 0,
      },
    },
    {
      fromScene: 1,
      decision: {
        type: "zoom-punch",
        reason: "escalar energía hacia el CTA",
        sfx: "impact",
        flashy: true,
        durationFrames: 8,
      },
    },
  ],
  energyCurve: [
    { atSec: 0, energy: 0.35 },
    { atSec: 2, energy: 0.7 },
    { atSec: 4, energy: 0.9 },
  ],
  music: {
    plan: { name: "upbeat-latino", tags: ["reggaeton", "bright"], bpm: [95, 105] },
  },
  sfx: [
    {
      id: "sfx-1",
      kind: "impact",
      source: "generated",
      license: "CC0-internal",
      frame: 120,
      reason: "acento en el corte hacia el CTA",
    },
  ],
  retention: {
    reHooks: [{ atSec: 3, kind: "callout-precio", note: "pill de precio + NUEVO" }],
    maxDeadAirSec: 2.5,
  },
  hookVariants: [
    { id: "hook-a", formulaId: "PAS-1", text: "Adiós a los rollitos", approxSec: 2 },
  ],
  compliance: {
    category: "shapewear",
    findings: [
      {
        platform: "tiktok",
        light: "green",
        rule: "claims-realistas",
        suggestion: "sin promesas médicas",
      },
    ],
    overall: "green",
  },
};

// fps + duration come from the plan; props round-trip so Studio keeps them.
const fromPlan: CalculateMetadataFunction<MainProps> = ({ props }) => {
  const plan = props.plan ?? SAMPLE_PLAN;
  return {
    fps: plan.fps,
    durationInFrames: plan.durationFrames,
    props: { plan },
  };
};

export const Root: React.FC = () => {
  return (
    <>
      {/* master — 9:16 */}
      <Composition
        id="VideoForge"
        component={Main}
        defaultProps={{ plan: SAMPLE_PLAN }}
        calculateMetadata={fromPlan}
        fps={SAMPLE_PLAN.fps}
        durationInFrames={SAMPLE_PLAN.durationFrames}
        width={1080}
        height={1920}
      />
      {/* explicit 9:16 export */}
      <Composition
        id="VideoForge-9x16"
        component={Main}
        defaultProps={{ plan: SAMPLE_PLAN }}
        calculateMetadata={fromPlan}
        fps={SAMPLE_PLAN.fps}
        durationInFrames={SAMPLE_PLAN.durationFrames}
        width={1080}
        height={1920}
      />
      {/* 4:5 */}
      <Composition
        id="VideoForge-4x5"
        component={Main}
        defaultProps={{ plan: SAMPLE_PLAN }}
        calculateMetadata={fromPlan}
        fps={SAMPLE_PLAN.fps}
        durationInFrames={SAMPLE_PLAN.durationFrames}
        width={1080}
        height={1350}
      />
      {/* 1:1 */}
      <Composition
        id="VideoForge-1x1"
        component={Main}
        defaultProps={{ plan: SAMPLE_PLAN }}
        calculateMetadata={fromPlan}
        fps={SAMPLE_PLAN.fps}
        durationInFrames={SAMPLE_PLAN.durationFrames}
        width={1080}
        height={1080}
      />
    </>
  );
};
