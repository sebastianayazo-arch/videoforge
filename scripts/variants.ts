/**
 * Variants & delivery (Modules 11.4 / 11.5 / 11.6).
 *
 *  11.4 HOOK A/B/C — from an approved plan + 2–3 library hooks, emit variants
 *       that differ ONLY in the first ~3s; the rest of the render is reused.
 *  11.5 MULTI-FORMAT — 9:16 is the master; 4:5 and 1:1 are reframes with
 *       recomputed safe areas.
 *  11.6 NAMING — marca_producto_rama_hook-X_plataforma_ratio_duracion_vN.mp4
 *
 * Exports `deliveryFilename(parts)` and `exportSpecFor(ratio, platform)`.
 */

import type {
  AspectRatio,
  Branch,
  ExportSpec,
  HookVariant,
  Platform,
  VideoPlan,
} from "../src/types.js";
import { isMain, log, readJson, writeJson } from "./_util.js";

// --- 11.4 Hook variants -----------------------------------------------------

export interface LibraryHook {
  id: string; // "A" | "B" | "C" | ...
  formulaId: string;
  text: string;
}

/**
 * Build hook variants that share everything after ~3s. `reuseFromSec` marks the
 * frame after which the render is identical across variants.
 */
export function makeHookVariants(
  plan: VideoPlan,
  hooks: LibraryHook[],
  hookLenSec = 3,
): { variants: HookVariant[]; reuseFromSec: number } {
  const chosen = hooks.slice(0, 3); // A/B/C max
  const variants: HookVariant[] = chosen.map((h) => ({
    id: h.id,
    formulaId: h.formulaId,
    text: h.text,
    approxSec: hookLenSec,
  }));
  if (variants.length === 0) {
    log.warn("no hooks supplied — emitting a single passthrough variant");
    variants.push({
      id: "A",
      formulaId: "passthrough",
      text: plan.scenes[0]?.vo?.text ?? "",
      approxSec: hookLenSec,
    });
  }
  return { variants, reuseFromSec: hookLenSec };
}

// --- 11.5 Multi-format ------------------------------------------------------

/** Canonical pixel dimensions per aspect ratio (1080-wide family). */
export function dimsFor(ratio: AspectRatio): { width: number; height: number } {
  switch (ratio) {
    case "9:16":
      return { width: 1080, height: 1920 };
    case "4:5":
      return { width: 1080, height: 1350 };
    case "1:1":
      return { width: 1080, height: 1080 };
  }
}

export interface SafeArea {
  /** Normalised insets (0..1) reserved for platform UI — keep captions clear. */
  top: number;
  bottom: number;
  left: number;
  right: number;
}

/**
 * Recompute safe areas per ratio + platform. 9:16 needs the most bottom room
 * (caption bar / CTA sticker); square/4:5 (feed) need far less. Platform tweaks
 * account for right-rail action stacks on TikTok/Reels.
 */
export function safeAreaFor(ratio: AspectRatio, platform: Platform): SafeArea {
  const base: Record<AspectRatio, SafeArea> = {
    "9:16": { top: 0.1, bottom: 0.2, left: 0.05, right: 0.05 },
    "4:5": { top: 0.06, bottom: 0.1, left: 0.05, right: 0.05 },
    "1:1": { top: 0.06, bottom: 0.08, left: 0.05, right: 0.05 },
  };
  const area = { ...base[ratio] };
  if (ratio === "9:16" && (platform === "tiktok" || platform === "instagram")) {
    area.right = 0.16; // action rail on the right edge
    area.bottom = 0.24; // handle / caption zone
  }
  return area;
}

// --- 11.6 Export spec + filename -------------------------------------------

/** Per-platform bitrate band, kept within the 8–12 Mbps envelope. */
function bitrateFor(platform: Platform): [number, number] {
  switch (platform) {
    case "youtube":
      return [10, 12];
    case "meta":
    case "instagram":
    case "tiktok":
      return [8, 10];
  }
}

/** H.264 high, correct dims, 8–12 Mbps, AAC ≥128k, +faststart. */
export function exportSpecFor(
  ratio: AspectRatio,
  platform: Platform,
): ExportSpec {
  const { width, height } = dimsFor(ratio);
  return {
    ratio,
    width,
    height,
    vcodec: "h264",
    profile: "high",
    bitrateMbps: bitrateFor(platform),
    acodec: "aac",
    audioKbps: platform === "youtube" ? 192 : 128,
    faststart: true,
  };
}

const RATIO_TAG: Record<AspectRatio, string> = {
  "9:16": "9x16",
  "4:5": "4x5",
  "1:1": "1x1",
};

export interface FilenameParts {
  marca: string;
  producto: string;
  rama: Branch | string;
  hookId: string;
  plataforma: Platform;
  ratio: AspectRatio;
  durationSec: number;
  version: number;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

/** marca_producto_rama_hook-X_plataforma_ratio_duracion_vN.mp4 */
export function deliveryFilename(p: FilenameParts): string {
  const parts = [
    slug(p.marca),
    slug(p.producto),
    slug(String(p.rama)),
    `hook-${slug(p.hookId)}`,
    slug(p.plataforma),
    RATIO_TAG[p.ratio],
    `${Math.round(p.durationSec)}s`,
    `v${p.version}`,
  ];
  return parts.join("_") + ".mp4";
}

export interface ExportPlanItem {
  ratio: AspectRatio;
  platform: Platform;
  hookId: string;
  spec: ExportSpec;
  safeArea: SafeArea;
  filename: string;
  /** True when this ratio is produced by reframing the 9:16 master. */
  reframed: boolean;
}

/** Full export matrix: variants × ratios × ad platforms. */
export function planExports(
  plan: VideoPlan,
  variants: HookVariant[],
  producto: string,
  version: number,
): ExportPlanItem[] {
  const ratios = plan.intake.ratios.length ? plan.intake.ratios : ["9:16"];
  const platforms = plan.intake.platforms.length
    ? plan.intake.platforms
    : (["tiktok"] as Platform[]);
  const durationSec = plan.durationFrames / (plan.fps || 30);

  const items: ExportPlanItem[] = [];
  for (const v of variants) {
    for (const ratio of ratios as AspectRatio[]) {
      for (const platform of platforms) {
        items.push({
          ratio,
          platform,
          hookId: v.id,
          spec: exportSpecFor(ratio, platform),
          safeArea: safeAreaFor(ratio, platform),
          filename: deliveryFilename({
            marca: plan.brand,
            producto,
            rama: plan.branch,
            hookId: v.id,
            plataforma: platform,
            ratio,
            durationSec,
            version,
          }),
          reframed: ratio !== "9:16",
        });
      }
    }
  }
  return items;
}

function main(): void {
  const argv = process.argv.slice(2);
  const get = (k: string) =>
    argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const planPath = get("plan");
  const hooksPath = get("hooks");
  const producto = get("producto") ?? "producto";
  const version = Number(get("v") ?? "1");
  const out = get("out") ?? "work/variants.json";

  if (!planPath) {
    log.warn(
      "usage: tsx scripts/variants.ts --plan=plan.json [--hooks=hooks.json] [--producto=faja] [--v=1] [--out=work/variants.json]",
    );
    process.exit(2);
  }

  const plan = readJson<VideoPlan>(planPath);
  const hooks = hooksPath ? readJson<LibraryHook[]>(hooksPath) : [];

  log.section(`Variants & delivery: ${plan.brand}`);
  const { variants, reuseFromSec } = makeHookVariants(plan, hooks);
  const exports = planExports(plan, variants, producto, version);

  writeJson(out, { variants, reuseFromSec, exports });
  log.ok(
    `${variants.length} hook variant(s), ${exports.length} delivery targets ` +
      `(reuse render after ${reuseFromSec}s)`,
  );
  for (const e of exports.slice(0, 6)) log.item(e.filename);
  process.stdout.write(out + "\n");
}

if (isMain(import.meta.url)) main();
