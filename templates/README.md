# Templates (Module 5) — branch skeletons → `video-plan.json`

Each folder holds one `template.json`, one per **branch (rama)** from the
`Branch` enum in `src/types.ts`:

| Folder | `branch` | `framework` | Narración |
| --- | --- | --- | --- |
| `problema-solucion/` | `problema-solucion` | `PAS` | cloned |
| `demo-directa/` | `demo-directa` | `resultado-primero` | cloned |
| `oferta-urgencia/` | `oferta-urgencia` | `4U` | cloned |
| `ugc-testimonio/` | `ugc-testimonio` | `ugc-literal` | recorded |
| `lanzamiento/` | `lanzamiento` | `4U` | cloned |

## What a template declares

A template is a **superset** of the runtime `Scene`/`EnergyPoint` shapes — it
adds `templateNotes` and skeleton hints that are resolved into concrete values
when a plan is built. Every template carries:

- **`branch`** + **`framework`** — the narrative rama and copy framework.
- **`energyProfile`** — array of `{ atSec, energy }` (the `EnergyPoint` shape):
  the per-scene energy shape that drives music, transitions and pacing.
- **`captionBias`** — which `CaptionClass` values dominate (e.g. `oferta` →
  `numero_dato` at max; `ugc` → literal, benefit words).
- **`narrationMode`** — required `vo.source`: `recorded` (voz a cámara real,
  obligatorio para `ugc-testimonio`) or `cloned` (chatterbox, needs
  `voice.consent`).
- **`sceneSkeleton`** — ordered scenes with `purpose` + `roughSec` + `energy`.
- **`transitionTendencies`** — default `TransitionType` bias + what to avoid,
  and a `flashyBudgetHint`.
- **`defaultMusicMood`** — a `MusicMood.name` from the brand profile.

## Template + intake → `video-plan.json`

```
brand-profile.json ─┐
                    ├─► [Module 5 planner] ─► video-plan.json (VideoPlan)
template.json ──────┤
intake (Module 4) ──┘
```

1. **Intake** (`Intake`) fixes objective, platform(s), audience, CTA,
   `durationSec`, market, paid/adPlatforms, ratios.
2. The planner selects the **branch** (or the brand's winning branch) and loads
   its `template.json`.
3. `sceneSkeleton` × `intake.durationSec` → concrete `Scene[]` (frames from
   `roughSec` × fps), each seeded with the template's `captionBias` and
   `narrationMode`.
4. `energyProfile` → `energyCurve` (`EnergyPoint[]`), which feeds the transition
   decision engine (`boundaries`) and music selection (`music.plan`).
5. Brand `copy.hookFormulas` + `src/copy/hooks.json` → `hookVariants` (only the
   first ~3s differ).
6. Compliance (Module 10) runs against `category: "shapewear"` and the brand's
   `bannedWords`, producing the `ComplianceReport`. Red blocks render.
7. Output is a `VideoPlan` — the master, approvable document.

The template never hard-codes brand identity: fonts, colours, voice, LUT and
music moods all come from `brand-profile.json` at plan time.
