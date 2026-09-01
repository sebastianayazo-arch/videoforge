/**
 * Stabilisation & reframe (Module 8.4).
 *
 *  (a) STABILISE — FFmpeg vidstab two-pass: `vidstabdetect` writes a transform
 *      file, `vidstabtransform` applies smoothed motion (+ a light unsharp to
 *      recover the softening the warp introduces).
 *  (b) REFRAME — turn horizontal footage into 9:16 by cropping a vertical
 *      window that follows the subject centroid (from the vision face track),
 *      then scaling to the 1080x1920 canvas.
 *
 * vidstab requires an ffmpeg built with libvidstab; if ffmpeg (or the filter)
 * is missing we degrade and report — never fake a stabilised file.
 */

import { join } from "node:path";
import type { FaceTrack } from "../src/types.js";
import {
  ensureDir,
  existsSync,
  hasBinary,
  isMain,
  log,
  tryRun,
  writeJson,
} from "./_util.js";

export interface Centroid {
  /** Normalised 0..1 against frame width/height. */
  x: number;
  y: number;
}

export interface StabilizeOptions {
  shakiness?: number; // 1..10 (vidstabdetect)
  accuracy?: number; // 1..15
  smoothing?: number; // frames of look-ahead smoothing
  zoom?: number; // % constant zoom to hide borders
}

/**
 * vidstab two-pass. Returns the stabilised path, or null when ffmpeg/libvidstab
 * is unavailable or a pass fails.
 */
export function stabilizeTwoPass(
  input: string,
  out: string,
  workDir: string,
  opts: StabilizeOptions = {},
): string | null {
  ensureDir(workDir);
  const trf = join(workDir, "transforms.trf");
  const shakiness = opts.shakiness ?? 5;
  const accuracy = opts.accuracy ?? 15;
  const smoothing = opts.smoothing ?? 30;
  const zoom = opts.zoom ?? 0;

  // Pass 1 — detect. Output goes to null; the .trf file is the product.
  const p1 = tryRun("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    input,
    "-vf",
    `vidstabdetect=shakiness=${shakiness}:accuracy=${accuracy}:result=${trf}`,
    "-f",
    "null",
    "-",
  ]);
  if (p1 == null || !existsSync(trf)) {
    log.degraded("vidstabdetect unavailable/failed — needs ffmpeg + libvidstab");
    return null;
  }

  // Pass 2 — transform, then unsharp to counter warp softening.
  const p2 = tryRun("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    input,
    "-vf",
    `vidstabtransform=input=${trf}:smoothing=${smoothing}:zoom=${zoom}:optzoom=1,` +
      `unsharp=5:5:0.8:3:3:0.4`,
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    out,
  ]);
  if (p2 == null || !existsSync(out)) {
    log.degraded("vidstabtransform failed");
    return null;
  }
  log.ok(`stabilised → ${out}`);
  return out;
}

/** Mean centre of all boxes across a face track, normalised 0..1. Null if none. */
export function averageCentroid(faces: FaceTrack[]): Centroid | null {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const track of faces) {
    for (const key of Object.keys(track.boxesByFrame)) {
      const box = track.boxesByFrame[Number(key)];
      if (!box) continue;
      sx += box.x + box.w / 2;
      sy += box.y + box.h / 2;
      n += 1;
    }
  }
  if (n === 0) return null;
  return { x: sx / n, y: sy / n };
}

/**
 * Build the crop+scale filter to reframe WxH footage into a 9:16 window centred
 * on `centroidX` (normalised). The vertical window is full height; its width is
 * height*9/16, clamped inside the frame. Scales to the 1080x1920 canvas.
 */
export function reframeFilter(
  srcW: number,
  srcH: number,
  centroidX: number,
): string {
  const cw = Math.min(srcW, Math.round((srcH * 9) / 16));
  const ch = srcH;
  const cxCenter = centroidX * srcW - cw / 2;
  const x = Math.round(Math.max(0, Math.min(srcW - cw, cxCenter)));
  return `crop=${cw}:${ch}:${x}:0,scale=1080:1920:flags=bicubic,setsar=1`;
}

/** Reframe a horizontal clip to vertical 9:16 following the subject. */
export function reframeToVertical(
  input: string,
  out: string,
  srcW: number,
  srcH: number,
  centroid: Centroid | null,
): string | null {
  if (srcW <= 0 || srcH <= 0) {
    log.degraded("unknown source dimensions — cannot reframe");
    return null;
  }
  // No face track → centre crop (0.5). A real dynamic reframe would drive the
  // crop x with per-frame centroids via sendcmd; static centroid is the safe
  // fallback and covers the common talking-head case.
  const cx = centroid?.x ?? 0.5;
  const res = tryRun("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    input,
    "-vf",
    reframeFilter(srcW, srcH, cx),
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-preset",
    "medium",
    "-crf",
    "18",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "copy",
    "-movflags",
    "+faststart",
    out,
  ]);
  if (res == null || !existsSync(out)) {
    log.degraded("reframe render failed (ffmpeg missing?)");
    return null;
  }
  log.ok(`reframed → ${out} (centroid x=${cx.toFixed(2)})`);
  return out;
}

function main(): void {
  const argv = process.argv.slice(2);
  const get = (k: string) =>
    argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const input = argv.find((a) => !a.startsWith("--"));
  const workDir = get("out") ?? "work/stabilize";
  const doReframe = argv.includes("--reframe");
  const srcW = Number(get("w") ?? "0");
  const srcH = Number(get("h") ?? "0");
  const cx = get("cx");

  if (!input) {
    log.warn(
      "usage: tsx scripts/stabilize.ts <clip.mp4> [--reframe --w=1920 --h=1080 --cx=0.5] [--out=work/stabilize]",
    );
    process.exit(2);
  }
  if (!existsSync(input)) {
    log.warn(`missing input: ${input}`);
    process.exit(1);
  }

  ensureDir(workDir);
  log.section(`Stabilise ${input}`);
  const stab = join(workDir, "stabilized.mp4");
  const stabilized = stabilizeTwoPass(input, stab, workDir);
  const source = stabilized ?? input;

  const result: Record<string, unknown> = { input, stabilized };
  if (doReframe) {
    log.section("Reframe → 9:16");
    const reframed = join(workDir, "reframed.mp4");
    const centroid: Centroid | null = cx != null ? { x: Number(cx), y: 0.5 } : null;
    result.reframed = reframeToVertical(source, reframed, srcW, srcH, centroid);
  }

  const manifest = join(workDir, "stabilize.json");
  writeJson(manifest, result);
  log.section("Done");
  process.stdout.write(manifest + "\n");
}

if (isMain(import.meta.url)) main();
