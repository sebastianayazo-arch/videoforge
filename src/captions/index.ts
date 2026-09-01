/**
 * Captions pipeline (Module 3 — "captions are the product").
 *
 * Ties the three sub-modules together into one finished caption track:
 *   1. filter transcript to words spoken TO CAMERA (never `voz_direccion`),
 *   2. group them into rhythmic blocks (rhythm/builder),
 *   3. solve each block's on-screen anchor against the real faces/product in
 *      its frame range (spatial/occlusion), shortening or moving a block when
 *      the frame is fully occluded,
 *   4. emit a finished `CaptionBlock[]` plus an `.srt` sidecar.
 *
 * Deterministic given the same inputs.
 */

import type {
  AspectRatio,
  BoundingBox,
  BrandCaptionsProfile,
  CaptionBlock,
  ClipVisionAnalysis,
  Transcript,
  WordTiming,
} from "../types.js";
import { buildBlocks } from "./rhythm/builder.js";
import { solveCaptionAnchor } from "./spatial/occlusion.js";

export interface BuildCaptionTrackInput {
  transcript: Transcript;
  vision: ClipVisionAnalysis;
  /** Kept on the contract for styling symmetry (typography reads it). */
  brand: BrandCaptionsProfile;
  /** Composition fps (captions are frame-relative to this). */
  fps: number;
  ratio: AspectRatio;
  /** Beat frames (composition fps) for rhythm snapping. */
  beats?: number[];
  /** Resolved, normalised product name(s) for the semantic tagger. */
  productNames?: ReadonlySet<string>;
  /** Preferred anchor seat; defaults to the solver's lower-centre. */
  preferred?: { x: number; y: number };
}

/** Do two [start,end) ranges overlap? */
const overlaps = (
  aStart: number,
  aEnd: number,
  bStart: number,
  bEnd: number,
): boolean => aStart < bEnd && aEnd > bStart;

/**
 * Keep only words the model speaks to camera. Direction ("voz_direccion") and
 * ambience are NEVER captioned. When the transcript carries no roles at all we
 * assume to-camera (nothing to exclude); when roles exist, a word survives
 * only if it overlaps a `voz_modelo_a_camara` segment.
 */
function filterToCamera(t: Transcript): WordTiming[] {
  const camera = t.segments.filter((s) => s.role === "voz_modelo_a_camara");
  const hasRoles = t.segments.length > 0;
  return t.words.filter((w) => {
    if (camera.some((s) => overlaps(w.start, w.end, s.start, s.end))) return true;
    return !hasRoles;
  });
}

/**
 * Collect every face box on screen during a composition frame range. Vision
 * keyframes may be sampled at a different fps, so we convert the range into
 * vision-frame space first.
 */
function facesInRange(
  vision: ClipVisionAnalysis,
  startFrame: number,
  endFrame: number,
  fps: number,
): BoundingBox[] {
  const scale = vision.fps > 0 && fps > 0 ? vision.fps / fps : 1;
  const vs = Math.floor(startFrame * scale);
  const ve = Math.ceil(endFrame * scale);
  const boxes: BoundingBox[] = [];
  for (const track of vision.faces) {
    for (const key of Object.keys(track.boxesByFrame)) {
      const f = Number(key);
      if (!Number.isFinite(f) || f < vs || f > ve) continue;
      const box = track.boxesByFrame[f];
      if (box) boxes.push(box);
    }
  }
  return boxes;
}

/** Product boxes on screen during a composition frame range (vision-fps aware). */
function productsInRange(
  vision: ClipVisionAnalysis,
  startFrame: number,
  endFrame: number,
  fps: number,
): BoundingBox[] {
  const region = vision.productRegionByFrame;
  if (!region) return [];
  const scale = vision.fps > 0 && fps > 0 ? vision.fps / fps : 1;
  const vs = Math.floor(startFrame * scale);
  const ve = Math.ceil(endFrame * scale);
  const boxes: BoundingBox[] = [];
  for (const key of Object.keys(region)) {
    const f = Number(key);
    if (!Number.isFinite(f) || f < vs || f > ve) continue;
    const box = region[f];
    if (box) boxes.push(box);
  }
  return boxes;
}

/** Clamp per-word karaoke frames into a (possibly trimmed) block window. */
function clampWordFrames(
  wordFrames: CaptionBlock["wordFrames"],
  startFrame: number,
  endFrame: number,
): CaptionBlock["wordFrames"] {
  const clamped = wordFrames
    .map((w) => ({
      text: w.text,
      startFrame: Math.max(w.startFrame, startFrame),
      endFrame: Math.min(w.endFrame, endFrame),
    }))
    .filter((w) => w.endFrame > w.startFrame);
  return clamped.length > 0 ? clamped : wordFrames;
}

/**
 * Build the finished caption track for a clip.
 */
export function buildCaptionTrack(
  input: BuildCaptionTrackInput,
): CaptionBlock[] {
  const { transcript, vision, fps, ratio, beats = [], productNames, preferred } =
    input;

  // 1. Words spoken to camera only.
  const words = filterToCamera(transcript);

  // 2. Rhythmic blocks (anchor still unresolved).
  const unanchored = buildBlocks(words, fps, {
    productNames,
    beatFrames: beats,
    isFirstOfVideo: true,
  });

  const minFrames = Math.max(1, Math.round(0.5 * fps));
  const out: CaptionBlock[] = [];

  for (const b of unanchored) {
    let sF = b.startFrame;
    let eF = b.endFrame;

    const attempt = (s: number, e: number) =>
      solveCaptionAnchor({
        startFrame: s,
        endFrame: e,
        faceBoxes: facesInRange(vision, s, e, fps),
        productBoxes: productsInRange(vision, s, e, fps),
        ratio,
        preferred,
      });

    let res = attempt(sF, eF);

    // 3. Occluded? Shorten / move the window so faces clear, then re-solve.
    if (!res.ok) {
      const span = eF - sF;
      const half = Math.max(minFrames, Math.round(span * 0.6));
      const trim = Math.round(span * 0.2);
      const variants: Array<[number, number]> = [
        [sF, sF + half], // keep the head (faces often enter late)
        [eF - half, eF], // keep the tail (faces often leave early)
        [sF + trim, eF - trim], // squeeze to the middle
      ];
      for (const [vs, ve] of variants) {
        if (ve - vs < minFrames) continue;
        const r = attempt(vs, ve);
        if (r.ok) {
          res = r;
          sF = vs;
          eF = ve;
          break;
        }
      }
    }

    const wordFrames =
      sF !== b.startFrame || eF !== b.endFrame
        ? clampWordFrames(b.wordFrames, sF, eF)
        : b.wordFrames;

    out.push({
      ...b,
      startFrame: sF,
      endFrame: eF,
      wordFrames,
      anchor: res.anchor, // best-effort seat even when ok:false
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// SRT sidecar (Module 3)
// ---------------------------------------------------------------------------

/** Frame → SRT timecode "HH:MM:SS,mmm". */
function toTimecode(frame: number, fps: number): string {
  const totalMs = fps > 0 ? Math.max(0, Math.round((frame / fps) * 1000)) : 0;
  const ms = totalMs % 1000;
  const totalSec = Math.floor(totalMs / 1000);
  const s = totalSec % 60;
  const m = Math.floor(totalSec / 60) % 60;
  const h = Math.floor(totalSec / 3600);
  const p2 = (n: number) => String(n).padStart(2, "0");
  const p3 = (n: number) => String(n).padStart(3, "0");
  return `${p2(h)}:${p2(m)}:${p2(s)},${p3(ms)}`;
}

/** Render the caption track as an `.srt` string. */
export function toSRT(blocks: CaptionBlock[], fps: number): string {
  const cues = blocks.map((b, i) => {
    const text = b.tokens.map((t) => t.text).join(" ");
    return `${i + 1}\n${toTimecode(b.startFrame, fps)} --> ${toTimecode(
      b.endFrame,
      fps,
    )}\n${text}`;
  });
  return cues.join("\n\n") + "\n";
}
