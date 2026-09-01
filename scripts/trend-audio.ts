/**
 * Trend audio INTELLIGENCE (Module 7.1).
 *
 * IMPORTANT: this module produces INTELLIGENCE, never material. Trending sounds
 * themselves are NEVER downloaded or used in a render — especially not for paid
 * ads, where only ace-step-original / verified free-multiplatform are legal
 * (see music.ts, the legal wall). What we extract here is the *shape* of what
 * is working now — BPM band, energy, structure, vibe — and hand those
 * characteristics to music.ts as generation tags so ORIGINAL music can echo the
 * current trend without touching a licensed clip.
 *
 * The external data source (trend API / platform scrape) is stubbed; when it is
 * unavailable we degrade to niche heuristics and mark the report accordingly.
 */

import { join } from "node:path";
import { hasBinary, isMain, log, writeJson } from "./_util.js";

export interface TrendAudioReport {
  niche: string;
  region: string;
  generatedAt: string;
  /** Characteristic BPM band of currently-working audio. */
  bpmRange: [number, number];
  energy: "low" | "medium" | "high";
  /** Arrangement shape, e.g. "drop within 2s, 8-bar loopable". */
  structure: string;
  /** Vibe / mood descriptors. */
  vibe: string[];
  analystNotes: string[];
  /** Fed to music.ts as MusicMood.tags — GENERATION ONLY. */
  suggestedMoodTags: string[];
  suggestedBpm: [number, number];
  degraded: boolean;
}

/** Niche heuristics used when the live trend feed is unavailable. */
const NICHE_HEURISTICS: Record<
  string,
  Pick<TrendAudioReport, "bpmRange" | "energy" | "structure" | "vibe">
> = {
  shapewear: {
    bpmRange: [100, 120],
    energy: "high",
    structure: "confidence beat drops within 2s, 8-bar loopable, clean sub",
    vibe: ["empowering", "sleek", "female-pop", "glossy"],
  },
  beauty: {
    bpmRange: [90, 110],
    energy: "medium",
    structure: "soft intro, satisfying tick on reveal, airy tail",
    vibe: ["dreamy", "clean", "ASMR-adjacent", "aspirational"],
  },
  apparel: {
    bpmRange: [110, 128],
    energy: "high",
    structure: "immediate hook, hard downbeat for outfit cuts",
    vibe: ["street", "confident", "rhythmic"],
  },
  default: {
    bpmRange: [95, 118],
    energy: "medium",
    structure: "hook within 3s, loopable, one clear drop",
    vibe: ["modern", "upbeat", "clean"],
  },
};

/**
 * DEGRADED external fetch. Real integration: query a trend-intelligence source
 * (platform creative-center API, or a monitored panel of top-performing posts)
 * and aggregate the audio characteristics for the niche+region. Returns null
 * when no source is wired, so the caller falls back to heuristics.
 */
export function fetchTrendData(
  _niche: string,
  _region: string,
): Partial<TrendAudioReport> | null {
  // A real implementation might shell to a fetcher (e.g. yt-dlp for a monitored
  // panel) then analyse; none is present here.
  if (!hasBinary("yt-dlp")) {
    log.degraded(
      "no trend data source — needs a trend API or monitored panel + analyser",
    );
    return null;
  }
  log.degraded(
    "fetcher present but no aggregator wired — returning null, using heuristics",
  );
  return null;
}

/** Build the intelligence report for a niche + region. */
export function buildTrendReport(
  niche: string,
  region: string,
): TrendAudioReport {
  const live = fetchTrendData(niche, region);
  const base = NICHE_HEURISTICS[niche] ?? NICHE_HEURISTICS.default!;
  const degraded = live == null;

  const bpmRange = live?.bpmRange ?? base.bpmRange;
  const energy = live?.energy ?? base.energy;
  const structure = live?.structure ?? base.structure;
  const vibe = live?.vibe ?? base.vibe;

  const analystNotes = [
    "Intelligence only: never use a trending clip in the render.",
    "For paid ads these characteristics feed ACE-Step generation exclusively.",
    degraded
      ? "Live feed unavailable — figures are niche heuristics, treat as directional."
      : "Derived from live trend aggregation.",
  ];

  return {
    niche,
    region,
    generatedAt: new Date().toISOString(),
    bpmRange,
    energy,
    structure,
    vibe,
    analystNotes,
    suggestedMoodTags: [...vibe, energy, "original"],
    suggestedBpm: bpmRange,
    degraded,
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  const get = (k: string) =>
    argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const niche = get("niche");
  const region = get("region") ?? "CO";
  const out = get("out") ?? "work/trend-audio.json";

  if (!niche) {
    log.warn(
      "usage: tsx scripts/trend-audio.ts --niche=shapewear [--region=CO] [--out=work/trend-audio.json]",
    );
    process.exit(2);
  }

  log.section(`Trend audio intelligence: ${niche} / ${region}`);
  const report = buildTrendReport(niche, region);
  writeJson(out, report);
  log.ok(
    `bpm ${report.bpmRange[0]}-${report.bpmRange[1]}, ${report.energy} energy` +
      (report.degraded ? " (heuristic)" : ""),
  );
  log.info(`tags for music.ts: ${report.suggestedMoodTags.join(", ")}`);
  process.stdout.write(out + "\n");
}

if (isMain(import.meta.url)) main();
