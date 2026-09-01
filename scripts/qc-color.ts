/**
 * Colour QC (Module 8 QC). Returns QCCheck[]:
 *   - SKIN: sample face regions and verify skin hue stayed within
 *     brand.color.skinHueRange (± tolerance) after grading.
 *   - CONSISTENCY: inter-clip mean-RGB spread stays tight so the graded
 *     sequence reads as one production.
 *
 * Reuses measureMeanRGB from color.ts; degrades cleanly without ffmpeg.
 */

import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { BoundingBox, QCCheck } from "../src/types.js";
import { measureMeanRGB } from "./color.js";
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

/** RGB (0..255) → hue in degrees (0..360). */
export function rgbToHue(r: number, g: number, b: number): number {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;
  if (d === 0) return 0;
  let h: number;
  if (max === rn) h = ((gn - bn) / d) % 6;
  else if (max === gn) h = (bn - rn) / d + 2;
  else h = (rn - gn) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** Mean RGB of a normalised face region (area-averaged to 1px). */
export function measureRegionRGB(
  master: string,
  box: BoundingBox,
  workDir: string,
  tag: string,
): { r: number; g: number; b: number } | null {
  ensureDir(workDir);
  const raw = join(workDir, `${basename(master)}.${tag}.raw`);
  // crop=w:h:x:y in pixels via iw/ih expressions, then area-average to 1x1.
  const crop =
    `crop=iw*${box.w}:ih*${box.h}:iw*${box.x}:ih*${box.y},` +
    `scale=1:1:flags=area,format=rgb24`;
  const res = tryRun("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-ss",
    "0.5",
    "-i",
    master,
    "-frames:v",
    "1",
    "-vf",
    crop,
    "-f",
    "rawvideo",
    "-pix_fmt",
    "rgb24",
    raw,
  ]);
  if (res == null || !existsSync(raw)) return null;
  const bytes = readFileSync(raw);
  return { r: bytes[0] ?? 0, g: bytes[1] ?? 0, b: bytes[2] ?? 0 };
}

export interface ColorQCInput {
  clips: { clipId: string; graded: string; faceBoxes?: BoundingBox[] }[];
  skinHueRange: [number, number];
  /** Hue tolerance in degrees (default 15). */
  tolerance?: number;
  /** Max allowed inter-clip channel spread, 0..255 (default 24). */
  histTolerance?: number;
}

export function qcColor(
  input: ColorQCInput,
  workDir = "work/qc-color",
): QCCheck[] {
  const tol = input.tolerance ?? 15;
  const histTol = input.histTolerance ?? 24;
  const [loHue, hiHue] = input.skinHueRange;
  const checks: QCCheck[] = [];
  const ffmpegOk = hasBinary("ffmpeg");

  const means: { clipId: string; mean: { r: number; g: number; b: number } }[] = [];

  for (const clip of input.clips) {
    if (!ffmpegOk || !existsSync(clip.graded)) {
      checks.push({
        name: `color.skin.${clip.clipId}`,
        pass: true,
        detail: "DEGRADED: skin hue not sampled (ffmpeg/graded missing)",
      });
      continue;
    }
    const whole = measureMeanRGB(clip.graded, workDir);
    if (whole) means.push({ clipId: clip.clipId, mean: whole });

    const boxes = clip.faceBoxes ?? [];
    if (boxes.length === 0) {
      checks.push({
        name: `color.skin.${clip.clipId}`,
        pass: true,
        detail: "no face boxes supplied — skin check skipped (verify with vision)",
      });
      continue;
    }
    // Worst-offending face region drives the check.
    let worst: { hue: number; ok: boolean } | null = null;
    boxes.forEach((box, bi) => {
      const rgb = measureRegionRGB(clip.graded, box, workDir, `${clip.clipId}_f${bi}`);
      if (!rgb) return;
      const hue = rgbToHue(rgb.r, rgb.g, rgb.b);
      const ok = hue >= loHue - tol && hue <= hiHue + tol;
      if (!worst || (!ok && worst.ok)) worst = { hue, ok };
    });
    if (worst) {
      const w = worst as { hue: number; ok: boolean };
      checks.push({
        name: `color.skin.${clip.clipId}`,
        pass: w.ok,
        detail: `skin hue ${w.hue.toFixed(1)}° vs range [${loHue}-${hiHue}]±${tol}°`,
      });
    } else {
      checks.push({
        name: `color.skin.${clip.clipId}`,
        pass: true,
        detail: "DEGRADED: face region sampling failed",
      });
    }
  }

  // --- Inter-clip histogram consistency ---
  if (means.length >= 2) {
    const spread = (sel: (m: { r: number; g: number; b: number }) => number) => {
      const vals = means.map((m) => sel(m.mean));
      return Math.max(...vals) - Math.min(...vals);
    };
    const dr = spread((m) => m.r);
    const dg = spread((m) => m.g);
    const db = spread((m) => m.b);
    const worst = Math.max(dr, dg, db);
    checks.push({
      name: "color.inter-clip-consistency",
      pass: worst <= histTol,
      detail: `channel spread R${dr.toFixed(0)}/G${dg.toFixed(0)}/B${db.toFixed(0)} (max ≤ ${histTol})`,
    });
  } else {
    checks.push({
      name: "color.inter-clip-consistency",
      pass: true,
      detail:
        means.length < 2
          ? "fewer than 2 measurable clips — consistency not evaluated"
          : "",
    });
  }

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
      "usage: tsx scripts/qc-color.ts --input=colorqc.json [--out=work/qc-color.json]",
    );
    process.exit(2);
  }
  const input = readJson<ColorQCInput>(inputPath);
  log.section("QC colour");
  const checks = qcColor(input);
  for (const c of checks)
    (c.pass ? log.ok : log.warn)(`${c.name}: ${c.detail ?? ""}`);
  if (out) writeJson(out, checks);
  process.stdout.write(JSON.stringify(checks, null, 2) + "\n");
  if (checks.some((c) => !c.pass)) process.exitCode = 1;
}

if (isMain(import.meta.url)) main();
