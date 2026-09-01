# LUTs — Silueta

The brand LUT (`silueta-warm-natural.cube`) is **generated**, not hand-authored.
It is the colour seed referenced by `brand-profile.json → color.lut` and is
applied at grade time so every clip matches the brand look.

## How it is produced

1. **Seed = `brand-profile.color`.** The generator reads the declared intent:
   - `temperature: "warm"`
   - `contrast: "medium"`
   - `saturation: "natural"`
   - `skinHueRange: [15, 50]` — a **protected** hue band.
2. **Post analysis.** A sample of the brand's best-performing organic posts is
   analysed (mean per-channel histograms + white balance, see
   `ClipVisionAnalysis.histogram` / `whiteBalanceKelvin`). The generator fits a
   warm, medium-contrast, natural-saturation transform to that reference look.
3. **Skin protection.** Hues inside `skinHueRange` (15°–50°) are held near-neutral
   so the grade never pushes skin orange/green — high skin fidelity is a hard
   requirement for the vertical.
4. **Output.** A 33³ `.cube` LUT written here as `silueta-warm-natural.cube`.

## Regeneration

Regenerate whenever `color` changes in the brand profile or the reference post
set is refreshed. The `.cube` is **git-ignored by default**; the brand LUT is the
one exception (`!templates/**/*.cube` covers template LUTs — the Silueta brand
LUT is stored in the secured asset drive and regenerated on demand from the seed
above, so the repo stays binary-free).

> Placeholder: `silueta-warm-natural.cube` is not committed. Run the LUT
> generator with this folder's seed to produce it before first render.
