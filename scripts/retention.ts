/**
 * Retention (Module 11).
 *
 *  removeDeadAir       — find >threshold pauses in the PROTAGONIST voice and
 *                        emit a jump-cut edit list, while sparing deliberate
 *                        dramatic pauses (very long, or right before the CTA).
 *  patternInterruptAudit — guarantee a visual change every ~2–3s; where a gap
 *                        is too long, inject a micro-event.
 *  retentionCurve      — mark the known drop-off points (post-hook ~3s, mid,
 *                        pre-CTA) with deliberate re-hooks → RetentionPlan.
 *
 * Operates purely on the `VideoPlan` / `Transcript` domain types.
 */

import type {
  RetentionPlan,
  Seconds,
  Transcript,
  VideoPlan,
} from "../src/types.js";
import { isMain, log, readJson, writeJson } from "./_util.js";

// --- removeDeadAir ----------------------------------------------------------

export interface DeadAirCut {
  startSec: Seconds;
  endSec: Seconds;
  gapMs: number;
}

export interface DeadAirEdit {
  cuts: DeadAirCut[];
  removedMs: number;
}

/**
 * Detect dead air in protagonist speech. A gap between consecutive protagonist
 * words longer than `thresholdMs` is cut — UNLESS it is a dramatic pause:
 * longer than `dramaticMs` (an intentional beat), or the last gap before speech
 * ends (a held pause into the CTA). Those are preserved.
 */
export function removeDeadAir(
  transcript: Transcript,
  thresholdMs = 400,
  dramaticMs = 1500,
): DeadAirEdit {
  // Protagonist words only: those inside voz_modelo_a_camara segments.
  const protagonistSpans = transcript.segments
    .filter((s) => s.role === "voz_modelo_a_camara")
    .map((s) => [s.start, s.end] as const);
  const inProtagonist = (t: number) =>
    protagonistSpans.some(([a, b]) => t >= a && t <= b);

  const words = transcript.words
    .filter((w) => inProtagonist(w.start))
    .sort((a, b) => a.start - b.start);

  const cuts: DeadAirCut[] = [];
  for (let i = 1; i < words.length; i++) {
    const prev = words[i - 1];
    const cur = words[i];
    if (!prev || !cur) continue;
    const gapMs = (cur.start - prev.end) * 1000;
    if (gapMs <= thresholdMs) continue;
    const isLastGap = i === words.length - 1;
    if (gapMs >= dramaticMs || isLastGap) continue; // preserve dramatic beats
    // Keep a small handle on each side so the cut doesn't clip word tails.
    const handle = thresholdMs / 2 / 1000;
    cuts.push({
      startSec: prev.end + handle,
      endSec: cur.start - handle,
      gapMs: Math.round(gapMs),
    });
  }
  const removedMs = cuts.reduce(
    (a, c) => a + (c.endSec - c.startSec) * 1000,
    0,
  );
  return { cuts, removedMs: Math.round(removedMs) };
}

// --- patternInterruptAudit --------------------------------------------------

export interface VisualGap {
  startSec: Seconds;
  endSec: Seconds;
  durSec: Seconds;
}
export interface MicroEvent {
  atSec: Seconds;
  kind: string;
  reason: string;
}
export interface PatternInterruptResult {
  changesSec: Seconds[];
  gaps: VisualGap[];
  injected: MicroEvent[];
  ok: boolean;
}

/** All visual-change timestamps (seconds) implied by the plan. */
function visualChanges(plan: VideoPlan): Seconds[] {
  const fps = plan.fps || 30;
  const times = new Set<number>();
  times.add(0);

  // Scene composition starts (cumulative scene durations).
  let acc = 0;
  for (const scene of plan.scenes) {
    times.add(acc / fps);
    acc += Math.max(0, scene.outFrame - scene.inFrame);
    // Caption entrances (composition-relative frames).
    for (const c of scene.captions) times.add(c.startFrame / fps);
  }
  // SFX cues land on exact frames → visual/audio punctuation.
  for (const s of plan.sfx) times.add(s.frame / fps);

  return [...times].sort((a, b) => a - b);
}

/**
 * Ensure no gap between visual changes exceeds `maxGapSec`. Long gaps get a
 * micro-event injected at their midpoint.
 */
export function patternInterruptAudit(
  plan: VideoPlan,
  maxGapSec = 3,
): PatternInterruptResult {
  const fps = plan.fps || 30;
  const durSec = plan.durationFrames / fps;
  const changes = visualChanges(plan).filter((t) => t <= durSec);
  const bounded = [...changes, durSec];

  const gaps: VisualGap[] = [];
  const injected: MicroEvent[] = [];
  for (let i = 1; i < bounded.length; i++) {
    const start = bounded[i - 1];
    const end = bounded[i];
    if (start == null || end == null) continue;
    const dur = end - start;
    if (dur > maxGapSec) {
      gaps.push({ startSec: start, endSec: end, durSec: Math.round(dur * 100) / 100 });
      injected.push({
        atSec: Math.round((start + dur / 2) * 100) / 100,
        kind: "micro-zoom-punch",
        reason: `gap ${dur.toFixed(1)}s > ${maxGapSec}s without a visual change`,
      });
    }
  }
  return { changesSec: changes, gaps, injected, ok: gaps.length === 0 };
}

// --- retentionCurve ---------------------------------------------------------

/**
 * Build the RetentionPlan: re-hooks at the classic drop-off points and the
 * measured worst dead-air gap.
 */
export function retentionCurve(plan: VideoPlan): RetentionPlan {
  const fps = plan.fps || 30;
  const durSec = plan.durationFrames / fps;
  const audit = patternInterruptAudit(plan);

  const postHook = Math.min(3, durSec);
  const mid = Math.round((durSec / 2) * 100) / 100;
  const preCta = Math.max(durSec - 3, durSec * 0.75);

  const reHooks: RetentionPlan["reHooks"] = [];
  reHooks.push({
    atSec: postHook,
    kind: "payoff-tease",
    note: "post-hook (~3s) drop-off: promise the payoff still coming",
  });
  if (mid > postHook + 1 && mid < preCta - 1) {
    reHooks.push({
      atSec: mid,
      kind: "pattern-interrupt",
      note: "mid drop-off: visual/tonal interrupt to reset attention",
    });
  }
  reHooks.push({
    atSec: Math.round(preCta * 100) / 100,
    kind: "stakes-raise",
    note: "pre-CTA drop-off: restate the stakes right before the ask",
  });

  const maxDeadAirSec = audit.gaps.reduce((m, g) => Math.max(m, g.durSec), 0);
  return { reHooks, maxDeadAirSec };
}

function main(): void {
  const argv = process.argv.slice(2);
  const get = (k: string) =>
    argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const planPath = get("plan");
  const transcriptPath = get("transcript");
  const out = get("out") ?? "work/retention.json";
  const threshold = Number(get("threshold") ?? "400");

  if (!planPath) {
    log.warn(
      "usage: tsx scripts/retention.ts --plan=plan.json [--transcript=t.json] [--threshold=400] [--out=work/retention.json]",
    );
    process.exit(2);
  }

  const plan = readJson<VideoPlan>(planPath);
  log.section("Retention analysis");

  const deadAir = transcriptPath
    ? removeDeadAir(readJson<Transcript>(transcriptPath), threshold)
    : { cuts: [], removedMs: 0 };
  const audit = patternInterruptAudit(plan);
  const retention = retentionCurve(plan);

  writeJson(out, { deadAir, audit, retention });
  log.ok(
    `dead-air cuts: ${deadAir.cuts.length} (-${deadAir.removedMs}ms); ` +
      `pattern gaps: ${audit.gaps.length}; re-hooks: ${retention.reHooks.length}`,
  );
  if (!audit.ok) log.warn(`${audit.injected.length} micro-events injected`);
  process.stdout.write(out + "\n");
}

if (isMain(import.meta.url)) main();
