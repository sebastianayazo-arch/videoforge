/**
 * Copywriting engine (Module 2).
 *
 * Turns transcript + intake + brand + branch into a shootable/ narratable
 * script: for each beat a second, a shot direction, the VO line and the
 * on-screen caption text. Rule-based (not ML) so it is deterministic and
 * auditable.
 *
 * Pipeline per beat:
 *   1. framework beats picked by branch (PAS / 4U / resultado-primero / ugc-literal)
 *   2. hook pulled from src/copy/hooks.json (defensive) or brand.copy formulas
 *   3. benefit-over-feature filter (documented lexical transform)
 *   4. market localisation (CO / MX / US-latino documented transform)
 *
 * Output feeds a `VideoPlan` (scenes[].vo + caption text).
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type {
  BrandProfile,
  Branch,
  CopyFramework,
  Intake,
  Market,
  Seconds,
  Transcript,
} from "../src/types.js";
import { isMain, log, readJson, readJsonOr, writeJson } from "./_util.js";

export type BeatRole = "hook" | "body" | "cta";

export interface ScriptLine {
  second: Seconds;
  shot: string;
  vo: string;
  onScreen: string;
  role: BeatRole;
}

export interface ScriptDraft {
  brand: string;
  branch: Branch;
  framework: CopyFramework;
  market: Market;
  hookId: string;
  lines: ScriptLine[];
  /** Feature phrases rewritten into benefits (audit trail). */
  benefitRewrites: { from: string; to: string }[];
  /** Neutral phrases localised per market (audit trail). */
  localisations: { from: string; to: string }[];
}

// --- Branch → framework (documented) ----------------------------------------
const BRANCH_FRAMEWORK: Record<Branch, CopyFramework> = {
  "problema-solucion": "PAS",
  "demo-directa": "resultado-primero",
  "oferta-urgencia": "4U",
  "ugc-testimonio": "ugc-literal",
  lanzamiento: "4U",
};

export function frameworkFor(branch: Branch): CopyFramework {
  return BRANCH_FRAMEWORK[branch];
}

// --- Hook library (defensive load) ------------------------------------------
interface HookFormula {
  id: string;
  formula: string;
}
type HooksFile = Record<string, HookFormula[]>;

const HERE = dirname(fileURLToPath(import.meta.url));
const HOOKS_PATH = join(HERE, "../src/copy/hooks.json");

/** Load hooks.json defensively; empty object if it doesn't exist yet. */
export function loadHooks(): HooksFile {
  return readJsonOr<HooksFile>(HOOKS_PATH, {});
}

/** Built-in fallback hooks so the engine works before hooks.json exists. */
const FALLBACK_HOOKS: Record<Branch, HookFormula> = {
  "problema-solucion": {
    id: "ps-fallback",
    formula: "¿Cansada de {dolor}? Esto lo cambia todo.",
  },
  "demo-directa": {
    id: "demo-fallback",
    formula: "Mira lo que pasa con {producto} en 3 segundos.",
  },
  "oferta-urgencia": {
    id: "oferta-fallback",
    formula: "Solo hoy: {beneficio} con {producto}.",
  },
  "ugc-testimonio": {
    id: "ugc-fallback",
    formula: "No me creían hasta que probé {producto}.",
  },
  lanzamiento: {
    id: "lanz-fallback",
    formula: "Llegó {producto}: {beneficio}.",
  },
};

/** Pick the hook for a branch by index (default 0), from file then fallback. */
export function pickHook(branch: Branch, index = 0): HookFormula {
  const hooks = loadHooks();
  const list = hooks[branch];
  if (list && list.length > 0) {
    const chosen = list[Math.min(index, list.length - 1)];
    if (chosen) return chosen;
  }
  return FALLBACK_HOOKS[branch];
}

/** Fill {producto}/{beneficio}/{dolor}/{cta} placeholders. */
function fillPlaceholders(
  template: string,
  ctx: { producto: string; beneficio: string; dolor: string; cta: string },
): string {
  return template
    .replace(/\{producto\}/g, ctx.producto)
    .replace(/\{beneficio\}/g, ctx.beneficio)
    .replace(/\{dolor\}/g, ctx.dolor)
    .replace(/\{cta\}/g, ctx.cta);
}

// --- Benefit-over-feature filter (documented transform) ---------------------
const FEATURE_TO_BENEFIT: { re: RegExp; benefit: string }[] = [
  { re: /tela de compresi[oó]n/gi, benefit: "te moldea al instante" },
  { re: /costuras planas/gi, benefit: "invisible bajo la ropa" },
  { re: /banda de silicona/gi, benefit: "se queda en su sitio todo el día" },
  { re: /tejido transpirable/gi, benefit: "fresca aunque la uses horas" },
  { re: /control de abdomen/gi, benefit: "vientre plano al instante" },
  { re: /alta compresi[oó]n/gi, benefit: "silueta definida sin esfuerzo" },
];

/** Rewrite feature phrases as benefits; returns the text + what changed. */
export function applyBenefitFilter(text: string): {
  text: string;
  rewrites: { from: string; to: string }[];
} {
  let out = text;
  const rewrites: { from: string; to: string }[] = [];
  for (const { re, benefit } of FEATURE_TO_BENEFIT) {
    const m = out.match(re);
    if (m) {
      for (const from of m) rewrites.push({ from, to: benefit });
      out = out.replace(re, benefit);
    }
  }
  return { text: out, rewrites };
}

// --- Market localisation (documented transform) -----------------------------
// Neutral base phrase → per-market colloquial equivalent. "other" = neutral.
const MARKET_LEXICON: Record<string, Partial<Record<Market, string>>> = {
  "muy bueno": { CO: "una chimba", MX: "padrísimo", "US-latino": "increíble" },
  genial: { CO: "bacano", MX: "chido", "US-latino": "genial" },
  "date prisa": { CO: "corre", MX: "aguas, vuela", "US-latino": "no esperes" },
  amiga: { CO: "parce", MX: "amiga", "US-latino": "girl" },
  "de verdad": { CO: "en serio", MX: "neta", "US-latino": "de verdad" },
};

/** Localise neutral phrases to the target market; returns text + swaps. */
export function localise(
  text: string,
  market: Market,
): { text: string; swaps: { from: string; to: string }[] } {
  if (market === "other") return { text, swaps: [] };
  let out = text;
  const swaps: { from: string; to: string }[] = [];
  for (const base of Object.keys(MARKET_LEXICON)) {
    const local = MARKET_LEXICON[base]?.[market];
    if (!local || local === base) continue;
    const re = new RegExp(base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    if (re.test(out)) {
      swaps.push({ from: base, to: local });
      out = out.replace(re, local);
    }
  }
  return { text: out, swaps };
}

/** Protagonist-to-camera lines from a transcript, in order (for UGC). */
function protagonistLines(transcript: Transcript | undefined): string[] {
  if (!transcript) return [];
  return transcript.segments
    .filter((s) => s.role === "voz_modelo_a_camara" && s.text)
    .map((s) => s.text!.trim())
    .filter(Boolean);
}

interface BeatSeed {
  role: BeatRole;
  shot: string;
  vo: string;
  onScreen: string;
}

/** Framework-specific beat seeds before filtering/localisation. */
function seedBeats(
  framework: CopyFramework,
  intake: Intake,
  hookText: string,
  ugcLines: string[],
): BeatSeed[] {
  const { productAngle: prod, cta } = intake;
  switch (framework) {
    case "PAS":
      return [
        { role: "hook", shot: "primer plano al rostro", vo: hookText, onScreen: hookText },
        {
          role: "body",
          shot: "detalle del dolor / antes",
          vo: `Sabes esa sensación de tela de compresión que aprieta y marca todo el día.`,
          onScreen: "el problema real",
        },
        {
          role: "body",
          shot: "revelación del producto",
          vo: `${prod} lo resuelve: control de abdomen sin que se note.`,
          onScreen: prod,
        },
        { role: "cta", shot: "producto + mano señalando", vo: cta, onScreen: cta },
      ];
    case "resultado-primero":
      return [
        {
          role: "hook",
          shot: "resultado final en cámara",
          vo: hookText,
          onScreen: hookText,
        },
        {
          role: "body",
          shot: "demo paso a paso",
          vo: `Así se ve con ${prod}: alta compresión, cero incomodidad.`,
          onScreen: prod,
        },
        { role: "cta", shot: "cierre con producto", vo: cta, onScreen: cta },
      ];
    case "4U":
      return [
        { role: "hook", shot: "urgencia en cámara", vo: hookText, onScreen: hookText },
        {
          role: "body",
          shot: "oferta ultra-específica",
          vo: `${prod}: banda de silicona que se queda en su sitio. Muy bueno de verdad.`,
          onScreen: prod,
        },
        { role: "cta", shot: "sello de oferta", vo: cta, onScreen: cta },
      ];
    case "ugc-literal": {
      const l0 = ugcLines[0] ?? hookText;
      const l1 = ugcLines[1] ?? `Lo uso todos los días y es genial.`;
      return [
        { role: "hook", shot: "selfie casual", vo: l0, onScreen: l0 },
        { role: "body", shot: "mostrando el producto", vo: l1, onScreen: prod },
        { role: "cta", shot: "recomendación directa", vo: intake.cta, onScreen: intake.cta },
      ];
    }
  }
}

/** Build the full script draft. Pure given its inputs. */
export function buildScript(args: {
  intake: Intake;
  brand: BrandProfile;
  branch: Branch;
  transcript?: Transcript;
  hookIndex?: number;
}): ScriptDraft {
  const { intake, brand, branch, transcript, hookIndex = 0 } = args;
  const framework = frameworkFor(branch);
  const hook = pickHook(branch, hookIndex);

  const ctx = {
    producto: intake.productAngle,
    beneficio: brand.copy.hookFormulas[0] ?? "resultados visibles",
    dolor: "la ropa que aprieta",
    cta: intake.cta,
  };
  const hookText = fillPlaceholders(hook.formula, ctx);

  const seeds = seedBeats(
    framework,
    intake,
    hookText,
    protagonistLines(transcript),
  );

  const benefitRewrites: { from: string; to: string }[] = [];
  const localisations: { from: string; to: string }[] = [];
  const banned = new Set(brand.copy.bannedWords.map((w) => w.toLowerCase()));

  // Even spacing across the requested duration.
  const step = intake.durationSec / Math.max(seeds.length, 1);

  const lines: ScriptLine[] = seeds.map((seed, i) => {
    const bVo = applyBenefitFilter(seed.vo);
    const bScreen = applyBenefitFilter(seed.onScreen);
    benefitRewrites.push(...bVo.rewrites, ...bScreen.rewrites);

    const lVo = localise(bVo.text, intake.market);
    const lScreen = localise(bScreen.text, intake.market);
    localisations.push(...lVo.swaps, ...lScreen.swaps);

    // Banned-word guard: flag (do not silently drop) via log.
    for (const w of banned) {
      if (lVo.text.toLowerCase().includes(w))
        log.warn(`banned word "${w}" in VO beat ${i} — review copy`);
    }

    return {
      second: Math.round(i * step * 100) / 100,
      shot: seed.shot,
      vo: lVo.text,
      onScreen: lScreen.text,
      role: seed.role,
    };
  });

  return {
    brand: brand.brand,
    branch,
    framework,
    market: intake.market,
    hookId: hook.id,
    lines,
    benefitRewrites,
    localisations,
  };
}

const VALID_PLATFORMS = ["tiktok", "instagram", "youtube", "meta"];
const VALID_MARKETS = ["CO", "MX", "US-latino", "other"];
const VALID_RATIOS = ["9:16", "4:5", "1:1"];

/**
 * Validate a parsed intake against the Intake contract (schemas/intake.schema.json)
 * BEFORE building the script, so an incomplete intake yields a precise list of
 * problems instead of a downstream `undefined.match` crash. Returns [] when valid.
 */
export function validateIntake(obj: unknown): string[] {
  const problems: string[] = [];
  if (typeof obj !== "object" || obj === null) {
    return ["intake must be a JSON object"];
  }
  const o = obj as Record<string, unknown>;
  const reqStr = (k: string) => {
    if (o[k] === undefined) problems.push(`missing required field: ${k}`);
    else if (typeof o[k] !== "string" || (o[k] as string).trim() === "")
      problems.push(`field ${k} must be a non-empty string`);
  };
  const reqEnumArray = (k: string, allowed: string[], minItems = 0) => {
    if (o[k] === undefined) {
      problems.push(`missing required field: ${k}`);
      return;
    }
    if (!Array.isArray(o[k])) {
      problems.push(`field ${k} must be an array of ${allowed.join("|")}`);
      return;
    }
    const arr = o[k] as unknown[];
    if (arr.length < minItems)
      problems.push(`field ${k} must have at least ${minItems} item(s)`);
    for (const v of arr)
      if (typeof v !== "string" || !allowed.includes(v))
        problems.push(`field ${k} has invalid value ${JSON.stringify(v)} (allowed: ${allowed.join(", ")})`);
  };

  reqStr("objective");
  reqStr("audience");
  reqStr("productAngle");
  reqStr("cta");
  reqEnumArray("platforms", VALID_PLATFORMS, 1);
  reqEnumArray("adPlatforms", VALID_PLATFORMS, 0);
  reqEnumArray("ratios", VALID_RATIOS, 1);

  if (o.durationSec === undefined) problems.push("missing required field: durationSec");
  else if (typeof o.durationSec !== "number" || !(o.durationSec > 0))
    problems.push("field durationSec must be a number > 0");

  if (o.market === undefined) problems.push("missing required field: market");
  else if (!VALID_MARKETS.includes(o.market as string))
    problems.push(`field market has invalid value ${JSON.stringify(o.market)} (allowed: ${VALID_MARKETS.join(", ")})`);

  if (o.paid === undefined) problems.push("missing required field: paid");
  else if (typeof o.paid !== "boolean") problems.push("field paid must be a boolean");

  return problems;
}

function main(): void {
  const argv = process.argv.slice(2);
  const get = (k: string) =>
    argv.find((a) => a.startsWith(`--${k}=`))?.slice(k.length + 3);
  const intakePath = get("intake");
  const brandPath = get("brand");
  const branch = get("branch") as Branch | undefined;
  const transcriptPath = get("transcript");
  const outPath = get("out") ?? "work/script.json";
  const hookIndex = Number(get("hook") ?? "0");

  if (!intakePath || !brandPath || !branch) {
    log.warn(
      "usage: tsx scripts/script-engine.ts --intake=intake.json --brand=brand-profile.json --branch=<rama> [--transcript=t.json] [--hook=0] [--out=work/script.json]",
    );
    process.exit(2);
  }

  const intakeRaw = readJson<unknown>(intakePath);
  const problems = validateIntake(intakeRaw);
  if (problems.length > 0) {
    log.warn(
      `intake invalid (${intakePath}) — ${problems.length} problem(s) vs schemas/intake.schema.json:`,
    );
    for (const p of problems) log.item(p);
    process.exit(2);
  }
  const intake = intakeRaw as Intake;
  const brand = readJson<BrandProfile>(brandPath);
  const transcript = transcriptPath
    ? readJson<Transcript>(transcriptPath)
    : undefined;

  log.section(`Script: ${branch} → ${frameworkFor(branch)}`);
  const draft = buildScript({ intake, brand, branch, transcript, hookIndex });
  writeJson(outPath, draft);
  log.ok(`${draft.lines.length} beats, hook=${draft.hookId}`);
  log.info(
    `benefit rewrites: ${draft.benefitRewrites.length}, localisations: ${draft.localisations.length}`,
  );
  process.stdout.write(outPath + "\n");
}

if (isMain(import.meta.url)) main();
