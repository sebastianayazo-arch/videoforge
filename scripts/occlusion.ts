/**
 * Caption occlusion CLI (Module 3.4).
 *
 * Gathers face + product boxes (vision) for each caption block's frame span,
 * then defers to `solveCaptionAnchor` (../src/captions/spatial/occlusion.ts,
 * authored separately) to place the caption anchor clear of faces/product.
 *
 * Face/product detection is external (MediaPipe / OpenCV). When those aren't
 * installed we DO NOT invent boxes — we degrade to an empty detection, log what
 * real integration needs, and let the solver fall back to the preferred anchor.
 *
 * The solver is loaded lazily so this CLI still runs (degraded) before that file
 * exists; the call matches the agreed signature exactly.
 */

import { hasBinary, isMain, log, readJson, writeJson } from "./_util.js";
import type { AspectRatio, BoundingBox } from "../src/types.js";

/** Exact signature of the solver another agent is authoring. */
type SolveFn = (input: {
  startFrame: number;
  endFrame: number;
  faceBoxes: BoundingBox[];
  productBoxes?: BoundingBox[];
  ratio: AspectRatio;
  preferred?: { x: number; y: number };
}) => { anchor: { x: number; y: number }; ok: boolean; note?: string };

export interface AnchorBlock {
  id: string;
  startFrame: number;
  endFrame: number;
  preferred?: { x: number; y: number };
}

export interface SolvedAnchor {
  id: string;
  anchor: { x: number; y: number };
  ok: boolean;
  note?: string;
}

let solverCache: SolveFn | null | undefined;

/** Lazily load the solver; null if it isn't authored/available yet. */
async function getSolver(): Promise<SolveFn | null> {
  if (solverCache !== undefined) return solverCache;
  try {
    const mod = (await import("../src/captions/spatial/occlusion.js")) as {
      solveCaptionAnchor?: SolveFn;
    };
    solverCache = mod.solveCaptionAnchor ?? null;
  } catch {
    solverCache = null;
  }
  return solverCache;
}

export interface DetectedBoxes {
  faceBoxes: BoundingBox[];
  productBoxes: BoundingBox[];
}

/**
 * Detect faces + product regions across a block's frame span.
 *
 * DEGRADED: real integration runs MediaPipe FaceDetection (or OpenCV DNN) and a
 * product detector (annotated regions / OpenCV) over sampled frames, returning
 * normalised boxes. No detector binary here ⇒ empty detection.
 */
export function detectBoxes(
  _video: string,
  _startFrame: number,
  _endFrame: number,
): DetectedBoxes {
  // No detector CLI is wired in this environment; a MediaPipe/OpenCV script
  // would be shelled to here. Absent that, degrade to an empty detection.
  if (!hasBinary("mediapipe")) {
    log.degraded(
      "no face/product detector — needs MediaPipe (python) or OpenCV DNN; " +
        "returning empty boxes so the solver uses the preferred anchor",
    );
  }
  return { faceBoxes: [], productBoxes: [] };
}

/** Solve anchors for a set of caption blocks. */
export async function solveBlocks(
  video: string,
  blocks: AnchorBlock[],
  ratio: AspectRatio,
): Promise<SolvedAnchor[]> {
  const solver = await getSolver();
  const out: SolvedAnchor[] = [];

  for (const block of blocks) {
    const { faceBoxes, productBoxes } = detectBoxes(
      video,
      block.startFrame,
      block.endFrame,
    );

    if (!solver) {
      // DEGRADED: solver not present yet. Fall back to the preferred anchor
      // (or a safe lower-third) so the pipeline still yields a placement.
      const anchor = block.preferred ?? { x: 0.5, y: 0.82 };
      out.push({
        id: block.id,
        anchor,
        ok: false,
        note: "solveCaptionAnchor unavailable — preferred/lower-third fallback",
      });
      continue;
    }

    const res = solver({
      startFrame: block.startFrame,
      endFrame: block.endFrame,
      faceBoxes,
      productBoxes: productBoxes.length ? productBoxes : undefined,
      ratio,
      preferred: block.preferred,
    });
    out.push({ id: block.id, anchor: res.anchor, ok: res.ok, note: res.note });
  }
  return out;
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const get = (k: string) =>
    argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const video = get("video") ?? "";
  const blocksPath = get("blocks");
  const ratio = (get("ratio") ?? "9:16") as AspectRatio;
  const out = get("out") ?? "work/anchors.json";

  if (!blocksPath) {
    log.warn(
      "usage: tsx scripts/occlusion.ts --blocks=blocks.json [--video=master.mp4] [--ratio=9:16] [--out=work/anchors.json]",
    );
    process.exit(2);
  }

  const blocks = readJson<AnchorBlock[]>(blocksPath);
  log.section(`Occlusion: ${blocks.length} block(s) @ ${ratio}`);
  const solved = await solveBlocks(video, blocks, ratio);
  writeJson(out, solved);
  const failed = solved.filter((s) => !s.ok).length;
  log.info(`${solved.length} anchors solved, ${failed} degraded/fallback`);
  process.stdout.write(out + "\n");
}

if (isMain(import.meta.url)) void main();
