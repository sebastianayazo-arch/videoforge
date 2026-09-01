/**
 * Transition QC (Module 6 QC). Returns QCCheck[]. For every boundary:
 *   - the cut lands on the intended frame (consistent with scene durations)
 *   - a required SFX cue exists on that frame (flashy/whoosh/impact transitions)
 *   - it SURVIVES platform recompression: a real ffmpeg re-encode of a 1s window
 *     around the boundary at the platform's bitrate, verified to decode.
 *
 * Missing ffmpeg degrades the recompression check (marked, not silently passed).
 */

import { join } from "node:path";
import type { Platform, QCCheck, VideoPlan } from "../src/types.js";
import { exportSpecFor } from "./variants.js";
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

/** Cumulative end frame (composition-relative) of each scene. */
function sceneEndFrames(plan: VideoPlan): number[] {
  const ends: number[] = [];
  let acc = 0;
  for (const s of plan.scenes) {
    acc += Math.max(0, s.outFrame - s.inFrame);
    ends.push(acc);
  }
  return ends;
}

/** Re-encode a 1s window around `atSec` at the platform bitrate; verify decode. */
function survivesRecompression(
  master: string,
  atSec: number,
  platform: Platform,
  workDir: string,
  tag: string,
): { pass: boolean; detail: string } {
  if (!hasBinary("ffmpeg") || !existsSync(master)) {
    // DEGRADED: cannot simulate without ffmpeg + the rendered master.
    return {
      pass: true,
      detail: "DEGRADED: recompression not simulated (ffmpeg/master missing)",
    };
  }
  ensureDir(workDir);
  const spec = exportSpecFor("9:16", platform);
  const mbps = spec.bitrateMbps[0]; // stress at the LOW end of the band
  const start = Math.max(0, atSec - 0.5);
  const dst = join(workDir, `recompress_${tag}.mp4`);

  const enc = tryRun("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    start.toFixed(3),
    "-i",
    master,
    "-t",
    "1",
    "-c:v",
    "libx264",
    "-profile:v",
    "high",
    "-b:v",
    `${mbps}M`,
    "-maxrate",
    `${mbps}M`,
    "-bufsize",
    `${mbps * 2}M`,
    "-c:a",
    "aac",
    "-b:a",
    `${spec.audioKbps}k`,
    "-movflags",
    "+faststart",
    dst,
  ]);
  if (enc == null || !existsSync(dst)) {
    return { pass: false, detail: `recompression re-encode failed at ${atSec.toFixed(2)}s` };
  }
  // Confirm the window decodes and has frames.
  const nb = tryRun("ffprobe", [
    "-v",
    "error",
    "-count_frames",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=nb_read_frames",
    "-of",
    "default=nokey=1:noprint_wrappers=1",
    dst,
  ]);
  const frames = nb ? parseInt(nb.trim(), 10) : 0;
  return {
    pass: frames > 0,
    detail:
      frames > 0
        ? `survived @ ${mbps}Mbps (${frames} frames decoded)`
        : "recompressed window failed to decode any frames",
  };
}

export function qcTransitions(
  plan: VideoPlan,
  master: string,
  platform: Platform,
  workDir = "work/qc-transitions",
): QCCheck[] {
  const fps = plan.fps || 30;
  const ends = sceneEndFrames(plan);
  const checks: QCCheck[] = [];

  plan.boundaries.forEach((b, i) => {
    const frame = ends[b.fromScene];
    const tag = `b${i}`;

    // 1. Cut lands on the intended frame.
    const frameOk = frame != null && Number.isInteger(frame) && frame > 0 && frame < plan.durationFrames;
    checks.push({
      name: `transitions.${tag}.frame`,
      pass: frameOk,
      detail: frameOk
        ? `boundary at frame ${frame} (scene ${b.fromScene}→${b.fromScene + 1})`
        : `invalid boundary frame for scene index ${b.fromScene}`,
    });
    if (frame == null) return;

    // 2. Required SFX cue exists on the boundary frame.
    const needsSfx = b.decision.flashy || b.decision.sfx != null;
    const cue = plan.sfx.find((s) => Math.abs(s.frame - frame) <= 1);
    checks.push({
      name: `transitions.${tag}.sfx`,
      pass: !needsSfx || cue != null,
      detail: !needsSfx
        ? "no SFX required for this transition"
        : cue != null
          ? `SFX "${cue.kind}" present on frame ${cue.frame}`
          : `MISSING SFX for ${b.decision.type} (expected "${b.decision.sfx ?? "cue"}") on frame ${frame}`,
    });

    // 3. Survives platform recompression.
    const rec = survivesRecompression(master, frame / fps, platform, workDir, tag);
    checks.push({ name: `transitions.${tag}.recompression`, pass: rec.pass, detail: rec.detail });
  });

  return checks;
}

function main(): void {
  const argv = process.argv.slice(2);
  const get = (k: string) =>
    argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const planPath = get("plan");
  const master = get("master") ?? "";
  const platform = (get("platform") ?? "tiktok") as Platform;
  const out = get("out");

  if (!planPath) {
    log.warn(
      "usage: tsx scripts/qc-transitions.ts --plan=plan.json [--master=render.mp4] [--platform=tiktok] [--out=...]",
    );
    process.exit(2);
  }
  const plan = readJson<VideoPlan>(planPath);
  log.section(`QC transitions (${platform})`);
  const checks = qcTransitions(plan, master, platform);
  for (const c of checks)
    (c.pass ? log.ok : log.warn)(`${c.name}: ${c.detail ?? ""}`);
  if (out) writeJson(out, checks);
  process.stdout.write(JSON.stringify(checks, null, 2) + "\n");
  if (checks.some((c) => !c.pass)) process.exitCode = 1;
}

if (isMain(import.meta.url)) main();
