# VideoForge — Índice de documentación y arquitectura

- [`RESEARCH.md`](./RESEARCH.md) — Fase 0: investigación del último trimestre,
  políticas de pauta verificadas (2026‑09) y **Decisiones de diseño**.
- [`STACK.md`](./STACK.md) — Skills/MCPs/herramientas con **licencia verificada**
  y la matriz de "prohibidos para publicar".
- [`../README.md`](../README.md) — visión, pipeline, checkpoints, estado de
  implementación.

## Árbol del repositorio

```
videoforge/
├─ brands/<marca>/
│  ├─ brand-profile.json     .captions .voice(+consent) .imageRights .transitions .color .copy .performance
│  ├─ voice-samples/  luts/  sonic-logo/
│  └─ learnings.md           ← ciclo de aprendizaje (Módulo 12)
├─ templates/<rama>/         ← estructura + captions + copy-framework + perfil de energía
├─ references/<vertical>/    ← gramática de referentes analizados (mcp-video-analyzer)
├─ schemas/                  ← JSON Schema de brand-profile y video-plan
├─ src/
│  ├─ types.ts               ← EL contrato de dominio (todo lo importa)
│  ├─ index.ts  Root.tsx  Main.tsx
│  ├─ captions/{semantic,typography,rhythm,spatial}/
│  ├─ transitions/{decision-engine.ts, library/}
│  ├─ copy/{hooks.json, frameworks/}
│  ├─ components/{text, callouts, endcard}
│  ├─ scenes/
│  └─ audio/{mix.ts, README.md, sfx-library/}
├─ scripts/
│  ├─ ingest.ts brand-ingest.ts transcribe.ts script-engine.ts voice.ts
│  ├─ music.ts trend-audio.ts color.ts stabilize.ts occlusion.ts
│  ├─ policy-check.ts retention.ts variants.ts
│  └─ qc.ts qc-captions.ts qc-transitions.ts qc-color.ts
├─ test/                     ← tests de la lógica determinista central
└─ docs/  RESEARCH.md STACK.md README.md
```

## Mapa Módulo → archivo

| Módulo | Implementación |
|---|---|
| 0 Investigación / Stack | `docs/RESEARCH.md`, `docs/STACK.md` |
| 1 Perfil de marca | `brands/<marca>/brand-profile.json`, `scripts/brand-ingest.ts` |
| 2 Guion y copywriting | `scripts/script-engine.ts`, `src/copy/` |
| 3 Captions inteligentes | `src/captions/*` |
| 4 Cuestionario | `Intake` en `src/types.ts` (Módulo 4) |
| 5 Ramificación | `templates/<rama>/`, `VideoPlan` |
| 6 Transiciones | `src/transitions/decision-engine.ts` |
| 7 Audio para pauta | `scripts/music.ts`, `scripts/trend-audio.ts` |
| 8 Post de imagen (colorista) | `scripts/color.ts`, `scripts/stabilize.ts` |
| 9 Arquitectura sonora | `src/audio/mix.ts`, `src/audio/README.md` |
| 10 Compliance de categoría | `scripts/policy-check.ts` |
| 11 Retención y ad‑ops | `scripts/retention.ts`, `scripts/variants.ts` |
| 12 Ciclo de aprendizaje | `brands/<marca>/learnings.md`, `.performance` |
| 13 Pipeline de producción | `scripts/ingest.ts`, `scripts/qc*.ts` |
