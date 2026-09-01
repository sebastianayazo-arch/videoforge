# VideoForge

**Producción de video programático.** Convierte clips crudos en videos
publicables de calidad profesional, con identidad de marca, aptos para orgánico
y para **pauta pagada multi‑plataforma**.

> Flujo final: **adjuntar clips → responder un cuestionario corto → recibir
> video(s) terminados con reporte de decisiones y compliance.**

Esto es **creación, no edición**: el sistema escucha, entiende y escribe el
guion antes de tocar un frame.

## Principios rectores
1. **Los captions son el producto** (70–85% del consumo es sin sonido).
2. Creación, no edición: primero el guion, después el frame.
3. Las **transiciones son gramática**, no decoración.
4. Todo output debe poder **pautarse**: música con licencia limpia **y** creativo
   que pasa las políticas de la categoría.
5. **La retención se diseña**: cada segundo se gana el siguiente.
6. **El sistema aprende**: cada resultado alimenta al siguiente.

---

## Estado de implementación (honesto)

VideoForge es un sistema grande; este repo entrega la **arquitectura completa +
la lógica determinista central implementada**, con **stubs claramente marcados**
para los binarios de ML/externos (que requieren instalación aparte y a veces
GPU). Nada finge resultados: donde un modelo no está, el código degrada con
elegancia y registra qué falta.

| Área | Estado |
|---|---|
| Modelo de dominio (`src/types.ts`) | ✅ Completo — el contrato que todo importa |
| Motor de transiciones (`src/transitions/decision-engine.ts`) | ✅ Lógica real, pura, testeable |
| Semántica de captions (`src/captions/semantic/`) | ✅ Etiquetador por función comercial |
| Tipografía / ritmo / anti‑oclusión (`src/captions/`) | ✅ Solver espacial y builder de ritmo |
| Arquitectura sonora (`src/audio/mix.ts`) | ✅ Presupuesto de atención, jerarquía de mezcla, sync |
| Compliance de categoría (`scripts/policy-check.ts`) | ✅ Reglas Meta/TikTok verificadas 2026‑09 |
| Muro legal de audio (`scripts/music.ts::assertPaidSafe`) | ✅ Gate por licencia/plataforma |
| Render Remotion (`src/Main.tsx`, componentes) | ✅ Composición que abre en Studio (placeholders donde no hay clip) |
| Perfil de marca + templates + hooks + referencias | ✅ Ejemplo `brands/silueta` + 5 ramas |
| FFmpeg/ffprobe (ingest, color, stabilize, qc, loudnorm) | ✅ Comandos reales; degradan si falta el input |
| WhisperX / Chatterbox / ACE‑Step / MediaPipe | 🟡 Interfaz + shell‑out real, **stub degradado** si el binario no está |
| Scraping de marca / referentes (yt‑dlp / mcp‑video‑analyzer) | 🟡 Interfaz + degradación elegante |

Ver `docs/RESEARCH.md` (Fase 0) y `docs/STACK.md` (licencias verificadas).

---

## El pipeline (Módulos → código)

```
adjuntar clips
   │
   ▼
[1] ingest.ts        ffprobe rotación explícita · frames 10/50/90% · normaliza 1080x1920 H.264
[2] transcribe.ts    WhisperX palabra+diarización · clasifica audio (a‑cámara / dirección / ambiente)
   │                 (voz_direccion NUNCA suena; es el mapa plano→feature)
   ▼
cuestionario (Módulo 4, ≤9 preguntas)  →  intake
   │
   ▼
[5] script-engine.ts  copywriting de respuesta directa (PAS/4U/resultado‑primero/UGC)
   │                  hooks.json · beneficio>característica · localización CO/MX/US‑latino
   │                  compliance integrado ANTES de escribir
   ▼
árbol de ramificación  →  video-plan.json  (guion + fronteras con razón + plan de audio + curva de retención)
   │
   ├── captions/        semántica · tipografía · ritmo · anti‑oclusión · .srt
   ├── transitions/     decision-engine (gramática, presupuesto, SFX por corte)
   ├── audio/           hook sonoro · SFX de atención · mezcla −14 LUFS · sonic logo
   ├── color.ts         match entre clips · grade de marca · protección de piel
   ├── stabilize.ts     vidstab + reframe inteligente a 9:16
   ├── policy-check.ts  semáforo por plataforma (rojo bloquea)
   └── retention.ts     aire muerto · interrupción de patrón · re‑hooks
   │
   ▼
[checkpoint maestro]  guion + tabla de fronteras + plan de audio con licencias + semáforo + hooks alternativos
   │
   ▼
[render] Remotion (background desacoplado)  →  variants.ts (hook A/B/C · 9:16 master · 4:5 · 1:1)
   │
   ▼
[qc] qc.ts + qc-captions + qc-transitions + qc-color  ·  loudnorm 2 pasadas
   │
   ▼
entrega:  marca_producto_rama_hook-X_plataforma_ratio_duracion_vN.mp4  +  .srt  +  cover  +  report.md
   │
   ▼
[12] learnings.md + brand-profile.performance  →  el siguiente video arranca más inteligente
```

## Checkpoints (protocolo de interacción)
1. **Decisiones de diseño post‑Fase 0** (gramática de referentes + reglas de policy vigentes).
2. **Brand‑profile** (diferencias brand book vs redes + estado de consents/derechos).
3. **Guion + tabla de fronteras + plan de audio con licencias + semáforo de compliance + hooks alternativos** — *el checkpoint maestro*.
4. **Frames de verificación post‑render** (captions, fronteras, color/piel).

Degrada con elegancia ante cualquier fallo externo.

---

## Uso

```bash
npm install            # Remotion es propietario (ver STACK.md): verifica el tramo de licencia por tamaño de empresa
npm run studio         # abre Remotion Studio con una composición de ejemplo
npm run typecheck      # tsc --noEmit

# pipeline (cada paso degrada si falta su binario externo)
npm run ingest -- ./clips/*.mp4
npm run transcribe -- ./work/clip1.mp4
npm run script
npm run policy-check -- ./work/creative.json
npm run qc -- ./renders/out.mp4
```

## Arquitectura del repo
Ver el árbol en `docs/README.md`. Directorios clave:
- `brands/<marca>/` — perfil, voice‑samples, luts, sonic‑logo, `learnings.md`.
- `templates/<rama>/` — estructura + captions + framework + perfil de energía.
- `references/<vertical>/` — gramática de referentes analizados.
- `src/` — captions, transitions, copy, components, scenes, audio, `Main.tsx`.
- `scripts/` — todo el pipeline (ingest…qc).
- `docs/` — RESEARCH, STACK, README.

## Criterio de éxito
Un espectador **en silencio** entiende todo, ve el producto sin obstrucción y su
ojo aterriza en las palabras que venden. La secuencia se siente **una
producción**. Las transiciones son pocas, motivadas, en el beat y en la acción.
La música suena a la marca y al nicho, con **licencia limpia para pautar en
cualquier plataforma**. El creativo **pasa las políticas a la primera**. Y cada
campaña deja al sistema **más inteligente** que la anterior.
