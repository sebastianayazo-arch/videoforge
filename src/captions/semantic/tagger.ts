/**
 * Caption semantics (Module 3.1).
 *
 * Tags every caption token by its COMMERCIAL function, because captions are
 * the product and the eye must land on the words that sell. The tagger is
 * lexicon + pattern driven (Spanish, market-aware) and deliberately
 * conservative: exactly one word per block may be emphasised.
 *
 * Classes:
 *   keyword_beneficio  — the benefit word (max emphasis)
 *   numero_dato        — a number / stat (accent + scale + pop)
 *   nombre_producto    — the product name (display / two-tone)
 *   accion_cta         — the call to action (max + pulse)
 *   conector           — connective tissue (base, never highlighted)
 *   negacion_dolor     — a pain / negation for contrast (strike / shake)
 */

import type { CaptionClass, CaptionToken } from "../../types.js";

/** Benefit vocabulary for the shapewear / beauty vertical (extensible). */
const BENEFIT_WORDS = new Set([
  "moldea",
  "moldeas",
  "realza",
  "estiliza",
  "define",
  "afina",
  "levanta",
  "reduce",
  "comodísima",
  "invisible",
  "suave",
  "firmeza",
  "silueta",
  "confianza",
  "segura",
  "libre",
  "cómoda",
  "transpirable",
]);

/** Pain / negation vocabulary — used for contrast, never as the promise. */
const PAIN_WORDS = new Set([
  "no",
  "nunca",
  "sin",
  "adiós",
  "olvídate",
  "cansada",
  "harta",
  "incómoda",
  "aprieta",
  "marca",
  "rollitos",
]);

const CTA_WORDS = new Set([
  "compra",
  "aprovecha",
  "descubre",
  "consigue",
  "pruébala",
  "pídela",
  "corre",
  "hoy",
  "ya",
  "ahora",
  "link",
  "bio",
  "desliza",
  "toca",
]);

/** Connectors are always base — they never get the highlight. */
const CONNECTORS = new Set([
  "y",
  "o",
  "de",
  "la",
  "el",
  "los",
  "las",
  "un",
  "una",
  "que",
  "con",
  "por",
  "para",
  "en",
  "a",
  "se",
  "tu",
  "te",
  "me",
  "es",
  "lo",
  "al",
  "del",
]);

const NUMBER_RE = /^[$€]?\d+([.,]\d+)?[%x]?$|^\d+(k|mil|niveles?)$/i;

const norm = (w: string) =>
  w
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-́]/g, "") // strip acute accents for matching only
    .replace(/[.,!?¿¡…"“”'()]/g, "");

/**
 * Classify a single token given the resolved product name(s) for the brand.
 */
export function classifyToken(
  raw: string,
  productNames: ReadonlySet<string>,
): CaptionClass {
  const n = norm(raw);
  if (!n) return "conector";
  if (NUMBER_RE.test(raw.trim())) return "numero_dato";
  if (productNames.has(n)) return "nombre_producto";
  if (CTA_WORDS.has(n)) return "accion_cta";
  if (PAIN_WORDS.has(n)) return "negacion_dolor";
  if (BENEFIT_WORDS.has(n)) return "keyword_beneficio";
  if (CONNECTORS.has(n)) return "conector";
  return "conector"; // default: nothing shouts unless it earns it
}

/** Priority for choosing the ONE emphasised word in a block. */
const EMPHASIS_PRIORITY: CaptionClass[] = [
  "accion_cta",
  "keyword_beneficio",
  "numero_dato",
  "nombre_producto",
  "negacion_dolor",
  "conector",
];

/**
 * Tag a block of words: classify each, then emphasise at most one — the
 * highest-priority salient token. If everything is a connector, nothing is
 * emphasised (a base block).
 */
export function tagBlock(
  words: string[],
  productNames: ReadonlySet<string> = new Set(),
): CaptionToken[] {
  const tokens: CaptionToken[] = words.map((text) => ({
    text,
    klass: classifyToken(text, productNames),
    emphasised: false,
  }));

  let bestIdx = -1;
  let bestRank = Infinity;
  tokens.forEach((t, i) => {
    if (t.klass === "conector") return;
    const rank = EMPHASIS_PRIORITY.indexOf(t.klass);
    if (rank < bestRank) {
      bestRank = rank;
      bestIdx = i;
    }
  });
  if (bestIdx >= 0) tokens[bestIdx]!.emphasised = true;

  return tokens;
}

/** Convenience: the set of classes considered "keywords" for QC. */
export const KEYWORD_CLASSES: ReadonlySet<CaptionClass> = new Set([
  "keyword_beneficio",
  "numero_dato",
  "accion_cta",
  "nombre_producto",
]);
