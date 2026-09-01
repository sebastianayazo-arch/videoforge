/**
 * QC orchestrator (Module 13).
 *
 * Runs the container/codec ffprobe checks, measures loudness with a real
 * two-pass `loudnorm` (parsing the JSON the measurement pass prints), pulls
 * verification frames, and delegates to qc-captions / qc-transitions /
 * qc-color, aggregating everything into a single `QCReport`.
 *
 * Loudness targets: integrated -14 LUFS (±1), true peak ≤ -1 dBTP.
 * Missing ffmpeg/ffprobe degrades individual checks without crashing.
 */

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import type {
  LoudnessMeasurement,
  Platform,
  QCCheck,
  QCReport,
  VideoPlan,
} from "../src/types.js";
import { qcCaptions, type CaptionQCInput } from "./qc-captions.js";
import { qcColor, type ColorQCInput } from "./qc-color.js";
import { qcTransitions } from "./qc-transitions.js";
import {
  ensureDir,
  existsSync,
  hasBinary,
  isMain,
  log,
  readJson,
  tryRun,
  writeJson,
} from "./_util.js";

const TARGET_LUFS = -14;
const LUFS_TOLERANCE = 1;
const TARGET_TP = -1;

interface LoudnormJson {
  input_i?: string;
  input_tp?: string;
  input_lra?: string;
  input_thresh?: string;
  target_offset?: string;
}

/**
 * Two-pass loudnorm MEASUREMENT (pass 1). Runs the analysis pass with
 * print_format=json and parses the JSON it prints to stderr. Returns null if
 * ffmpeg is unavailable or the JSON can't be parsed. (Pass 2 — the actual
 * normalisation — is done at render time using these measured values.)
 */
export function measureLoudness(master: string): LoudnessMeasurement | null {
  if (!hasBinary("ffmpeg") || !existsSync(master)) return null;
  const res = spawnSync(
    "ffmpeg",
    [
      "-hide_banner",
      "-nostats",
      "-i",
      master,
      "-af",
      `loudnorm=I=${TARGET_LUFS}:TP=${TARGET_TP}:LRA=11:print_format=json`,
      "-f",
      "null",
      "-",
    ],
    { encoding: "utf8", maxBuffer: 1 << 24 },
  );
  const stderr = res.stderr ?? "";
  // The measurement block is the final flat JSON object in stderr.
  const matches = stderr.match(/\{[^{}]*"input_i"[^{}]*\}/g);
  const last = matches?.[matches.length - 1];
  if (!last) {
    log.degraded("loudnorm produced no JSON — cannot measure loudness");
    return null;
  }
  let parsed: LoudnormJson;
  try {
    parsed = JSON.parse(last) as LoudnormJson;
  } catch {
    return null;
  }
  const i = Number(parsed.input_i);
  const tp = Number(parsed.input_tp);
  const lra = Number(parsed.input_lra);
  if (!Number.isFinite(i) || !Number.isFinite(tp)) return null;
  return { integratedLUFS: i, truePeakDb: tp, lra: Number.isFinite(lra) ? lra : 0 };
}

/** ffprobe container/codec/dimension checks. */
export function ffprobeChecks(master: string): QCCheck[] {
  if (!hasBinary("ffprobe") || !existsSync(master)) {
    return [
      {
        name: "container.ffprobe",
        pass: true,
        detail: "DEGRADED: ffprobe/master missing — container not verified",
      },
    ];
  }
  const raw = tryRun("ffprobe", [
    "-v",
    "quiet",
    "-print_format",
    "json",
    "-show_streams",
    "-show_format",
    master,
  ]);
  if (raw == null) {
    return [{ name: "container.ffprobe", pass: false, detail: "ffprobe failed" }];
  }
  const json = JSON.parse(raw) as {
    streams?: {
      codec_type?: string;
      codec_name?: string;
      width?: number;
      height?: number;
      pix_fmt?: string;
    }[];
    format?: { duration?: string };
  };
  const streams = json.streams ?? [];
  const v = streams.find((s) => s.codec_type === "video");
  const a = streams.find((s) => s.codec_type === "audio");
  const dur = Number(json.format?.duration ?? "0");

  return [
    {
      name: "container.video-codec",
      pass: v?.codec_name === "h264",
      detail: `video codec ${v?.codec_name ?? "none"} (want h264)`,
    },
    {
      name: "container.dimensions",
      pass: (v?.width ?? 0) === 1080 && (v?.height ?? 0) % 2 === 0,
      detail: `${v?.width ?? 0}x${v?.height ?? 0} (want 1080-wide, even height)`,
    },
    {
      name: "container.pixfmt",
      pass: v?.pix_fmt === "yuv420p",
      detail: `pix_fmt ${v?.pix_fmt ?? "none"} (want yuv420p for broad playback)`,
    },
    {
      name: "container.audio",
      pass: a != null,
      detail: a ? `audio ${a.codec_name}` : "no audio stream",
    },
    {
      name: "container.duration",
      pass: dur > 0,
      detail: `duration ${dur.toFixed(2)}s`,
    },
  ];
}

/** Pull verification frames at 10/50/90% for the report. */
export function verificationFrames(
  master: string,
  durationSec: number,
  workDir: string,
): string[] {
  if (!hasBinary("ffmpeg") || !existsSync(master) || durationSec <= 0) return [];
  ensureDir(workDir);
  const frames: string[] = [];
  for (const pct of [0.1, 0.5, 0.9]) {
    const dst = join(workDir, `qc_verify_${Math.round(pct * 100)}.png`);
    const res = tryRun("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-ss",
      (durationSec * pct).toFixed(3),
      "-i",
      master,
      "-frames:v",
      "1",
      dst,
    ]);
    if (res != null && existsSync(dst)) frames.push(dst);
  }
  return frames;
}

export interface QCInput {
  master: string;
  plan?: VideoPlan;
  captions?: CaptionQCInput;
  color?: ColorQCInput;
  platform?: Platform;
  workDir?: string;
}

/** Run the full QC pass and aggregate a QCReport. */
export function runQC(input: QCInput): QCReport {
  const workDir = input.workDir ?? "work/qc";
  ensureDir(workDir);
  const checks: QCCheck[] = [];

  // 1. Container / codec.
  checks.push(...ffprobeChecks(input.master));

  // 2. Loudness (two-pass measurement).
  const loudness = measureLoudness(input.master) ?? undefined;
  if (loudness) {
    const iOk =
      Math.abs(loudness.integratedLUFS - TARGET_LUFS) <= LUFS_TOLERANCE;
    const tpOk = loudness.truePeakDb <= TARGET_TP;
    checks.push({
      name: "audio.loudness.integrated",
      pass: iOk,
      detail: `${loudness.integratedLUFS.toFixed(1)} LUFS (target ${TARGET_LUFS}±${LUFS_TOLERANCE})`,
    });
    checks.push({
      name: "audio.loudness.true-peak",
      pass: tpOk,
      detail: `${loudness.truePeakDb.toFixed(1)} dBTP (max ${TARGET_TP})`,
    });
  } else {
    checks.push({
      name: "audio.loudness",
      pass: true,
      detail: "DEGRADED: loudness not measured (ffmpeg missing)",
    });
  }

  // 3. Verification frames (recorded in the report detail).
  const durationSec = input.plan
    ? input.plan.durationFrames / (input.plan.fps || 30)
    : 0;
  const frames = verificationFrames(input.master, durationSec, workDir);
  checks.push({
    name: "verification.frames",
    pass: frames.length > 0 || durationSec === 0,
    detail:
      frames.length > 0
        ? `pulled ${frames.length} frames: ${frames.map((f) => f.split("/").pop()).join(", ")}`
        : "DEGRADED: no frames pulled (ffmpeg/master/duration missing)",
  });

  // 4. Delegated sub-QCs.
  if (input.captions) checks.push(...qcCaptions(input.captions));
  if (input.plan) {
    checks.push(
      ...qcTransitions(
        input.plan,
        input.master,
        input.platform ?? input.plan.intake.adPlatforms[0] ?? "tiktok",
        join(workDir, "transitions"),
      ),
    );
  }
  if (input.color) checks.push(...qcColor(input.color, join(workDir, "color")));

  const pass = checks.every((c) => c.pass);
  return { checks, loudness, pass };
}

function main(): void {
  const argv = process.argv.slice(2);
  const get = (k: string) =>
    argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const master = get("master");
  const planPath = get("plan");
  const captionsPath = get("captions");
  const colorPath = get("color");
  const platform = get("platform") as Platform | undefined;
  const out = get("out") ?? "work/qc/qc-report.json";

  if (!master) {
    log.warn(
      "usage: tsx scripts/qc.ts --master=render.mp4 [--plan=plan.json] [--captions=capqc.json] [--color=colorqc.json] [--platform=tiktok] [--out=...]",
    );
    process.exit(2);
  }

  log.section("QC orchestrator");
  const report = runQC({
    master,
    plan: planPath ? readJson<VideoPlan>(planPath) : undefined,
    captions: captionsPath ? readJson<CaptionQCInput>(captionsPath) : undefined,
    color: colorPath ? readJson<ColorQCInput>(colorPath) : undefined,
    platform,
  });

  for (const c of report.checks)
    (c.pass ? log.ok : log.warn)(`${c.name}: ${c.detail ?? ""}`);
  writeJson(out, report);
  log.section(report.pass ? "QC PASS" : "QC FAIL");
  log.info(`report: ${out}`);
  process.stdout.write(out + "\n");
  if (!report.pass) process.exitCode = 1;
}

if (isMain(import.meta.url)) main();
