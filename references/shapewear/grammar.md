# Detected grammar — shapewear / fajas vertical (Module 0.1)

**Status: STRUCTURED TEMPLATE, pre-populated with typical patterns.**
The values below are **well-reasoned defaults for the shapewear/beauty vertical**,
NOT the output of a real analysis run. Every section marked
`⟨PLACEHOLDER — pending real analysis⟩` must be overwritten with results from
`mcp-video-analyzer` over 5–8 real reference videos before these patterns are
trusted as brand grammar.

## Method (per spec)

Analyse 5–8 top-performing reference videos from established brands in the
vertical with `mcp-video-analyzer`, then extract the recurring grammar:
transitions, captions, pacing and colour. Feed the aggregate into the brand's
`transitions.weights`, `color`, and caption defaults.

### Reference set

| # | Source | Platform | Duration | Notes |
| --- | --- | --- | --- | --- |
| 1 | ⟨PLACEHOLDER — reference URL/id⟩ | ⟨tiktok⟩ | ⟨~15s⟩ | ⟨analysed: no⟩ |
| 2 | ⟨PLACEHOLDER⟩ | ⟨instagram⟩ | ⟨~22s⟩ | ⟨analysed: no⟩ |
| 3 | ⟨PLACEHOLDER⟩ | ⟨tiktok⟩ | ⟨~18s⟩ | ⟨analysed: no⟩ |
| 4 | ⟨PLACEHOLDER⟩ | ⟨meta⟩ | ⟨~20s⟩ | ⟨analysed: no⟩ |
| 5 | ⟨PLACEHOLDER⟩ | ⟨tiktok⟩ | ⟨~24s⟩ | ⟨analysed: no⟩ |
| 6 | ⟨PLACEHOLDER⟩ | ⟨instagram⟩ | ⟨~16s⟩ | ⟨analysed: no⟩ |

---

## 1. Transition grammar

**Typical pattern (pre-populated):**

- **Hard cut on the beat is the backbone** (~70–80% of all boundaries). Cuts
  land on the musical beat; they survive mobile compression and read as clean.
- **Occasional whip / action-cut** (~1–2 per video) on real camera motion —
  outfit change, turn to show the back, hand crossing frame. Always paired with
  a whoosh. Never faked without directional motion on both sides.
- **Zoom-punch** reserved for a product-detail emphasis on a beat (costura,
  tela) — at most once.
- **Before/after handled compliantly:** shown as *same person, same session,
  wearing vs. not wearing under the same outfit* to show fit/smoothing — **never**
  framed as body transformation, weight, or shame. No split-screen "antes/después"
  with judgment. Prefer a single continuous reveal (match-cut on the garment) to
  a shaming split.
- **Crossfade** only on the mood/testimonial close — never on beat edits or
  offers.
- **Glitch: effectively absent** in premium shapewear grammar; reads cheap.
  (Silueta bans it.)

Maps to `BrandTransitionsProfile.weights`:
`hard-cut` high, `action-cut-whip` medium, `zoom-punch`/`match-cut` low-medium,
`crossfade` low, `glitch` banned.

⟨PLACEHOLDER — replace weights with measured transition-type frequencies⟩

## 2. Caption grammar

**Typical pattern (pre-populated):**

- **Short blocks: 2–4 words.** One idea per block; the eye lands on the word
  that sells.
- **Keyword pops:** the benefit word or number scales/pops on entry
  (`keyword_beneficio`, `numero_dato`). Max **one** emphasised word per block.
- **Karaoke sync** on any voz-a-cámara (`voz_modelo_a_camara`); design captions
  never desync from real speech.
- **Placement** avoids the product region and the face; anchors resolve after
  occlusion solving.
- **Contrast:** plate **and** outline for legibility over skin and fabric.
- **Compliant vocabulary only:** benefit + comfort words (moldea, cómoda,
  invisible, firmeza, confianza). **No** `adelgaza / rollitos / baja de peso`.

Maps to `BrandCaptionsProfile` (contrastStrategy `both`, diacriticsVerified) and
`CaptionClass` biases per template.

⟨PLACEHOLDER — replace with measured block length distribution + pop timing⟩

## 3. Pacing

**Typical pattern (pre-populated):**

- **Cut every 2–3 s** (max dead air ~3 s; `RetentionPlan.maxDeadAirSec`).
- Hook resolves in the **first ~3 s**; a re-hook beat around the mid-point.
- Energy curve: strong open, brief dip for context, rise into the
  benefit/reveal, steady close. See per-branch `energyProfile` in templates.

⟨PLACEHOLDER — replace with measured average shot length + energy curve⟩

## 4. Colour

**Typical pattern (pre-populated):**

- **Warm** temperature, **medium** contrast, **natural** saturation — flattering,
  premium-accessible, not over-graded.
- **High skin fidelity:** hues in ~15°–50° are protected from grading so skin
  never turns orange/green. Maps to `BrandColorProfile.skinHueRange [15,50]`.
- Consistent white balance across clips via histogram matching
  (`ClipVisionAnalysis.histogram` / `whiteBalanceKelvin`).

Maps to `BrandColorProfile` (`warm` / `medium` / `natural`) and seeds the brand
LUT.

⟨PLACEHOLDER — replace with measured mean histograms + WB from references⟩

---

## Compliance note (applies to the whole vertical)

The shapewear ruleset forbids weight-loss claims and body-shame framing. Any
grammar pattern imported from references that relies on "antes/después" shame,
"adelgaza/reduce medidas/quema grasa", or a defect narrative is **rejected at
import** — the detected grammar is filtered through the category ruleset before
it becomes brand default.
