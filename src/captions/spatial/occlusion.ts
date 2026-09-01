/**
 * Anti-occlusion spatial solver (Module 3.4).
 *
 * A caption must never cover a face, the product, or the platform UI. This
 * solver works in normalised 0..1 space and picks the on-screen anchor that
 * stays the furthest from every forbidden zone while remaining inside the
 * safe area for the given aspect ratio.
 *
 * Forbidden zones:
 *   - top band     (~platform header / handle),
 *   - bottom band  (~UI, existing caption bar),
 *   - every face box across the block's frame range (dynamic per-face zones),
 *   - any product region (captions must sell it, not hide it).
 *
 * If no free region exists the solver returns { ok:false } with a note so the
 * caller can shorten or move the block. Pure and deterministic.
 */

import type { AspectRatio, BoundingBox } from "../../types.js";

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/**
 * Allowed rectangle (normalised) per aspect ratio. Recomputed for each ratio
 * so it is reusable by the reframing stage. 9:16 reserves the most chrome
 * (top ~20%, bottom ~25%); squarer ratios reserve less.
 */
const SAFE: Record<AspectRatio, BoundingBox> = {
  // top 20% + bottom 25% reserved, 6% side margins.
  "9:16": { x: 0.06, y: 0.2, w: 0.88, h: 0.55 },
  // less vertical chrome on 4:5.
  "4:5": { x: 0.06, y: 0.14, w: 0.88, h: 0.68 },
  // squarest keeps the most vertical room.
  "1:1": { x: 0.07, y: 0.12, w: 0.86, h: 0.74 },
};

/** The allowed caption rectangle for a ratio (a fresh copy). */
export function safeArea(ratio: AspectRatio): BoundingBox {
  const r = SAFE[ratio];
  return { x: r.x, y: r.y, w: r.w, h: r.h };
}

/** Bounding box enclosing all boxes, or null when there are none. */
export function unionBox(boxes: BoundingBox[]): BoundingBox | null {
  if (boxes.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.x);
    minY = Math.min(minY, b.y);
    maxX = Math.max(maxX, b.x + b.w);
    maxY = Math.max(maxY, b.y + b.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

/**
 * The full list of zones a caption must avoid: UI bands (derived from the safe
 * area), every face box, and every product box.
 */
export function forbiddenZones(input: {
  faceBoxes: BoundingBox[];
  productBoxes?: BoundingBox[];
  ratio: AspectRatio;
}): BoundingBox[] {
  const safe = safeArea(input.ratio);
  const topInset = safe.y;
  const bottomInset = 1 - (safe.y + safe.h);
  const zones: BoundingBox[] = [
    { x: 0, y: 0, w: 1, h: topInset }, // top UI
    { x: 0, y: 1 - bottomInset, w: 1, h: bottomInset }, // bottom UI / caption bar
  ];
  for (const f of input.faceBoxes) zones.push(f);
  for (const p of input.productBoxes ?? []) zones.push(p);
  return zones;
}

/** Euclidean distance from a point to the nearest edge of a rect (0 if inside). */
function distPointRect(px: number, py: number, b: BoundingBox): number {
  const dx = Math.max(b.x - px, 0, px - (b.x + b.w));
  const dy = Math.max(b.y - py, 0, py - (b.y + b.h));
  return Math.hypot(dx, dy);
}

/** Is the point within a padded rect? */
function insidePadded(
  px: number,
  py: number,
  b: BoundingBox,
  pad: number,
): boolean {
  return (
    px >= b.x - pad &&
    px <= b.x + b.w + pad &&
    py >= b.y - pad &&
    py <= b.y + b.h + pad
  );
}

/**
 * Resolve the caption anchor for a block's frame range. Searches a grid inside
 * the safe area and picks the point that maximises clearance from all
 * forbidden zones, gently biased toward the central column and the preferred
 * point (default: lower-centre of the safe area). Returns { ok:false } with a
 * note when the safe area is fully occluded.
 */
export function solveCaptionAnchor(input: {
  startFrame: number;
  endFrame: number;
  faceBoxes: BoundingBox[];
  productBoxes?: BoundingBox[];
  ratio: AspectRatio;
  preferred?: { x: number; y: number };
}): { anchor: { x: number; y: number }; ok: boolean; note?: string } {
  const { faceBoxes, productBoxes, ratio, preferred } = input;
  const safe = safeArea(ratio);
  const zones = forbiddenZones({ faceBoxes, productBoxes, ratio });

  // Default target: lower-centre of the safe area (classic caption seat).
  const target = preferred ?? { x: 0.5, y: safe.y + safe.h * 0.72 };

  const pad = 0.02; // keep glyphs a hair clear of any zone edge
  const NX = 11;
  const NY = 15;

  let best: { x: number; y: number; score: number } | null = null;

  for (let ix = 0; ix < NX; ix++) {
    const gx = safe.x + safe.w * (ix / (NX - 1));
    for (let iy = 0; iy < NY; iy++) {
      const gy = safe.y + safe.h * (iy / (NY - 1));

      // Reject candidates that fall inside (or hug) any forbidden zone.
      let blocked = false;
      for (const z of zones) {
        if (insidePadded(gx, gy, z, pad)) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;

      // Primary: clearance to the nearest forbidden zone.
      let clearance = Infinity;
      for (const z of zones) {
        const d = distPointRect(gx, gy, z);
        if (d < clearance) clearance = d;
      }

      // Secondary shaping: prefer the central column / central third, and pull
      // toward the target seat — but clearance dominates.
      const centerCol = 1 - Math.min(1, Math.abs(gx - 0.5) / 0.5);
      const centralThird = 1 - Math.min(1, Math.abs(gy - 0.5) / 0.33);
      const targetPull = Math.hypot(gx - target.x, gy - target.y);

      const score =
        clearance * 1.0 + (centerCol + centralThird) * 0.1 - targetPull * 0.3;

      if (!best || score > best.score) best = { x: gx, y: gy, score };
    }
  }

  if (!best) {
    // Everything is occluded. Hand back a best-effort seat and flag it.
    return {
      anchor: { x: clamp01(target.x), y: clamp01(target.y) },
      ok: false,
      note: "sin región libre de rostro/producto/UI en el rango; recorta o mueve el bloque",
    };
  }

  return { anchor: { x: clamp01(best.x), y: clamp01(best.y) }, ok: true };
}
