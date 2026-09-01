/**
 * Cloned narration (Module 2.3) — Chatterbox Multilingual TTS.
 *
 * HARD GATE: nothing is generated unless `brand.voice.consent === true`. Every
 * line this module produces is flagged for report.md (disclosure of synthetic
 * voice). XTTS-v2 / F5-TTS are forbidden for publish (see BrandVoiceProfile);
 * we honour whatever engine the brand declares.
 *
 * After synthesis each line runs the SAME cleanup chain as recorded voice, so a
 * cloned stem and a recorded stem are indistinguishable downstream.
 *
 * Chatterbox is an external Python tool. If it isn't installed we DO NOT fake
 * audio — we emit a typed placeholder line (no file), clearly degraded.
 */

import { join } from "node:path";
import type { BrandProfile } from "../src/types.js";
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

export interface VoiceLine {
  id: string;
  text: string;
}

export interface GeneratedLine {
  id: string;
  text: string;
  /** Cleaned narration WAV, or "" if degraded (engine unavailable). */
  file: string;
  engine: BrandProfile["voice"]["engine"];
  source: "cloned";
  /** Always true — surfaced in report.md as a synthetic-voice disclosure. */
  requiresDisclosure: true;
  degraded: boolean;
}

/** Map a declared engine to its CLI binary name. */
function engineBinary(engine: BrandProfile["voice"]["engine"]): string {
  switch (engine) {
    case "chatterbox":
      return "chatterbox";
    case "qwen3-tts":
      return "qwen3-tts";
    case "fish-speech":
      return "fish-speech";
  }
}

/**
 * The recorded-voice cleanup chain, applied identically to cloned stems:
 *   highpass       — kill rumble below 80 Hz
 *   afftdn         — spectral denoise
 *   deesser        — tame sibilance
 *   acompressor    — even out dynamics for a broadcast VO feel
 *   equalizer      — a small presence lift around 3 kHz
 *   loudnorm       — VO stem to -16 LUFS (final mix re-normalises to -14)
 */
export function cleanupFilter(): string {
  return [
    "highpass=f=80",
    "afftdn=nf=-25",
    "deesser",
    "acompressor=threshold=-18dB:ratio=3:attack=20:release=250",
    "equalizer=f=3000:t=q:w=1:g=2",
    "loudnorm=I=-16:TP=-1.5:LRA=11",
  ].join(",");
}

/** Run the cleanup chain on a WAV. Returns null if ffmpeg is unavailable. */
export function runCleanup(inWav: string, outWav: string): string | null {
  const res = tryRun("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inWav,
    "-af",
    cleanupFilter(),
    "-ar",
    "48000",
    "-c:a",
    "pcm_s16le",
    outWav,
  ]);
  return res != null && existsSync(outWav) ? outWav : null;
}

/**
 * Synthesise one line with the declared engine, cloning the brand voice from
 * its first sample. Returns the raw synth WAV path or null (degraded).
 *
 * DEGRADED note: Chatterbox is invoked here as a CLI with a conventional flag
 * set. Real integration requires installing the engine (pip/conda), the model
 * weights, and confirming the exact CLI surface — adjust the args to match.
 */
function synthLine(
  engine: BrandProfile["voice"]["engine"],
  text: string,
  refSample: string,
  outWav: string,
): string | null {
  const bin = engineBinary(engine);
  if (!hasBinary(bin)) return null;
  const res = tryRun(bin, [
    "--text",
    text,
    "--audio-prompt",
    refSample,
    "--language",
    "multilingual",
    "--output",
    outWav,
  ]);
  return res != null && existsSync(outWav) ? outWav : null;
}

/**
 * Generate cloned narration for a set of lines. THROWS if consent is not
 * granted — the hard gate is non-negotiable.
 */
export function generateNarration(
  lines: VoiceLine[],
  brand: BrandProfile,
  outDir: string,
): GeneratedLine[] {
  if (brand.voice.consent !== true) {
    throw new Error(
      `voice: consent gate — brand "${brand.brand}" has voice.consent=false; ` +
        `refusing to generate cloned narration. A recorded consent is required.`,
    );
  }
  const engine = brand.voice.engine;
  const refSample = brand.voice.samples[0]?.file;
  if (!refSample) {
    throw new Error(
      `voice: no voice sample for "${brand.brand}" — cannot clone without a reference.`,
    );
  }
  ensureDir(outDir);

  const engineOk = hasBinary(engineBinary(engine));
  if (!engineOk) {
    // DEGRADED: TTS engine not installed. Real integration needs the engine
    // binary + model weights on PATH. We still emit typed, flagged placeholders.
    log.degraded(
      `${engine} unavailable — emitting flagged placeholder lines (no audio)`,
    );
  }

  return lines.map((line) => {
    const rawWav = join(outDir, `${line.id}.raw.wav`);
    const cleanWav = join(outDir, `${line.id}.wav`);
    let file = "";
    let degraded = true;

    const synth = engineOk
      ? synthLine(engine, line.text, refSample, rawWav)
      : null;
    if (synth) {
      const cleaned = runCleanup(synth, cleanWav);
      if (cleaned) {
        file = cleaned;
        degraded = false;
      } else {
        log.degraded(`ffmpeg cleanup unavailable for ${line.id}`);
      }
    }

    log.warn(`SYNTHETIC VOICE (disclose in report.md): [${line.id}] ${line.text}`);
    return {
      id: line.id,
      text: line.text,
      file,
      engine,
      source: "cloned",
      requiresDisclosure: true,
      degraded,
    };
  });
}

function main(): void {
  const argv = process.argv.slice(2);
  const get = (k: string) =>
    argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const brandPath = get("brand");
  const linesPath = get("lines");
  const outDir = get("out") ?? "work/voice";

  if (!brandPath || !linesPath) {
    log.warn(
      "usage: tsx scripts/voice.ts --brand=brand-profile.json --lines=lines.json [--out=work/voice]",
    );
    process.exit(2);
  }

  const brand = readJson<BrandProfile>(brandPath);
  const lines = readJson<VoiceLine[]>(linesPath);

  log.section(`Cloned narration: ${brand.brand} (${brand.voice.engine})`);
  let generated: GeneratedLine[];
  try {
    generated = generateNarration(lines, brand, outDir);
  } catch (err) {
    log.warn((err as Error).message);
    process.exit(1);
  }

  const manifest = join(outDir, "narration.json");
  writeJson(manifest, generated);
  log.section("Done");
  log.info(
    `${generated.length} lines (all flagged for report.md); manifest: ${manifest}`,
  );
  process.stdout.write(manifest + "\n");
}

if (isMain(import.meta.url)) main();
