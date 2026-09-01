/**
 * Brand ingest (Module 1).
 *
 * Builds a `BrandProfile` by merging a hand-authored brand book with an
 * analysis of the brand's own published posts. The scraping (yt-dlp +
 * mcp-video-analyzer) is EXTERNAL infrastructure; when it isn't wired up we
 * degrade gracefully, keep the brand-book values, and record every field that
 * fell back in `degraded[]` so the report stays honest.
 *
 * Emits brands/<marca>/brand-profile.json.
 */

import { join } from "node:path";
import type {
  BrandColorProfile,
  BrandProfile,
  ModelRelease,
  MusicMood,
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

/**
 * Minimal hand-authored brand book. Everything here is trusted; the scraped
 * analysis only fills gaps or refines derived aesthetics (color/transitions).
 */
export interface BrandBook {
  brand: string;
  category: BrandProfile["category"];
  palette: BrandProfile["palette"];
  logo?: string;
  tone: string;
  captions: BrandProfile["captions"];
  voice: BrandProfile["voice"];
  copy: BrandProfile["copy"];
  color?: Partial<BrandColorProfile>;
  transitions?: BrandProfile["transitions"];
  musicMoods?: MusicMood[];
  sonicLogo?: string;
  /** Handles/URLs of the brand's own posts to analyse. */
  postSources?: string[];
  /** Model releases (image rights) known up front. */
  releases?: ModelRelease[];
}

/** What the (external) post scraper + analyser would return per corpus. */
export interface ScrapedPostAnalysis {
  /** Derived colour aesthetic from the brand's real footage. */
  color?: BrandColorProfile;
  /** Detected transition grammar weights. */
  transitions?: BrandProfile["transitions"];
  /** Mood tags observed in the brand's audio choices. */
  musicMoods?: MusicMood[];
  /** Face signatures seen — cross-checked against declared releases. */
  observedFaceRefs?: string[];
}

const DEFAULT_COLOR: BrandColorProfile = {
  temperature: "neutral",
  contrast: "medium",
  saturation: "natural",
  // Typical warm skin band on the 0..360 hue wheel (reds→yellows).
  skinHueRange: [10, 45],
};

/**
 * DEGRADED scraper. Real integration:
 *   1. `yt-dlp` to pull the brand's public posts (video + metadata).
 *   2. mcp-video-analyzer (or ffmpeg histogram + transition detection) to
 *      derive colour aesthetics, transition grammar and audio moods.
 * Until both are present we return null and the caller keeps brand-book values.
 */
export function analyseBrandPosts(
  sources: string[],
  workDir: string,
): ScrapedPostAnalysis | null {
  if (sources.length === 0) return null;
  if (!hasBinary("yt-dlp")) {
    log.degraded(
      "yt-dlp unavailable — cannot fetch brand posts; needs `yt-dlp` on PATH " +
        "and mcp-video-analyzer for colour/transition/mood extraction",
    );
    return null;
  }
  ensureDir(workDir);
  // Attempt a metadata-only fetch to prove reachability; analysis itself is the
  // job of mcp-video-analyzer, which is not modelled here.
  const first = sources[0];
  if (first) {
    const meta = tryRun("yt-dlp", ["--dump-json", "--no-warnings", first]);
    if (meta == null) {
      log.degraded("yt-dlp present but fetch failed — degrading brand analysis");
      return null;
    }
  }
  // DEGRADED: fetch works but no analyser wired. Return null rather than fake
  // derived aesthetics — those must come from real footage analysis.
  log.degraded(
    "post fetch OK but no analyser integration — colour/transition/mood not derived",
  );
  return null;
}

/**
 * Model-release check scaffold. Flags any face observed in the corpus that has
 * no authorised release, and any release that has expired for paid usage.
 */
export function checkModelReleases(
  releases: ModelRelease[],
  observedFaceRefs: string[],
  today: string,
): { unreleasedFaces: string[]; expiredForPaid: string[] } {
  const byRef = new Map<string, ModelRelease>();
  for (const r of releases) if (r.faceRef) byRef.set(r.faceRef, r);

  const unreleasedFaces = observedFaceRefs.filter((ref) => !byRef.has(ref));
  const expiredForPaid = releases
    .filter(
      (r) =>
        r.authorizedForPaid &&
        r.authorizedUntil != null &&
        r.authorizedUntil < today,
    )
    .map((r) => r.modelId);

  return { unreleasedFaces, expiredForPaid };
}

/** Merge brand book + (optional) scraped analysis into a full BrandProfile. */
export function buildBrandProfile(
  book: BrandBook,
  analysis: ScrapedPostAnalysis | null,
  today: string,
): BrandProfile {
  const degraded: string[] = [];

  const color: BrandColorProfile = analysis?.color ?? {
    ...DEFAULT_COLOR,
    ...book.color,
  };
  if (!analysis?.color) degraded.push("color:from-brandbook-not-derived");

  const transitions =
    analysis?.transitions ??
    book.transitions ?? { weights: {} };
  if (!analysis?.transitions && !book.transitions)
    degraded.push("transitions:default-empty-weights");

  const musicMoods = analysis?.musicMoods ?? book.musicMoods ?? [];
  if (musicMoods.length === 0) degraded.push("musicMoods:empty");

  const releases = book.releases ?? [];
  const relCheck = checkModelReleases(
    releases,
    analysis?.observedFaceRefs ?? [],
    today,
  );
  if (relCheck.unreleasedFaces.length > 0)
    degraded.push(
      `imageRights:unreleased-faces:${relCheck.unreleasedFaces.length}`,
    );
  if (relCheck.expiredForPaid.length > 0)
    degraded.push(
      `imageRights:expired-for-paid:${relCheck.expiredForPaid.join(",")}`,
    );

  const profile: BrandProfile = {
    brand: book.brand,
    category: book.category,
    palette: book.palette,
    logo: book.logo,
    tone: book.tone,
    captions: book.captions,
    voice: book.voice,
    imageRights: { releases },
    transitions,
    color,
    copy: book.copy,
    performance: {
      records: [],
      winningHooks: [],
      winningBranches: [],
      winningMusicMoods: [],
      archived: [],
    },
    musicMoods,
    sonicLogo: book.sonicLogo,
    degraded: degraded.length ? degraded : undefined,
  };
  return profile;
}

function main(): void {
  const argv = process.argv.slice(2);
  const bookPath = argv.find((a) => !a.startsWith("--"));
  const outFlag = argv.find((a) => a.startsWith("--out="));
  const workFlag = argv.find((a) => a.startsWith("--work="));

  if (!bookPath) {
    log.warn(
      "usage: tsx scripts/brand-ingest.ts <brand-book.json> [--out=brands] [--work=work/brand]",
    );
    process.exit(2);
  }
  if (!existsSync(bookPath)) {
    log.warn(`brand book not found: ${bookPath}`);
    process.exit(1);
  }

  const book = readJson<BrandBook>(bookPath);
  const outRoot = outFlag ? outFlag.slice("--out=".length) : "brands";
  const workDir = workFlag ? workFlag.slice("--work=".length) : "work/brand";
  const today = new Date().toISOString().slice(0, 10);

  log.section(`Brand ingest: ${book.brand}`);
  const analysis = analyseBrandPosts(book.postSources ?? [], workDir);
  const profile = buildBrandProfile(book, analysis, today);

  const dst = join(outRoot, book.brand, "brand-profile.json");
  writeJson(dst, profile);

  log.section("Done");
  log.info(`profile: ${dst}`);
  if (profile.degraded) log.degraded(`degraded fields: ${profile.degraded.join(", ")}`);
  process.stdout.write(dst + "\n");
}

if (isMain(import.meta.url)) main();
