/**
 * Music (Module 7).
 *
 * Generates ORIGINAL music with ACE-Step from a brand mood (bpm / genre /
 * mood). Original generation is the safe default because it carries no
 * third-party licence risk.
 *
 * THE LEGAL WALL — for PAID ads (`intake.paid === true`) the ONLY allowed
 * sources are `ace-step-original` and verified `free-multiplatform`. Single-
 * platform commercial libraries (TikTok CML, Meta Sound Collection, YouTube
 * Audio Library) and generic library "general-sounds" are all REJECTED for
 * paid. `assertPaidSafe(track, adPlatforms)` enforces this and throws.
 *
 * ACE-Step is an external tool; if absent we DO NOT fake audio — we emit a
 * typed placeholder track (still marked `ace-step-original`, still paid-safe as
 * a source) and log what real integration needs.
 */

import { join } from "node:path";
import type {
  Intake,
  MusicMood,
  MusicSource,
  MusicTrack,
  Platform,
} from "../src/types.js";
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

/** Sources cleared for PAID ads on ALL platforms. Everything else is not. */
const PAID_SAFE_SOURCES: ReadonlySet<MusicSource> = new Set<MusicSource>([
  "ace-step-original",
  "free-multiplatform",
]);

/** Human-readable licence note per source (recorded on every track). */
const LICENSE: Record<MusicSource, string> = {
  "ace-step-original":
    "Original generation (ACE-Step). Full commercial rights, all platforms, paid-safe.",
  "free-multiplatform":
    "Verified royalty-free across all target platforms incl. paid ads.",
  "tiktok-cml":
    "TikTok Commercial Music Library — organic TikTok only, NOT for paid ads.",
  "meta-sound-collection":
    "Meta Sound Collection — Meta surfaces only, NOT cleared for cross-platform paid.",
  "youtube-audio-library":
    "YouTube Audio Library — YouTube only, NOT cleared for cross-platform paid.",
  "general-sounds":
    "Generic library sound — unverified rights, NOT for paid ads.",
};

/**
 * The legal wall. For paid distribution, throws unless the track's source is
 * cleared for paid across every ad platform. No-op for organic.
 */
export function assertPaidSafe(
  track: MusicTrack,
  adPlatforms: Platform[],
): void {
  if (!PAID_SAFE_SOURCES.has(track.source)) {
    throw new Error(
      `music: LEGAL WALL — source "${track.source}" is not paid-safe ` +
        `(${LICENSE[track.source]}). Rejected for paid ads on ` +
        `[${adPlatforms.join(", ")}]. Use ace-step-original or verified free-multiplatform.`,
    );
  }
}

/** Whether a source is paid-safe across the given ad platforms. */
export function computePaidSafe(source: MusicSource): boolean {
  return PAID_SAFE_SOURCES.has(source);
}

/** Register a NON-generated library track, computing/validating paid safety. */
export function registerLibraryTrack(
  file: string,
  source: MusicSource,
  intake: Intake,
  bpm?: number,
): MusicTrack {
  const track: MusicTrack = {
    file,
    source,
    license: LICENSE[source],
    paidSafe: computePaidSafe(source),
    bpm,
  };
  if (intake.paid) assertPaidSafe(track, intake.adPlatforms);
  return track;
}

/**
 * Generate an original track for a mood with ACE-Step. Picks the mid-point of
 * the mood's BPM band. Returns a `MusicTrack`; `degraded=true` path leaves
 * `file` empty when the engine is unavailable.
 */
export function generateMusic(
  mood: MusicMood,
  outDir: string,
): { track: MusicTrack; degraded: boolean } {
  ensureDir(outDir);
  const [lo, hi] = mood.bpm;
  const bpm = Math.round((lo + hi) / 2);
  const dst = join(outDir, `${mood.name}.wav`);
  const prompt = mood.tags.join(", ");

  const source: MusicSource = "ace-step-original";
  const base: MusicTrack = {
    file: "",
    source,
    license: LICENSE[source],
    paidSafe: true, // original generation is always paid-safe
    bpm,
  };

  if (!hasBinary("ace-step")) {
    // DEGRADED: ACE-Step not installed. Real integration needs the ACE-Step
    // CLI + model weights on PATH; args below match its conventional surface.
    log.degraded(
      `ace-step unavailable — no audio for mood "${mood.name}" (bpm ${bpm}); ` +
        `track stays typed & paid-safe as a SOURCE, file empty`,
    );
    return { track: base, degraded: true };
  }

  const res = tryRun("ace-step", [
    "--prompt",
    prompt,
    "--bpm",
    String(bpm),
    "--duration",
    "30",
    "--output",
    dst,
  ]);
  if (res == null || !existsSync(dst)) {
    log.degraded(`ace-step run produced no file for "${mood.name}"`);
    return { track: base, degraded: true };
  }

  log.ok(`generated "${mood.name}" @ ${bpm} bpm → ${dst}`);
  return { track: { ...base, file: dst }, degraded: false };
}

function main(): void {
  const argv = process.argv.slice(2);
  const get = (k: string) =>
    argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const moodPath = get("mood");
  const intakePath = get("intake");
  const outDir = get("out") ?? "work/music";

  if (!moodPath || !intakePath) {
    log.warn(
      "usage: tsx scripts/music.ts --mood=mood.json --intake=intake.json [--out=work/music]",
    );
    process.exit(2);
  }

  const mood = readJson<MusicMood>(moodPath);
  const intake = readJson<Intake>(intakePath);

  log.section(`Music: ${mood.name} (paid=${intake.paid})`);
  const { track, degraded } = generateMusic(mood, outDir);

  // Enforce the wall on the generated track too (belt & suspenders).
  if (intake.paid) {
    try {
      assertPaidSafe(track, intake.adPlatforms);
      log.ok("legal wall: paid-safe");
    } catch (err) {
      log.warn((err as Error).message);
      process.exit(1);
    }
  }

  const manifest = join(outDir, `${mood.name}.track.json`);
  writeJson(manifest, track);
  log.section("Done");
  log.info(`track: ${manifest}${degraded ? " (degraded)" : ""}`);
  process.stdout.write(manifest + "\n");
}

if (isMain(import.meta.url)) main();
