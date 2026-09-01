/**
 * Transcription & audio-role classification (WhisperX).
 *
 * Shells to `whisperx` for word-level timestamps + speaker diarisation. When
 * the binary is absent we DO NOT fabricate a transcript — we emit a clearly
 * marked degraded stub with an empty word list and log exactly what real
 * integration needs.
 *
 * Every segment is then classified into an `AudioRole`:
 *   voz_modelo_a_camara — the protagonist to camera (forces synced captions)
 *   voz_direccion       — off-camera direction (must NEVER be audible)
 *   ambiente            — ambience / non-speech
 */

import { basename, extname, join } from "node:path";
import type {
  AudioRole,
  AudioSegment,
  Transcript,
  WordTiming,
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

/** Shape of WhisperX's `--output_format json` result (subset we consume). */
interface WhisperXWord {
  word: string;
  start?: number;
  end?: number;
  score?: number;
  speaker?: string;
}
interface WhisperXSegment {
  start: number;
  end: number;
  text: string;
  speaker?: string;
  words?: WhisperXWord[];
}
interface WhisperXJson {
  language?: string;
  segments?: WhisperXSegment[];
}

export interface TranscribeOptions {
  language?: string; // e.g. "es"; omit for auto-detect
  diarize?: boolean; // requires HF token in the whisperx env
  model?: string; // e.g. "large-v3"
}

/** Cues that mark a spoken line as off-camera DIRECTION rather than talent VO. */
const DIRECTION_CUES = [
  "acción",
  "corte",
  "otra vez",
  "de nuevo",
  "más energía",
  "mira a cámara",
  "repite",
  "listo",
  "graba",
  "empezamos",
];

/**
 * Heuristic role classifier. Deterministic and dependency-free:
 *  - non-speech / no words → ambiente
 *  - contains a direction cue, OR a non-primary speaker → voz_direccion
 *  - otherwise the primary speaker to camera → voz_modelo_a_camara
 *
 * `primarySpeaker` is the most-talkative diarised speaker; when diarisation is
 * unavailable everyone collapses to the primary and cues do the work.
 */
export function classifyRole(
  seg: { text?: string; speaker?: string },
  primarySpeaker: string | undefined,
): AudioRole {
  const text = (seg.text ?? "").trim().toLowerCase();
  if (!text) return "ambiente";
  const norm = text.normalize("NFD").replace(/[̀-ͯ]/g, "");
  const hasCue = DIRECTION_CUES.some((c) =>
    norm.includes(c.normalize("NFD").replace(/[̀-ͯ]/g, "")),
  );
  if (hasCue) return "voz_direccion";
  if (primarySpeaker && seg.speaker && seg.speaker !== primarySpeaker) {
    return "voz_direccion";
  }
  return "voz_modelo_a_camara";
}

/** Pick the speaker with the most spoken time across segments. */
function primarySpeakerOf(segments: WhisperXSegment[]): string | undefined {
  const dur = new Map<string, number>();
  for (const s of segments) {
    if (!s.speaker) continue;
    dur.set(s.speaker, (dur.get(s.speaker) ?? 0) + (s.end - s.start));
  }
  let best: string | undefined;
  let bestDur = -1;
  for (const [sp, d] of dur) {
    if (d > bestDur) {
      bestDur = d;
      best = sp;
    }
  }
  return best;
}

/** Convert a WhisperX result into our `Transcript`, classifying each segment. */
export function fromWhisperX(json: WhisperXJson, clipId: string): Transcript {
  const segs = json.segments ?? [];
  const primary = primarySpeakerOf(segs);

  const words: WordTiming[] = [];
  const segments: AudioSegment[] = [];

  for (const s of segs) {
    const role = classifyRole(s, primary);
    segments.push({
      start: s.start,
      end: s.end,
      role,
      speaker: s.speaker,
      text: s.text.trim(),
    });
    for (const w of s.words ?? []) {
      if (w.start == null || w.end == null) continue; // unaligned token
      words.push({
        word: w.word,
        start: w.start,
        end: w.end,
        speaker: w.speaker ?? s.speaker,
        score: w.score,
      });
    }
  }

  return {
    clipId,
    language: json.language ?? "und",
    words,
    segments,
  };
}

/**
 * Run WhisperX on an audio/video file. Returns null (degraded) if the binary is
 * missing or the run fails to produce JSON.
 */
export function runWhisperX(
  input: string,
  outDir: string,
  opts: TranscribeOptions,
): WhisperXJson | null {
  if (!hasBinary("whisperx")) return null;
  ensureDir(outDir);
  const args = [
    input,
    "--output_dir",
    outDir,
    "--output_format",
    "json",
    "--model",
    opts.model ?? "large-v3",
  ];
  if (opts.language) args.push("--language", opts.language);
  if (opts.diarize) args.push("--diarize");

  const res = tryRun("whisperx", args);
  if (res == null) return null;

  // WhisperX writes <basename>.json into outDir.
  const jsonPath = join(outDir, basename(input, extname(input)) + ".json");
  if (!existsSync(jsonPath)) {
    log.warn(`whisperx produced no JSON at ${jsonPath}`);
    return null;
  }
  return readJson<WhisperXJson>(jsonPath);
}

/** Transcribe a clip end-to-end, degrading to a typed stub if WhisperX absent. */
export function transcribe(
  input: string,
  outDir: string,
  opts: TranscribeOptions = {},
): Transcript {
  const clipId = basename(input, extname(input));

  if (!existsSync(input)) {
    log.warn(`missing input, empty transcript: ${input}`);
    return { clipId, language: "und", words: [], segments: [] };
  }

  const json = runWhisperX(input, outDir, opts);
  if (json) {
    const t = fromWhisperX(json, clipId);
    log.ok(
      `${clipId}: ${t.words.length} words, ${t.segments.length} segments (${t.language})`,
    );
    return t;
  }

  // DEGRADED: whisperx not installed / failed. Real integration needs:
  //   pip install whisperx; a CUDA or CPU torch; and (for diarisation) a
  //   HuggingFace token for pyannote. Interface above is the exact contract.
  log.degraded(
    "whisperx unavailable — emitting empty transcript stub (no fabricated words)",
  );
  return {
    clipId,
    language: opts.language ?? "und",
    words: [],
    segments: [],
  };
}

function main(): void {
  const argv = process.argv.slice(2);
  const inputs = argv.filter((a) => !a.startsWith("--"));
  const outFlag = argv.find((a) => a.startsWith("--out="));
  const langFlag = argv.find((a) => a.startsWith("--lang="));
  const diarize = argv.includes("--diarize");
  const outDir = outFlag ? outFlag.slice("--out=".length) : "work/transcribe";

  if (inputs.length === 0) {
    log.warn(
      "usage: tsx scripts/transcribe.ts <clip...> [--out=work/transcribe] [--lang=es] [--diarize]",
    );
    process.exit(2);
  }

  log.section(`Transcribe ${inputs.length} clip(s)`);
  const opts: TranscribeOptions = {
    language: langFlag ? langFlag.slice("--lang=".length) : undefined,
    diarize,
  };
  for (const input of inputs) {
    const t = transcribe(input, outDir, opts);
    const dst = join(outDir, `${t.clipId}.transcript.json`);
    writeJson(dst, t);
    log.info(`transcript: ${dst}`);
  }
  log.section("Done");
}

if (isMain(import.meta.url)) main();
