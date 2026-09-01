/**
 * Caption rhythm builder (Module 3.3).
 *
 * Turns raw word timings into caption BLOCKS with a musical rhythm:
 *   - 2–4 words per block, held ~600–900ms.
 *   - seconds → exact frames (fps-relative), nothing shorter than 0.5s.
 *   - keyword-class words earn +200–300ms of extra dwell (the eye lingers).
 *   - each block gets an `entrance` chosen from its emphasised class.
 *   - optional beat frames nudge a block's start onto the beat (<120ms).
 *   - a small heuristic assigns the typographic level.
 *
 * It delegates all SEMANTICS to the tagger (`tagBlock`); this module only owns
 * timing and grouping. It returns blocks WITHOUT an anchor — the spatial
 * solver fills that in later. Pure and deterministic.
 */

import type { CaptionBlock, CaptionClass, WordTiming } from "../../types.js";
import { KEYWORD_CLASSES, tagBlock } from "../semantic/tagger.js";

/** A block before the occlusion solver resolves its on-screen anchor. */
export type UnanchoredBlock = Omit<CaptionBlock, "anchor">;

export interface RhythmOptions {
  /** Resolved, normalised product name(s) for the tagger. */
  productNames?: ReadonlySet<string>;
  /** Beat frames (composition fps) to align block starts onto. */
  beatFrames?: number[];
  /** Words per block. */
  minWords?: number; // default 2
  maxWords?: number; // default 4
  /** Target hold window. */
  minHoldMs?: number; // default 600
  /** Absolute floor — nothing shorter than this. */
  minBlockMs?: number; // default 500
  /** Extra dwell granted to blocks carrying a keyword class. */
  keywordDwellMs?: number; // default 250 (within 200–300)
  /** Beat-snap tolerance. */
  beatToleranceMs?: number; // default 120
  /** First block of the video is the H1 hook. */
  isFirstOfVideo?: boolean; // default true
}

type Entrance = CaptionBlock["entrance"];

/** Entrance animation implied by the block's emphasised class. */
const ENTRANCE_BY_CLASS: Record<CaptionClass, Entrance> = {
  keyword_beneficio: "pop",
  numero_dato: "pop",
  accion_cta: "pop",
  nombre_producto: "slide-up",
  negacion_dolor: "typewriter",
  conector: "fade",
};

/**
 * Chunk items into groups of [min,max], never orphaning a sub-`min` tail
 * (it steals from the previous group instead).
 */
function chunkWords<T>(items: T[], min: number, max: number): T[][] {
  const out: T[][] = [];
  const n = items.length;
  let i = 0;
  while (i < n) {
    const remaining = n - i;
    let size = Math.min(max, remaining);
    // If taking `size` would leave a tail smaller than `min`, shrink now so the
    // tail is at least `min`.
    if (remaining - size > 0 && remaining - size < min) {
      size = Math.max(min, remaining - min);
    }
    if (size > remaining) size = remaining;
    if (size < 1) size = 1; // safety; only hit on degenerate input
    out.push(items.slice(i, i + size));
    i += size;
  }
  return out;
}

/**
 * Group word timings into caption blocks. Returns blocks in order, anchor
 * unresolved.
 */
export function buildBlocks(
  words: WordTiming[],
  fps: number,
  opts: RhythmOptions = {},
): UnanchoredBlock[] {
  const {
    productNames = new Set<string>(),
    beatFrames = [],
    minWords = 2,
    maxWords = 4,
    minHoldMs = 600,
    minBlockMs = 500,
    keywordDwellMs = 250,
    beatToleranceMs = 120,
    isFirstOfVideo = true,
  } = opts;

  if (words.length === 0 || fps <= 0) return [];

  const secToFrame = (s: number) => Math.round(s * fps);
  const minFrames = Math.max(1, Math.round((minBlockMs / 1000) * fps));

  const chunks = chunkWords(words, minWords, maxWords);
  const blocks: UnanchoredBlock[] = [];

  chunks.forEach((chunk, idx) => {
    const first = chunk[0]!;
    const last = chunk[chunk.length - 1]!;
    const texts = chunk.map((w) => w.word);
    const tokens = tagBlock(texts, productNames);

    const hasKeyword = tokens.some((t) => KEYWORD_CLASSES.has(t.klass));
    const emphasisedKeyword = tokens.some(
      (t) => t.emphasised && KEYWORD_CLASSES.has(t.klass),
    );

    // --- Timing: natural span, plus keyword dwell, floored at the hold. ---
    const startSec = first.start;
    const dwellMs = hasKeyword ? keywordDwellMs : 0;
    let endSec = last.end + dwellMs / 1000;
    if ((endSec - startSec) * 1000 < minHoldMs) {
      endSec = startSec + minHoldMs / 1000;
    }

    let startFrame = secToFrame(startSec);
    let endFrame = secToFrame(endSec);
    if (endFrame - startFrame < minFrames) endFrame = startFrame + minFrames;

    // --- Per-word karaoke frames. ---
    const wordFrames = chunk.map((w) => {
      const s = secToFrame(w.start);
      const e = Math.max(secToFrame(w.end), s + 1);
      return { text: w.word, startFrame: s, endFrame: e };
    });

    // --- Beat alignment: snap start to the nearest beat within tolerance. ---
    let beatAligned = false;
    if (beatFrames.length > 0) {
      let nearest = beatFrames[0]!;
      for (const b of beatFrames) {
        if (Math.abs(b - startFrame) < Math.abs(nearest - startFrame)) {
          nearest = b;
        }
      }
      const offMs = (Math.abs(nearest - startFrame) / fps) * 1000;
      if (offMs < beatToleranceMs) {
        startFrame = nearest;
        if (endFrame - startFrame < minFrames) endFrame = startFrame + minFrames;
        beatAligned = true;
      }
    }

    // --- Level heuristic: hook = H1, emphasised keyword = H2, else base. ---
    const level: CaptionBlock["level"] =
      idx === 0 && isFirstOfVideo ? "H1" : emphasisedKeyword ? "H2" : "base";

    // --- Entrance from the emphasised token's class. ---
    const emph = tokens.find((t) => t.emphasised);
    const entrance: Entrance = emph ? ENTRANCE_BY_CLASS[emph.klass] : "fade";

    blocks.push({
      id: `blk${String(idx).padStart(3, "0")}`,
      tokens,
      level,
      startFrame,
      endFrame,
      wordFrames,
      entrance,
      beatAligned,
    });
  });

  // Prevent overlaps: a block never runs past the next block's start.
  for (let i = 0; i < blocks.length - 1; i++) {
    const cur = blocks[i]!;
    const next = blocks[i + 1]!;
    if (cur.endFrame > next.startFrame) {
      cur.endFrame = Math.max(cur.startFrame + minFrames, next.startFrame);
    }
  }

  return blocks;
}
