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

import {
  existsSync,
  hasBinary,
  isMain,
  log,
  readJson,
  tryRun,
  writeJson,
} from "./_util.js";
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

/** Shape of the `mediapipe` detector CLI's stdout JSON. */
interface DetectorOutput {
  faceBoxes?: BoundingBox[];
  productBoxes?: BoundingBox[];
  error?: string;
}

/**
 * Detect faces + product regions across a block's frame span.
 *
 * REAL integration: shells out to the `mediapipe` detector CLI
 * (integrations/mediapipe_detect.py) which samples frames over [start,end] and
 * returns normalised face boxes via MediaPipe FaceDetection. Product detection
 * stays empty (no reliable brand-agnostic detector), which the solver treats as
 * "no product constraint". Degrades to an empty detection — never invented
 * boxes — when the detector binary is missing, the video is absent, or the run
 * fails, so the solver falls back to the preferred anchor.
 */
export function detectBoxes(
  video: string,
  startFrame: number,
  endFrame: number,
): DetectedBoxes {
  const empty: DetectedBoxes = { faceBoxes: [], productBoxes: [] };

  if (!video || !existsSync(video)) {
    return empty; // no frames to sample; solver uses preferred anchor
  }
  if (!hasBinary("mediapipe")) {
    log.degraded(
      "no face/product detector — needs MediaPipe (python) or OpenCV DNN; " +
        "returning empty boxes so the solver uses the preferred anchor",
    );
    return empty;
  }

  const stdout = tryRun("mediapipe", [
    "--video",
    video,
    "--start-frame",
    String(Math.max(0, Math.floor(startFrame))),
    "--end-frame",
    String(Math.max(0, Math.floor(endFrame))),
    "--samples",
    "5",
  ]);
  if (stdout == null) {
    log.degraded("mediapipe run failed (ENOENT) — empty detection");
    return empty;
  }

  try {
    const parsed = JSON.parse(stdout.trim()) as DetectorOutput;
    if (parsed.error) {
      log.degraded(`mediapipe: ${parsed.error} — empty detection`);
      return empty;
    }
    return {
      faceBoxes: parsed.faceBoxes ?? [],
      productBoxes: parsed.productBoxes ?? [],
    };
  } catch {
    log.degraded("mediapipe output was not JSON — empty detection");
    return empty;
  }
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
