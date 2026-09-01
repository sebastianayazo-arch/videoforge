/**
 * Typographic hierarchy (Module 3.2).
 *
 * Captions are the product, so the type system is deliberate: three levels
 * (H1 / H2 / base), a per-class colour + decoration map, and a contrast
 * guarantee. Everything here is PURE — given a brand profile and a level (or a
 * token) it returns a concrete, render-ready spec. No IO, no randomness.
 *
 * Rules encoded (from the spec):
 *   - H1  ≥120px, heavy sans, centred — the hook / CTA punchline.
 *   - H2  = base +25–40%, carries the accent/highlight for emphasis.
 *   - base ≥64px, mixed-case bold, 2–4 words.
 *   - Everything is oversized +20% vs a desktop baseline (mobile is watched
 *     at arm's length on a small screen).
 *   - Emphasis is mixed-case bold, never ALL-CAPS shouting.
 *   - Contrast must clear WCAG 4.5:1 — via outline or plate, whichever wins.
 */

import type {
  BrandCaptionsProfile,
  CaptionClass,
  CaptionLevel,
  CaptionToken,
  Hex,
} from "../../types.js";

// ---------------------------------------------------------------------------
// Sizing
// ---------------------------------------------------------------------------

/** Mobile oversize factor vs a desktop reading baseline. */
const OVERSIZE = 1.2;
/** Desktop baseline for `base`; oversized it clears the 64px floor. */
const DESKTOP_BASE_PX = 60;
/** H2 sits +33% over base — inside the 25–40% window. */
const H2_OVER_BASE = 1.33;
/** H1 towers over base and is floored at 120px. */
const H1_OVER_BASE = 1.72;
const H1_MIN_PX = 120;
const BASE_MIN_PX = 64;
/** WCAG AA target for text. */
const TARGET_RATIO = 4.5;

/** Concrete pixel size for a level, honouring the floors. */
export function pxForLevel(
  level: CaptionLevel,
  oversize: number = OVERSIZE,
): number {
  const base = Math.max(BASE_MIN_PX, Math.round(DESKTOP_BASE_PX * oversize));
  if (level === "base") return base;
  if (level === "H2") return Math.round(base * H2_OVER_BASE);
  // H1
  return Math.max(H1_MIN_PX, Math.round(base * H1_OVER_BASE));
}

// ---------------------------------------------------------------------------
// Contrast (WCAG relative luminance)
// ---------------------------------------------------------------------------

/** Parse "#rgb" or "#rrggbb" → [r,g,b] 0..255. Defensive on bad input. */
function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    const r = h[0]!;
    const g = h[1]!;
    const b = h[2]!;
    h = `${r}${r}${g}${g}${b}${b}`;
  }
  if (h.length !== 6) return [0, 0, 0];
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return [
    Number.isNaN(r) ? 0 : r,
    Number.isNaN(g) ? 0 : g,
    Number.isNaN(b) ? 0 : b,
  ];
}

/** sRGB channel → linear, per WCAG. */
function linearize(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG relative luminance 0..1. */
function relLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/** WCAG contrast ratio between two colours (1..21). */
export function contrastRatio(fgHex: string, bgHex: string): number {
  const l1 = relLuminance(fgHex);
  const l2 = relLuminance(bgHex);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

/** How legibility is guaranteed against unknown footage behind the glyphs. */
export interface ContrastTreatment {
  mode: "outline" | "plate";
  /** Achieved ratio for the chosen treatment (≥4.5 whenever attainable). */
  ratio: number;
  /** outline mode */
  outlinePx?: number;
  outlineColor?: Hex;
  /** plate mode */
  plateColor?: Hex;
  plateOpacity?: number;
}

const BLACK = "#000000" as Hex;
const WHITE = "#FFFFFF" as Hex;

/**
 * Pick outline vs plate so the foreground clears 4.5:1. Outline uses the
 * brand's stroke colour (fast, cheap); a plate is the fallback that always
 * wins because it puts a solid block behind the text. `bgHex` is the assumed
 * worst-case footage luminance (mid-grey by default).
 */
export function ensureContrast(
  fgHex: Hex,
  brand: BrandCaptionsProfile,
  bgHex: string = "#7F7F7F",
): ContrastTreatment {
  const outlineColor = brand.outlineColor;
  const outlineRatio = contrastRatio(fgHex, outlineColor);

  // Best solid plate is whichever pole (black/white) is furthest from fg.
  const rBlack = contrastRatio(fgHex, BLACK);
  const rWhite = contrastRatio(fgHex, WHITE);
  const plateColor = rBlack >= rWhite ? BLACK : WHITE;
  const plateRatio = Math.max(rBlack, rWhite);

  const preferOutline =
    brand.contrastStrategy === "outline" || brand.contrastStrategy === "both";

  // Outline only when the brand allows it AND it clears the target against
  // both its own stroke and the assumed footage; otherwise a plate guarantees.
  if (
    preferOutline &&
    outlineRatio >= TARGET_RATIO &&
    contrastRatio(fgHex, bgHex) < outlineRatio
  ) {
    return {
      mode: "outline",
      ratio: outlineRatio,
      outlinePx: 6,
      outlineColor,
    };
  }
  return {
    mode: "plate",
    ratio: plateRatio,
    plateColor,
    plateOpacity: 0.85,
  };
}

// ---------------------------------------------------------------------------
// Per-token colour + decoration
// ---------------------------------------------------------------------------

export type TokenColorRole = "accent" | "highlight" | "base";

export interface TokenStyle {
  color: Hex;
  role: TokenColorRole;
  /** 400..900; emphasised tokens go heaviest. */
  weight: number;
  /** Size multiplier vs the level px (numbers pop bigger). */
  scale: number;
  /** Contrast/pain treatments. */
  decoration?: "strike" | "shake";
}

/** Which colour role each commercial class wears. */
const ROLE_BY_CLASS: Record<CaptionClass, TokenColorRole> = {
  keyword_beneficio: "highlight",
  accion_cta: "highlight",
  numero_dato: "accent",
  nombre_producto: "accent",
  negacion_dolor: "base",
  conector: "base",
};

/**
 * Map a token's class to a render style. Emphasised tokens get the heaviest
 * weight; `negacion_dolor` gets a strike (or a shake when it is the emphasised
 * word) to read as pain/contrast rather than promise.
 */
export function styleForToken(
  token: CaptionToken,
  _level: CaptionLevel,
  brand: BrandCaptionsProfile,
): TokenStyle {
  const role = ROLE_BY_CLASS[token.klass];
  const color: Hex =
    role === "highlight"
      ? brand.highlightColor
      : role === "accent"
        ? brand.accentColor
        : brand.baseTextColor;

  const weight = token.emphasised ? 900 : role === "base" ? 600 : 800;
  const scale =
    token.klass === "numero_dato" ? 1.15 : token.emphasised ? 1.06 : 1;
  const decoration: TokenStyle["decoration"] =
    token.klass === "negacion_dolor"
      ? token.emphasised
        ? "shake"
        : "strike"
      : undefined;

  return { color, role, weight, scale, decoration };
}

// ---------------------------------------------------------------------------
// Per-level style spec
// ---------------------------------------------------------------------------

export interface CaptionStyleSpec {
  level: CaptionLevel;
  fontFamily: string;
  fontWeight: number;
  fontSizePx: number;
  lineHeight: number;
  /** Emphasis is mixed-case bold, never all-caps shouting. */
  letterCase: "mixed" | "upper";
  letterSpacingEm: number;
  align: "center" | "left";
  /** Recommended [min,max] words on screen for this level. */
  words: [number, number];
  contrast: ContrastTreatment;
}

export interface StyleOptions {
  /** Override the mobile oversize factor. */
  oversize?: number;
  /** Assumed footage luminance behind the caption (for contrast choice). */
  bgHex?: string;
}

/**
 * The main entry: given a brand profile and a level, return a concrete,
 * render-ready style spec. Pure and deterministic.
 */
export function styleForLevel(
  brand: BrandCaptionsProfile,
  level: CaptionLevel,
  opts: StyleOptions = {},
): CaptionStyleSpec {
  const oversize = opts.oversize ?? OVERSIZE;
  const fontSizePx = pxForLevel(level, oversize);

  const fontFamily =
    level === "H1" ? brand.h1Font : level === "H2" ? brand.h2Font : brand.baseFont;
  const fontWeight = level === "H1" ? 900 : level === "H2" ? 800 : 700;
  const lineHeight = level === "H1" ? 1.02 : 1.08;
  const letterSpacingEm = level === "H1" ? -0.02 : -0.01;
  const words: [number, number] =
    level === "H1" ? [1, 3] : level === "H2" ? [2, 4] : [2, 4];

  return {
    level,
    fontFamily,
    fontWeight,
    fontSizePx,
    lineHeight,
    letterCase: "mixed",
    letterSpacingEm,
    align: "center", // shorts read best centred
    words,
    contrast: ensureContrast(brand.baseTextColor, brand, opts.bgHex),
  };
}
