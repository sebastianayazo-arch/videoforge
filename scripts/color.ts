/**
 * Colour (Module 8).
 *
 *  (a) COLOUR MATCH — measure each clip's mean RGB, pick a sequence target
 *      (grey-world average across clips) and build a per-clip
 *      colorchannelmixer (white-balance gain) + curves (midpoint match) so the
 *      whole sequence reads as ONE production.
 *  (b) BRAND LUT — apply the brand .cube via `lut3d`, blended subtly (opacity)
 *      so it flavours rather than overpowers.
 *  (c) SKIN PROTECTION — rebuild the graded frame but composite the ORIGINAL
 *      back over skin-hued pixels (YCbCr band derived from
 *      brand.color.skinHueRange) using `maskedmerge`, so grading never turns
 *      skin orange/green.
 *
 * All filter strings are real ffmpeg. Missing ffmpeg/inputs degrade cleanly.
 */

import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import type { BrandColorProfile } from "../src/types.js";
import {
  ensureDir,
  existsSync,
  hasBinary,
  isMain,
  log,
  tryRun,
  writeJson,
} from "./_util.js";

export interface ClipColor {
  clipId: string;
  master: string;
  /** Mean channel values 0..255. */
  mean: { r: number; g: number; b: number };
  /** Crude white-balance estimate from the R/B ratio. */
  whiteBalanceKelvin: number;
}

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/**
 * Measure mean RGB by area-averaging a representative frame down to 1x1 and
 * reading the raw rgb24 byte triplet. Returns null if ffmpeg is unavailable.
 */
export function measureMeanRGB(
  master: string,
  workDir: string,
): { r: number; g: number; b: number } | null {
  ensureDir(workDir);
  const raw = join(workDir, `${basename(master)}.mean.raw`);
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
    "scale=1:1:flags=area,format=rgb24",
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

/** Very rough correlated-colour-temperature proxy from the R/B balance. */
export function estimateKelvin(r: number, b: number): number {
  const ratio = (b + 1) / (r + 1); // >1 cool, <1 warm
  return Math.round(clamp(2000 + ratio * 4500, 2000, 12000));
}

/** Analyse one clip's colour. */
export function analyseClipColor(
  clipId: string,
  master: string,
  workDir: string,
): ClipColor | null {
  const mean = measureMeanRGB(master, workDir);
  if (!mean) return null;
  return {
    clipId,
    master,
    mean,
    whiteBalanceKelvin: estimateKelvin(mean.r, mean.b),
  };
}

/** Sequence target = mean of clip means (grey-world unification). */
export function sequenceTarget(clips: ClipColor[]): {
  r: number;
  g: number;
  b: number;
} {
  if (clips.length === 0) return { r: 128, g: 128, b: 128 };
  const sum = clips.reduce(
    (a, c) => ({ r: a.r + c.mean.r, g: a.g + c.mean.g, b: a.b + c.mean.b }),
    { r: 0, g: 0, b: 0 },
  );
  const n = clips.length;
  return { r: sum.r / n, g: sum.g / n, b: sum.b / n };
}

/**
 * Map brand.color.skinHueRange (degrees) to a YCbCr detection band. We anchor
 * on the well-documented skin band (Cb 77–127, Cr 133–173) and widen Cr with
 * the hue span. Approximate but real and safe (over-protects slightly).
 */
export function skinYCbCrBand(range: [number, number]): {
  cbLo: number;
  cbHi: number;
  crLo: number;
  crHi: number;
} {
  const span = clamp(range[1] - range[0], 5, 90);
  const widen = Math.round((span - 35) / 5); // baseline span ~35°
  return {
    cbLo: 77,
    cbHi: 127,
    crLo: clamp(133 - widen, 120, 140),
    crHi: clamp(173 + widen, 160, 190),
  };
}

/** White-balance gain filter toward the sequence target. */
export function buildMatchChain(
  mean: { r: number; g: number; b: number },
  target: { r: number; g: number; b: number },
): string {
  const gr = clamp(target.r / (mean.r || 1), 0.6, 1.8).toFixed(3);
  const gg = clamp(target.g / (mean.g || 1), 0.6, 1.8).toFixed(3);
  const gb = clamp(target.b / (mean.b || 1), 0.6, 1.8).toFixed(3);
  // Midpoint curve nudges each channel's mid toward the target level.
  const pt = (m: number, t: number) =>
    `0/0 ${clamp(m / 255, 0.05, 0.95).toFixed(3)}/${clamp(t / 255, 0.05, 0.95).toFixed(3)} 1/1`;
  const curves =
    `curves=red='${pt(mean.r, target.r)}':` +
    `green='${pt(mean.g, target.g)}':` +
    `blue='${pt(mean.b, target.b)}'`;
  return `colorchannelmixer=rr=${gr}:gg=${gg}:bb=${gb},${curves}`;
}

/**
 * Assemble the full colour filter_complex for one clip. Returns the graph and
 * the label of the final output pad. `grade` is the match chain from
 * buildMatchChain; `lut` and `skinRange` are optional layers.
 */
export function buildColorGraph(opts: {
  grade: string;
  lut?: string;
  lutOpacity?: number;
  skinRange?: [number, number];
}): { filterComplex: string; outLabel: string } {
  const { grade, lut, lutOpacity = 0.6, skinRange } = opts;
  const nodes: string[] = [];

  if (skinRange) {
    // Need original (for skin) + grade input + mask input.
    nodes.push("[0:v]split=3[gin][orig][min]");
  } else {
    nodes.push("[0:v]copy[gin]");
  }

  nodes.push(`[gin]${grade}[g0]`);

  let gradedLabel = "g0";
  if (lut && existsSync(lut)) {
    const op = clamp(lutOpacity, 0.1, 1).toFixed(2);
    // Subtle LUT: blend the lut3d result over the graded frame at `op`.
    const esc = lut.replace(/\\/g, "/").replace(/'/g, "\\'");
    nodes.push(
      `[g0]split[l0][l1];` +
        `[l1]lut3d=file='${esc}'[l1b];` +
        `[l0][l1b]blend=all_mode=normal:all_opacity=${op}[graded]`,
    );
    gradedLabel = "graded";
  } else if (lut) {
    log.degraded(`brand LUT not found (${lut}) — skipping lut3d layer`);
  }

  if (skinRange) {
    const b = skinYCbCrBand(skinRange);
    // Mask: luma=255 where pixel falls in the skin Cb/Cr band, else 0.
    // Commas inside geq are escaped (\,) for the filter_complex parser.
    const skinTest =
      `between(cb(X\\,Y)\\,${b.cbLo}\\,${b.cbHi})*` +
      `between(cr(X\\,Y)\\,${b.crLo}\\,${b.crHi})`;
    nodes.push(
      `[min]format=yuv444p,` +
        `geq=lum='if(${skinTest}\\,255\\,0)':cb=128:cr=128[mask]`,
    );
    // maskedmerge: where mask is white (skin) show ORIGINAL, else graded.
    nodes.push(`[${gradedLabel}][orig][mask]maskedmerge[out]`);
    return { filterComplex: nodes.join(";"), outLabel: "out" };
  }

  return { filterComplex: nodes.join(";"), outLabel: gradedLabel };
}

/** Grade one clip to a matched, brand-LUT'd, skin-protected master. */
export function gradeClip(
  master: string,
  out: string,
  graph: { filterComplex: string; outLabel: string },
): string | null {
  const res = tryRun("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    master,
    "-filter_complex",
    graph.filterComplex,
    "-map",
    `[${graph.outLabel}]`,
    "-map",
    "0:a?",
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
  return res != null && existsSync(out) ? out : null;
}

export interface ColorMatchResult {
  target: { r: number; g: number; b: number };
  clips: {
    clipId: string;
    graded: string;
    filterComplex: string;
    degraded: boolean;
  }[];
}

/** Colour-match + LUT + skin-protect an entire sequence of masters. */
export function colorMatchSequence(
  masters: { clipId: string; master: string }[],
  color: Pick<BrandColorProfile, "lut" | "skinHueRange">,
  workDir: string,
): ColorMatchResult {
  ensureDir(workDir);
  const measured: (ClipColor | null)[] = masters.map((m) =>
    analyseClipColor(m.clipId, m.master, workDir),
  );
  const known = measured.filter((c): c is ClipColor => c !== null);
  const target = sequenceTarget(known);

  const clips = masters.map((m, i) => {
    const cc = measured[i];
    const out = join(workDir, `${m.clipId}.graded.mp4`);
    const grade = cc
      ? buildMatchChain(cc.mean, target)
      : "colorchannelmixer=rr=1:gg=1:bb=1"; // no-op if unmeasured
    const graph = buildColorGraph({
      grade,
      lut: color.lut,
      skinRange: color.skinHueRange,
    });
    let graded = "";
    let degraded = true;
    if (existsSync(m.master) && hasBinary("ffmpeg")) {
      const g = gradeClip(m.master, out, graph);
      if (g) {
        graded = g;
        degraded = false;
        log.ok(`graded ${m.clipId}`);
      }
    } else {
      // DEGRADED: cannot render the grade without ffmpeg + the master file.
      log.degraded(`cannot grade ${m.clipId} (ffmpeg/master missing)`);
    }
    return { clipId: m.clipId, graded, filterComplex: graph.filterComplex, degraded };
  });

  return { target, clips };
}

function main(): void {
  const argv = process.argv.slice(2);
  const get = (k: string) =>
    argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const masters = argv.filter((a) => !a.startsWith("--"));
  const lut = get("lut");
  const workDir = get("out") ?? "work/color";
  const skinLo = Number(get("skinLo") ?? "10");
  const skinHi = Number(get("skinHi") ?? "45");

  if (masters.length === 0) {
    log.warn(
      "usage: tsx scripts/color.ts <master.mp4...> [--lut=brand.cube] [--skinLo=10 --skinHi=45] [--out=work/color]",
    );
    process.exit(2);
  }

  log.section(`Colour match ${masters.length} clip(s)`);
  const result = colorMatchSequence(
    masters.map((m) => ({ clipId: basename(m).replace(/\.[^.]+$/, ""), master: m })),
    { lut, skinHueRange: [skinLo, skinHi] },
    workDir,
  );
  const manifest = join(workDir, "color.json");
  writeJson(manifest, result);
  log.section("Done");
  log.info(
    `target rgb ≈ ${result.target.r.toFixed(0)},${result.target.g.toFixed(0)},${result.target.b.toFixed(0)}`,
  );
  process.stdout.write(manifest + "\n");
}

if (isMain(import.meta.url)) main();
