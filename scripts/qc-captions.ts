/**
 * Caption QC (Module 3 QC). Returns QCCheck[] covering:
 *   - legibility at a 200px thumbnail (word-count / size proxy per level)
 *   - contrast ≥ 4.5:1 (WCAG) between text and its plate/outline
 *   - no-occlusion: anchors clear of face/product zones
 *   - keyword classes: ≤1 emphasis per block and it lands on a keyword class
 *
 * Self-contained contrast math; reuses the semantic tagger's KEYWORD_CLASSES.
 */

import type {
  BoundingBox,
  BrandCaptionsProfile,
  CaptionBlock,
  Hex,
  QCCheck,
} from "../src/types.js";
import { KEYWORD_CLASSES } from "../src/captions/semantic/tagger.js";
import { isMain, log, readJson, writeJson } from "./_util.js";

// --- WCAG contrast (self-contained) ----------------------------------------

function parseHex(hex: Hex | string): [number, number, number] {
  let h = hex.replace("#", "").trim();
  if (h.length === 3)
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [
    Number.isFinite(r) ? r : 0,
    Number.isFinite(g) ? g : 0,
    Number.isFinite(b) ? b : 0,
  ];
}

function relLuminance(hex: Hex | string): number {
  const chan = parseHex(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const [r, g, b] = [chan[0] ?? 0, chan[1] ?? 0, chan[2] ?? 0];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio (1..21) between two colours. */
export function contrastRatio(a: Hex | string, b: Hex | string): number {
  const la = relLuminance(a);
  const lb = relLuminance(b);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

// --- Occlusion geometry -----------------------------------------------------

function pointInBox(p: { x: number; y: number }, box: BoundingBox, margin = 0.02): boolean {
  return (
    p.x >= box.x - margin &&
    p.x <= box.x + box.w + margin &&
    p.y >= box.y - margin &&
    p.y <= box.y + box.h + margin
  );
}

export interface CaptionQCInput {
  blocks: CaptionBlock[];
  captions: BrandCaptionsProfile;
  faceBoxes?: BoundingBox[];
  productBoxes?: BoundingBox[];
}

/** Max words that stay legible in a 200px-wide thumbnail, per level. */
const LEGIBLE_WORD_CAP: Record<CaptionBlock["level"], number> = {
  H1: 4,
  H2: 6,
  base: 8,
};

export function qcCaptions(input: CaptionQCInput): QCCheck[] {
  const { blocks, captions } = input;
  const faceBoxes = input.faceBoxes ?? [];
  const productBoxes = input.productBoxes ?? [];
  const checks: QCCheck[] = [];

  // --- Legibility at 200px thumbnail ---
  const tooLong = blocks.filter(
    (b) => b.tokens.length > LEGIBLE_WORD_CAP[b.level],
  );
  checks.push({
    name: "captions.legibility.thumbnail-200px",
    pass: tooLong.length === 0,
    detail:
      tooLong.length === 0
        ? "all blocks within per-level word caps"
        : `${tooLong.length} block(s) too dense for a 200px thumbnail: ${tooLong
            .map((b) => b.id)
            .join(", ")}`,
  });

  // --- Contrast ≥ 4.5:1 ---
  // The immediate background is the plate (plate strategy) or the outline.
  const bg: Hex =
    captions.contrastStrategy === "plate"
      ? captions.baseTextColor // plate typically inverts text; compare to base
      : captions.outlineColor;
  const textVsBg = contrastRatio(captions.baseTextColor, captions.outlineColor);
  const accentVsBg = contrastRatio(captions.accentColor, bg);
  const worst = Math.min(textVsBg, accentVsBg);
  checks.push({
    name: "captions.contrast.wcag-4.5",
    pass: worst >= 4.5,
    detail: `worst text/plate contrast ${worst.toFixed(2)}:1 (need ≥ 4.5:1)`,
  });

  // --- No-occlusion ---
  const occluded = blocks.filter((b) =>
    [...faceBoxes, ...productBoxes].some((box) => pointInBox(b.anchor, box)),
  );
  checks.push({
    name: "captions.no-occlusion",
    pass: occluded.length === 0,
    detail:
      occluded.length === 0
        ? faceBoxes.length + productBoxes.length === 0
          ? "no detection boxes supplied — trivially clear (verify with vision)"
          : "all anchors clear of face/product zones"
        : `${occluded.length} anchor(s) over a face/product: ${occluded
            .map((b) => b.id)
            .join(", ")}`,
  });

  // --- Keyword classes correct ---
  const badEmphasis = blocks.filter((b) => {
    const emph = b.tokens.filter((t) => t.emphasised);
    if (emph.length > 1) return true; // at most one per block
    const one = emph[0];
    return one ? !KEYWORD_CLASSES.has(one.klass) : false;
  });
  checks.push({
    name: "captions.keyword-classes",
    pass: badEmphasis.length === 0,
    detail:
      badEmphasis.length === 0
        ? "≤1 emphasis per block, all on keyword classes"
        : `${badEmphasis.length} block(s) with bad emphasis: ${badEmphasis
            .map((b) => b.id)
            .join(", ")}`,
  });

  return checks;
}

function main(): void {
  const argv = process.argv.slice(2);
  const get = (k: string) =>
    argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const inputPath = get("input");
  const out = get("out");

  if (!inputPath) {
    log.warn(
      "usage: tsx scripts/qc-captions.ts --input=captionqc.json [--out=work/qc-captions.json]",
    );
    process.exit(2);
  }
  const input = readJson<CaptionQCInput>(inputPath);
  log.section("QC captions");
  const checks = qcCaptions(input);
  for (const c of checks)
    (c.pass ? log.ok : log.warn)(`${c.name}: ${c.detail ?? ""}`);
  if (out) writeJson(out, checks);
  process.stdout.write(JSON.stringify(checks, null, 2) + "\n");
  if (checks.some((c) => !c.pass)) process.exitCode = 1;
}

if (isMain(import.meta.url)) main();
