/**
 * Content Compliance Validator (Module 10) — pre-render creative gate.
 *
 * For shapewear / beauty (parametrised by brand.category). The copywriter of
 * the system already knows these rules BEFORE writing (Module 2.2); this is
 * the belt-and-suspenders check that runs before a frame is rendered and
 * produces a per-platform semáforo (green / yellow / red) with the suggested
 * correction. A single red blocks the render.
 *
 * Policy state verified 2026-09-01 (policies change — re-verify in Fase 0):
 *
 * META (Facebook/Instagram) — moved to CLAIMS-BASED evaluation:
 *   - Before/after is no longer auto-rejected in general, BUT it is still
 *     prohibited specifically for weight-loss and anti-aging/wrinkle products.
 *   - Violates if the message implies negative self-perception
 *     ("deja de avergonzarte de tu cuerpo"), declares an ideal body type,
 *     asserts/implies knowledge of the viewer's personal attributes via
 *     second-person "you" framing ("baja tu abdomen"), or makes deceptive
 *     efficacy promises.
 *   - "Pinched-fat" imagery (pellizcarse la grasa) remains prohibited.
 *   - Body-image / weight ads may not target under-18 under any circumstance.
 *
 * TIKTOK — Weight Management & Body Image policy update: rolled out late
 *   July 2026, full enforcement 2026-08-08.
 *   - Shapewear may describe shaping / smoothing effects, but must NOT be
 *     described as causing actual weight loss.
 *   - No fast / guaranteed / quantified results claims.
 *   - No before/after body-comparison imagery to prove results.
 *   - Underwear/shapewear restricted or disallowed in specific markets.
 *
 * MEDICAL (post-surgical faja line): claims are health claims — require
 *   substantiation or degrade to comfort/support language.
 *
 * Sources (2026-09): Meta Business Help "Personal Health"; TikTok Ads
 * "Weight Management" + "Update to Weight Management and Body Image Policy
 * (May/Jul 2026)".
 */

import type {
  ComplianceFinding,
  ComplianceLight,
  ComplianceReport,
  Market,
  Platform,
} from "../src/types.js";

// ---------------------------------------------------------------------------
// Input model
// ---------------------------------------------------------------------------

export interface CreativeInput {
  category: "shapewear" | "beauty" | "apparel" | "other";
  /** Every line of copy: VO + on-screen captions. Checked verbatim. */
  lines: string[];
  market: Market;
  /** Ad platforms the creative will run on (from intake.adPlatforms). */
  adPlatforms: Platform[];
  minTargetAge?: number;
  /** Visual flags surfaced by the vision pass / human tagging. */
  visuals?: {
    beforeAfter?: boolean;
    pinchedFat?: boolean;
    problemAreaCloseup?: boolean;
    medicalFraming?: boolean;
  };
  /** Post-surgical / medical line: efficacy claims need substantiation. */
  isMedicalLine?: boolean;
  /** True if the medical claims have documented substantiation on file. */
  hasSubstantiation?: boolean;
}

// ---------------------------------------------------------------------------
// Rule vocabulary (Spanish, concept-level). Extend per category.
// ---------------------------------------------------------------------------

/** Shapewear-as-weight-loss — banned on both platforms. */
const WEIGHT_LOSS_CLAIMS = [
  "adelgaza",
  "adelgazar",
  "baja de peso",
  "bajar de peso",
  "pierde peso",
  "perder peso",
  "quema grasa",
  "quemar grasa",
  "elimina grasa",
  "derrite",
  "rebaja",
];

/** Guaranteed / quantified / time-bound results — banned. */
const GUARANTEE_CLAIMS = [
  /garantiza/i,
  /resultados? garantizado/i,
  /en \d+\s*(d[ií]as?|semanas?|horas?)/i,
  /\-?\s*\d+\s*(kilos?|kg|tallas?|cm|centímetros?)\s*(menos|en)/i,
  /pierde\s+\d+/i,
];

/** Negative self-perception / body shame — Meta hard fail. */
const SHAME_PATTERNS = [
  /averg[uü][eé]nza/i,
  /vergüenza de tu cuerpo/i,
  /odias? tu/i,
  /esconde tus? rollit/i,
  /esconder? (la|los|tus) (barriga|rollit|gordura)/i,
  /odiar tu cuerpo/i,
  /deja de avergonzarte/i,
];

/** Second-person personal-attribute framing — Meta risk (implies knowledge). */
const PERSONAL_ATTR_PATTERNS = [
  /\btu (barriga|abdomen|grasa|gordura|celulitis|rollitos)\b/i,
  /baja tu (abdomen|barriga|panza)/i,
  /tu cuerpo (perfecto|ideal)/i,
];

/** Declaring an ideal body type — Meta fail. */
const IDEAL_BODY_PATTERNS = [
  /cuerpo (ideal|perfecto)/i,
  /talla (ideal|perfecta)/i,
  /figura perfecta/i,
];

/** Markets where TikTok restricts/disallows underwear & shapewear creative. */
const TIKTOK_SHAPEWEAR_RESTRICTED_MARKETS = new Set<string>([
  // Country-level per TikTok policy; VideoForge markets are regional, so this
  // is applied when a creative declares an explicit restricted geo in notes.
  "AL", "BN", "SV", "ET", "HN", "KG", "LA", "LY", "ML", "MU", "MC", "MM",
  "NI", "SN", "TZ", "UG",
]);

/** Positive-aspirational rewrites for common negative angles. */
const SUGGESTED_REWRITES: { pattern: RegExp; to: string }[] = [
  { pattern: /esconde tus? rollit\w*/i, to: "realza tu silueta" },
  { pattern: /adelgaza\w*/i, to: "moldea y estiliza tu figura" },
  { pattern: /quema grasa/i, to: "te da una silueta más definida" },
  { pattern: /averg[uü][eé]nza\w*/i, to: "siéntete segura y libre" },
  { pattern: /tu barriga/i, to: "tu silueta" },
];

const worst = (a: ComplianceLight, b: ComplianceLight): ComplianceLight =>
  a === "red" || b === "red" ? "red" : a === "yellow" || b === "yellow" ? "yellow" : "green";

function suggestRewrite(line: string): string | undefined {
  for (const r of SUGGESTED_REWRITES) {
    if (r.pattern.test(line)) return line.replace(r.pattern, r.to);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Platform rule sets
// ---------------------------------------------------------------------------

function checkMeta(c: CreativeInput): ComplianceFinding[] {
  const f: ComplianceFinding[] = [];
  const push = (
    light: ComplianceLight,
    rule: string,
    offending?: string,
    suggestion?: string,
  ) => f.push({ platform: "meta", light, rule, offending, suggestion });

  for (const line of c.lines) {
    const lower = line.toLowerCase();
    if (SHAME_PATTERNS.some((p) => p.test(line)))
      push("red", "Meta: mensaje de auto-percepción negativa / vergüenza corporal", line, suggestRewrite(line));
    if (PERSONAL_ATTR_PATTERNS.some((p) => p.test(line)))
      push("red", "Meta: framing en 2ª persona que implica conocer un atributo personal del usuario", line, suggestRewrite(line));
    if (IDEAL_BODY_PATTERNS.some((p) => p.test(line)))
      push("red", "Meta: declara un tipo de cuerpo/talla ideal", line, suggestRewrite(line));
    if (WEIGHT_LOSS_CLAIMS.some((w) => lower.includes(w)))
      push("red", "Meta: claim de pérdida de peso para shapewear (engañoso)", line, suggestRewrite(line));
    if (GUARANTEE_CLAIMS.some((p) => p.test(line)))
      push("yellow", "Meta: promesa de eficacia garantizada/cuantificada — reformular a lenguaje de confort/estilo", line, suggestRewrite(line));
  }

  if (c.visuals?.pinchedFat)
    push("red", "Meta: imagen 'pinched-fat' (pellizcar la grasa) — prohibida");
  if (c.visuals?.beforeAfter && (c.category === "shapewear" || c.category === "beauty"))
    // Before/after is claims-based on Meta generally, but for weight/appearance
    // framing it is high-risk; medical/weight-loss framing makes it a hard fail.
    push(
      c.visuals?.medicalFraming ? "red" : "yellow",
      "Meta: antes/después en categoría de apariencia — evaluado por claim; alto riesgo si implica transformación corporal/médica",
      undefined,
      "Mostrar el producto y el 'después' aspiracional sin comparación de cuerpo como condición",
    );
  if (c.visuals?.problemAreaCloseup)
    push("yellow", "Meta: primer plano de 'zona problema' — puede leerse como auto-desprecio");
  if ((c.minTargetAge ?? 18) < 18)
    push("red", "Meta: los anuncios de imagen corporal/peso no pueden segmentar a menores de 18");

  if (f.length === 0) push("green", "Meta: sin banderas — ángulo positivo/aspiracional");
  return f;
}

function checkTikTok(c: CreativeInput, restrictedGeo?: string): ComplianceFinding[] {
  const f: ComplianceFinding[] = [];
  const push = (
    light: ComplianceLight,
    rule: string,
    offending?: string,
    suggestion?: string,
  ) => f.push({ platform: "tiktok", light, rule, offending, suggestion });

  for (const line of c.lines) {
    const lower = line.toLowerCase();
    if (WEIGHT_LOSS_CLAIMS.some((w) => lower.includes(w)))
      push("red", "TikTok: describe shapewear como causante de pérdida de peso (prohibido; sí permite 'moldea/suaviza')", line, suggestRewrite(line));
    if (GUARANTEE_CLAIMS.some((p) => p.test(line)))
      push("red", "TikTok: resultados rápidos/garantizados/cuantificados (Weight Management & Body Image, vigente 2026-08-08)", line, suggestRewrite(line));
    if (SHAME_PATTERNS.some((p) => p.test(line)))
      push("red", "TikTok: contenido de vergüenza corporal — viola política body-positive", line, suggestRewrite(line));
  }
  if (c.visuals?.beforeAfter)
    push("red", "TikTok: imagen de comparación antes/después del cuerpo para probar resultados — prohibida", undefined, "Usar demo de uso/ajuste, no comparación corporal");

  if (restrictedGeo && TIKTOK_SHAPEWEAR_RESTRICTED_MARKETS.has(restrictedGeo.toUpperCase()))
    push("red", `TikTok: shapewear/ropa interior no permitida en el mercado ${restrictedGeo}`);

  if (f.length === 0) push("green", "TikTok: sin banderas — describe efecto de moldeado sin claim de peso");
  return f;
}

function checkMedical(c: CreativeInput): ComplianceFinding[] {
  if (!c.isMedicalLine) return [];
  if (c.hasSubstantiation)
    return [{ platform: "meta", light: "yellow", rule: "Línea médica (post-quirúrgica): claim de salud con sustento en archivo — mantener lenguaje respaldado" }];
  return [
    {
      platform: "meta",
      light: "red",
      rule: "Línea médica (post-quirúrgica): claim de salud sin sustento — degradar a lenguaje de confort/soporte",
      suggestion: "Reemplazar 'recuperación/reduce inflamación' por 'soporte y compresión cómoda'",
    },
  ];
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function checkCreative(
  c: CreativeInput,
  opts: { restrictedGeo?: string } = {},
): ComplianceReport {
  const findings: ComplianceFinding[] = [];
  const wants = new Set(c.adPlatforms);
  if (wants.has("meta") || wants.has("instagram")) findings.push(...checkMeta(c));
  if (wants.has("tiktok")) findings.push(...checkTikTok(c, opts.restrictedGeo));
  findings.push(...checkMedical(c));

  // If no ad platforms declared, still run Meta+TikTok as a general pass.
  if (wants.size === 0) {
    findings.push(...checkMeta(c), ...checkTikTok(c, opts.restrictedGeo));
  }

  const overall = findings.reduce<ComplianceLight>(
    (acc, x) => worst(acc, x.light),
    "green",
  );
  return { category: c.category, findings, overall };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("uso: tsx scripts/policy-check.ts <creative.json> [restrictedGeo]");
    process.exit(2);
  }
  const { readFile } = await import("node:fs/promises");
  const creative = JSON.parse(await readFile(path, "utf8")) as CreativeInput;
  const report = checkCreative(creative, { restrictedGeo: process.argv[3] });
  const icon: Record<ComplianceLight, string> = { green: "🟢", yellow: "🟡", red: "🔴" };
  console.log(`\nCompliance (${report.category}) → ${icon[report.overall]} ${report.overall.toUpperCase()}\n`);
  for (const x of report.findings) {
    console.log(`${icon[x.light]} [${x.platform}] ${x.rule}`);
    if (x.offending) console.log(`     ↳ "${x.offending}"`);
    if (x.suggestion) console.log(`     ✎ ${x.suggestion}`);
  }
  process.exit(report.overall === "red" ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
