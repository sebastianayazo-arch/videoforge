/**
 * Brand fonts (Salomé brand book): Montserrat (display / H1·H2), Inter (body /
 * informative captions), Playfair Display (script / aspirational lines).
 *
 * loadFont() registers each face at import time and returns its CSS family name,
 * which matches the strings in brand-profile.json (`captions.h1Font` etc.), so
 * the caption profile's font names resolve to real, embedded fonts in the render.
 */
import { loadFont as loadMontserrat } from "@remotion/google-fonts/Montserrat";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadPlayfair } from "@remotion/google-fonts/PlayfairDisplay";

export const MONTSERRAT = loadMontserrat("normal", {
  weights: ["700", "800", "900"],
  subsets: ["latin"],
}).fontFamily;

export const INTER = loadInter("normal", {
  weights: ["500", "600", "700"],
  subsets: ["latin"],
}).fontFamily;

export const PLAYFAIR = loadPlayfair("normal", {
  weights: ["600", "700"],
  subsets: ["latin"],
}).fontFamily;

/** Also load Playfair italic for the elegant script moments. */
export const PLAYFAIR_ITALIC = loadPlayfair("italic", {
  weights: ["600", "700"],
  subsets: ["latin"],
}).fontFamily;
