# Sonic logo — Salomé

The **sonic logo** is a short audio signature (0.5–1.5 s) generated **once per
brand** (Module 9A.4) and referenced by `brand-profile.json → sonicLogo`.

## What it is

A brief, recognisable mnemonic — a soft rising chime that resolves warm,
matching the brand's `confianza-elegante` mood. Think "premium but cercano", not
a jingle. It is generated once, approved, and reused across every video so the
brand becomes audibly recognisable.

- **Duration:** 0.5–1.5 s (target ~1.0 s).
- **Placement (default):** at the **end card**, landing on the CTA frame.
- **Loudness:** mixed to sit under any VO, normalised to the same integrated
  LUFS target as the master so it never spikes true-peak.
- **File:** `salome-sonic-logo.wav` (git-ignored like all media; regenerate from
  the brand mood seed).

## Generation

Seeded from `musicMoods` (primary: `confianza-elegante`, 100–115 BPM, warm
synth) and the brand palette's emotional read. Generated as an **original**
(`SfxCue.source: "generated"`) so it carries **no third-party license risk** and
is safe for paid ads on all platforms.

> Placeholder: `salome-sonic-logo.wav` is not committed. Generate once, get
> brand approval, then wire it as the default end-card cue.
