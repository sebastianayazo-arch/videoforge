# Módulo 9 — Arquitectura sonora de atención

El sonido no acompaña al video: **compite por la atención** en igualdad con lo
visual, y con ventaja fisiológica (el cerebro procesa audio ~2x más rápido; un
sonido en el frame exacto de un corte reorienta la atención involuntariamente).

**Principio rector:** diseña para **sonido apagado**, premia con **sonido
encendido**. El video funciona mudo; con audio es multiplicador.

## 9A — Capa de atención (`mix.ts`)
- **Hook sonoro (frames 0–24):** pattern interrupt auditivo por rama
  (`SONIC_HOOKS`): sub‑drop (oferta), riser que resuelve en el primer corte
  (lanzamiento), sonido diegético del producto (demo/UGC), o silencio abrupto
  (problema‑solución). Regla dura (`hookConnects`): el interrupt debe conectar
  con lo que sigue; un shock que no paga destruye el completion.
- **Taxonomía de SFX** (`sfx-library/manifest.json`): risers, impacts, whooshes
  direccionales, ticks/pops, sub‑drops, notification **originales**,
  product‑ASMR. Todos **generados o libres verificados**.
- **Re‑enganches sonoros:** los puntos de fuga del Módulo 11 reciben también un
  evento sonoro (cambio de sección/riser/SFX), no solo visual.
- **Sonic logo de marca** (`brands/<marca>/sonic-logo/`): motivo de 0.5–1.5s,
  default en el end card; sube el reconocimiento acumulativo.
- **Presupuesto de atención** (`auditAttentionBudget`): máx. 1 evento de
  atención por ventana de 3–5s fuera de los puntos planificados.

## 9B — Capa de oficio (mezcla)
- **Limpieza de voz:** DeepFilterNet/RNNoise → high‑pass ~80Hz → de‑esser →
  compresión suave → EQ de presencia. La voz clonada pasa la misma cadena.
- **Jerarquía de mezcla** (`MIX`): voz al frente; SFX bajo voz / sobre música;
  música −18..−14 LUFS con ducking automático; SFX de hook (0–1s) al frente.
- **Sincronía a frame exacto** (`syncOk`, tolerancia ±2 frames): la ventaja de
  velocidad del audio solo existe si la sincronía es perfecta.
- **Normalización final:** −14 LUFS integrado, true peak ≤ −1 dBTP (loudnorm 2
  pasadas — `scripts/qc.ts`).
- **Cero silencio incómodo**; colas de música con fade real.
- **QC sonoro** (`auditPlanSfx` + `qc.ts`): cada SFX planificado existe, suena en
  su frame, y el hook es audible sobre la música en el primer segundo. Ningún
  SFX de fuente no verificada entra a `pauta=sí`.
