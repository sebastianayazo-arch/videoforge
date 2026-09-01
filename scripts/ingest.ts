/**
 * Ingest & normalise (Module 13, entry).
 *
 * For every raw clip: ffprobe it for the TRUTH (fps, w/h, duration, and the
 * EXPLICIT display rotation from side-data), pull three verification frames at
 * 10/50/90%, and transcode to a canonical 1080x1920 H.264 master honouring that
 * rotation — so every later stage works against uniform footage.
 *
 * Returns `ClipVisionAnalysis`-shaped records. Histogram / faces / flow are
 * left null here; color.ts, occlusion.ts and stabilize.ts fill those in.
 *
 * Degrades with elegance: a missing input file or missing ffmpeg/ffprobe is
 * reported and skipped, never faked.
 */

import { basename, extname, join } from "node:path";
import type { ClipVisionAnalysis } from "../src/types.js";
import {
  ensureDir,
  existsSync,
  hasBinary,
  isMain,
  log,
  tryRun,
  writeJson,
} from "./_util.js";

/** ffprobe -show_streams / -show_format (partial, only what we consume). */
interface FfprobeSideData {
  side_data_type?: string;
  rotation?: number;
}
interface FfprobeStream {
  codec_type?: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  duration?: string;
  tags?: { rotate?: string };
  side_data_list?: FfprobeSideData[];
}
interface FfprobeFormat {
  duration?: string;
}
interface FfprobeJson {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
}

export interface IngestProbe {
  clipId: string;
  input: string;
  width: number;
  height: number;
  fps: number;
  durationSec: number;
  rotation: 0 | 90 | 180 | 270;
}

export interface IngestResult {
  probe: IngestProbe;
  /** Canonical 1080x1920 H.264 master (empty if transcode degraded). */
  master: string;
  /** Verification frames at 10/50/90% (empty if extraction degraded). */
  frames: string[];
  analysis: ClipVisionAnalysis;
  degraded: string[];
}

/** Parse "30000/1001" style rationals to fps. Falls back to 30. */
function parseFps(rate: string | undefined): number {
  if (!rate) return 30;
  const parts = rate.split("/");
  const num = Number(parts[0]);
  const den = parts.length > 1 ? Number(parts[1]) : 1;
  if (!Number.isFinite(num) || !Number.isFinite(den) || den === 0) return 30;
  const fps = num / den;
  return fps > 0 ? Math.round(fps * 1000) / 1000 : 30;
}

/** Normalise any rotation reading to one of 0/90/180/270 (display degrees). */
function normaliseRotation(raw: number): 0 | 90 | 180 | 270 {
  const r = (((Math.round(raw / 90) * 90) % 360) + 360) % 360;
  return (r === 90 || r === 180 || r === 270 ? r : 0) as 0 | 90 | 180 | 270;
}

/**
 * Extract explicit rotation. Newer ffmpeg exposes it via the Display Matrix
 * side-data (`rotation`, typically the negative of the display rotation);
 * older files carry `tags.rotate`. We read both and prefer side-data.
 */
function extractRotation(stream: FfprobeStream): 0 | 90 | 180 | 270 {
  const side = (stream.side_data_list ?? []).find(
    (s) => typeof s.rotation === "number",
  );
  if (side && typeof side.rotation === "number") {
    // Display-matrix rotation is the clockwise angle to UNDO; the displayed
    // orientation is its negation. Normalise the absolute display angle.
    return normaliseRotation(-side.rotation);
  }
  const tag = stream.tags?.rotate;
  if (tag != null) {
    const n = Number(tag);
    if (Number.isFinite(n)) return normaliseRotation(n);
  }
  return 0;
}

/**
 * ffmpeg transpose chain to bake `rotation` degrees of display rotation into
 * pixels. Paired with `-noautorotate` so ffmpeg does NOT also apply the display
 * matrix (which would double the rotation).
 *   90  → transpose=1 (90° clockwise)
 *   270 → transpose=2 (90° counter-clockwise)
 *   180 → two 90° turns
 */
function rotationFilter(rotation: 0 | 90 | 180 | 270): string {
  switch (rotation) {
    case 90:
      return "transpose=1";
    case 270:
      return "transpose=2";
    case 180:
      return "transpose=1,transpose=1";
    default:
      return "";
  }
}

/** Fit-inside-and-pad to the 1080x1920 canvas, square pixels. */
const CANVAS_FILTER =
  "scale=1080:1920:force_original_aspect_ratio=decrease," +
  "pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=black,setsar=1";

/** Probe a clip with ffprobe. Returns null if ffprobe is unavailable. */
export function probeClip(input: string, clipId: string): IngestProbe | null {
  const raw = tryRun("ffprobe", [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_streams",
    "-show_format",
    input,
  ]);
  if (raw == null) return null;

  const json = JSON.parse(raw) as FfprobeJson;
  const video = (json.streams ?? []).find((s) => s.codec_type === "video");
  if (!video) throw new Error(`ingest: no video stream in ${input}`);

  const durationStr = video.duration ?? json.format?.duration;
  const durationSec = durationStr ? Number(durationStr) : 0;

  return {
    clipId,
    input,
    width: video.width ?? 0,
    height: video.height ?? 0,
    fps: parseFps(video.r_frame_rate ?? video.avg_frame_rate),
    durationSec: Number.isFinite(durationSec) ? durationSec : 0,
    rotation: extractRotation(video),
  };
}

/** Extract verification frames at 10/50/90% of the duration. */
function extractFrames(
  input: string,
  durationSec: number,
  outDir: string,
  clipId: string,
): string[] {
  if (durationSec <= 0) return [];
  const out: string[] = [];
  for (const pct of [0.1, 0.5, 0.9]) {
    const t = (durationSec * pct).toFixed(3);
    const dst = join(outDir, `${clipId}_verify_${Math.round(pct * 100)}.png`);
    // -ss before -i for a fast keyframe seek; -frames:v 1 for a single frame.
    const res = tryRun("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      t,
      "-i",
      input,
      "-frames:v",
      "1",
      dst,
    ]);
    if (res != null && existsSync(dst)) out.push(dst);
  }
  return out;
}

/** Transcode to the canonical 1080x1920 H.264 master honouring rotation. */
function normaliseMaster(
  input: string,
  rotation: 0 | 90 | 180 | 270,
  outDir: string,
  clipId: string,
): string | null {
  const dst = join(outDir, `${clipId}_1080x1920.mp4`);
  const rot = rotationFilter(rotation);
  const vf = rot ? `${rot},${CANVAS_FILTER}` : CANVAS_FILTER;
  const res = tryRun("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-noautorotate", // we bake rotation ourselves via `vf`
    "-i",
    input,
    "-vf",
    vf,
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
    "aac",
    "-b:a",
    "192k",
    "-movflags",
    "+faststart",
    dst,
  ]);
  return res != null && existsSync(dst) ? dst : null;
}

/**
 * Ingest a single clip end-to-end. `clipId` defaults to the input basename.
 */
export function ingestClip(input: string, workDir: string): IngestResult {
  const clipId = basename(input, extname(input));
  const degraded: string[] = [];
  ensureDir(workDir);

  if (!existsSync(input)) {
    log.warn(`missing input, skipping: ${input}`);
    degraded.push(`missing-input:${input}`);
  }

  const ffprobeOk = hasBinary("ffprobe");
  const ffmpegOk = hasBinary("ffmpeg");

  let probe: IngestProbe | null = null;
  if (existsSync(input) && ffprobeOk) {
    probe = probeClip(input, clipId);
  }
  if (!probe) {
    if (!ffprobeOk) {
      // DEGRADED: ffprobe not installed. Real integration needs FFmpeg on PATH;
      // we cannot know true fps/rotation without it, so emit safe defaults.
      log.degraded("ffprobe unavailable — using placeholder probe defaults");
      degraded.push("ffprobe-unavailable");
    }
    probe = {
      clipId,
      input,
      width: 0,
      height: 0,
      fps: 30,
      durationSec: 0,
      rotation: 0,
    };
  } else {
    log.ok(
      `${clipId}: ${probe.width}x${probe.height} @ ${probe.fps}fps, ` +
        `${probe.durationSec.toFixed(2)}s, rotation=${probe.rotation}`,
    );
  }

  let frames: string[] = [];
  let master = "";
  if (existsSync(input) && ffmpegOk) {
    frames = extractFrames(input, probe.durationSec, workDir, clipId);
    const m = normaliseMaster(input, probe.rotation, workDir, clipId);
    if (m) {
      master = m;
      log.ok(`normalised → ${basename(master)}`);
    } else {
      degraded.push("transcode-failed");
    }
    if (frames.length < 3) degraded.push("verification-frames-incomplete");
  } else if (existsSync(input) && !ffmpegOk) {
    // DEGRADED: ffmpeg missing. Real integration needs FFmpeg on PATH to
    // transcode and to extract verification frames.
    log.degraded("ffmpeg unavailable — no master/frames produced");
    degraded.push("ffmpeg-unavailable");
  }

  const analysis: ClipVisionAnalysis = {
    clipId,
    fps: probe.fps,
    width: 1080,
    height: 1920,
    rotation: probe.rotation,
    faces: [], // filled by occlusion.ts / vision
    flow: [], // filled by stabilize.ts
    // histogram & whiteBalanceKelvin left undefined — color.ts computes them.
  };

  return { probe, master, frames, analysis, degraded };
}

/** Ingest many clips into a shared work dir; returns one result each. */
export function ingest(inputs: string[], workDir: string): IngestResult[] {
  return inputs.map((input) => ingestClip(input, workDir));
}

function main(): void {
  const argv = process.argv.slice(2);
  const inputs = argv.filter((a) => !a.startsWith("--"));
  const outFlag = argv.find((a) => a.startsWith("--out="));
  const workDir = outFlag ? outFlag.slice("--out=".length) : "work/ingest";

  if (inputs.length === 0) {
    log.warn("usage: tsx scripts/ingest.ts <clip...> [--out=work/ingest]");
    process.exit(2);
  }

  log.section(`Ingest ${inputs.length} clip(s) → ${workDir}`);
  const results = ingest(inputs, workDir);
  const manifest = join(workDir, "ingest.json");
  writeJson(manifest, results);
  log.section("Done");
  log.info(`manifest: ${manifest}`);
  const anyDegraded = results.some((r) => r.degraded.length > 0);
  process.stdout.write(manifest + "\n");
  if (anyDegraded) log.degraded("one or more clips degraded — see manifest");
}

if (isMain(import.meta.url)) main();
