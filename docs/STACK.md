# VideoForge — STACK (Fase 0.2)

> Skills, MCPs y herramientas con **licencia verificada**. La columna
> "Publicable en pauta" es la que manda: una herramienta puede ser excelente y
> aún así estar **prohibida** para output que se publica/pauta por su licencia.
> Re‑verificar licencias en cada Fase 0 (las licencias cambian de versión).

## Leyenda
- **Publicable en pauta = SÍ**: la licencia permite uso comercial del *output*
  sin restricción incompatible con ads.
- **NO**: prohibido para output publicado/pautado (aunque sirva para prototipar).

---

## 0. Skills / plugins de Claude Code

| Herramienta | Rol | Licencia | Publicable |
|---|---|---|---|
| **Skill oficial de Remotion** | Enseña `useCurrentFrame`, `interpolate`, `spring`, `<Sequence>` — se instala **primero** | Doc/skill oficial | SÍ (es guía) |
| **Claude‑Code‑Video‑Toolkit** (wilwaldon) | Utilidades de video para Claude Code | Verificar en repo | Referencia |
| **OpenMontage** (calesthio) | Montaje asistido | Verificar en repo | Referencia |
| **Vanta** (itsjwill) | Referencia de captions WhisperX, transiciones, voz | Verificar en repo | Referencia |

> Estos plugins son **referencia de arquitectura**; su licencia se verifica en el
> repo de cada uno antes de copiar código a producción.

## 1. Remotion y librerías de render

| Paquete | Rol | Licencia | Publicable |
|---|---|---|---|
| `remotion`, `@remotion/*` | Motor de composición React→video | **Remotion License** (gratis para individuos y equipos pequeños; **empresas grandes requieren licencia de compañía**) | SÍ, con licencia correcta según tamaño de empresa |
| `remotion-dev/template-tiktok` | Plantilla base 9:16 | Remotion License | SÍ |
| `@remotion/captions` | Tipos y utilidades de captions | Remotion License | SÍ |
| `@remotion/transitions` | Transiciones + custom (luma mattes, máscaras, speed ramps) | Remotion License | SÍ |

> ⚠️ **Remotion NO es MIT.** Verificar el tramo de licencia por tamaño de la
> empresa del cliente antes de facturar output comercial.

## 2. Transcripción y visión

| Herramienta | Rol | Licencia | Publicable |
|---|---|---|---|
| **WhisperX** | Timestamps por palabra + diarización | BSD‑4‑Clause (usa faster‑whisper/CTranslate2 MIT; **modelos** Whisper MIT) | SÍ |
| **whisper.cpp** | Alternativa local | MIT | SÍ |
| **MediaPipe** | Rostro, pose, landmarks | Apache‑2.0 | SÍ |
| **OpenCV** | Optical flow, movimiento, histogramas | Apache‑2.0 (4.x) | SÍ |
| **mcp‑video‑analyzer** | Análisis de referentes | Verificar en repo | Herramienta de análisis |
| **yt‑dlp** | Descarga de referencias | Unlicense | Herramienta (respetar ToS al scrapear) |

## 3. Voz (TTS / clonación) — **el gate más delicado**

| Motor | Rol | Licencia | Publicable en pauta |
|---|---|---|---|
| **Chatterbox Multilingual** | **Primaria** — español, watermark | **MIT** | ✅ **SÍ** |
| **Qwen3‑TTS** | Alternativa | Apache‑2.0 | ✅ SÍ |
| **Fish Speech** | Alternativa | Apache‑2.0 | ✅ SÍ |
| **XTTS‑v2** | — | **CPML (Coqui Public Model License, no comercial)** | ⛔ **PROHIBIDO** |
| **F5‑TTS** | — | **CC‑BY‑NC (no comercial)** | ⛔ **PROHIBIDO** |

> El código de `scripts/voice.ts` **solo** acepta `engine ∈ {chatterbox, qwen3-tts,
> fish-speech}` y exige `brand.voice.consent === true`.

## 4. Limpieza de voz

| Herramienta | Rol | Licencia | Publicable |
|---|---|---|---|
| **DeepFilterNet** | Denoise neuronal | MIT/Apache‑2.0 (dual) | SÍ |
| **RNNoise** | Denoise clásico | BSD‑3‑Clause | SÍ |
| **FFmpeg** | Cadena EQ/compresión/de‑esser | LGPL‑2.1+/GPL según build | SÍ (usar build LGPL para evitar copyleft en distribución) |

## 5. Música

| Herramienta | Rol | Licencia | Publicable en pauta |
|---|---|---|---|
| **ACE‑Step** | Generación por tags (género/mood/instrumentación/BPM) | Apache‑2.0 (código y pesos) | ✅ **SÍ** (output original) |
| **librosa** | Beats, BPM, energía | ISC | SÍ (análisis) |
| Bibliotecas libres multi‑plataforma | Fallback | Por‑pista (verificar) | Solo si la licencia es multi‑plataforma verificada |
| **MusicGen** | — | Pesos **CC‑BY‑NC** | ⛔ **PROHIBIDO** para publicar |
| TikTok CML / Meta Sound Collection / YT Audio Library | — | Por‑plataforma | ⛔ para cross‑platform / pauta (ver RESEARCH §5) |

## 6. Color, estabilización, contenedor

| Herramienta | Rol | Licencia | Publicable |
|---|---|---|---|
| **FFmpeg** `lut3d`/`colorchannelmixer`/`curves` | Match, grade, LUT de marca | LGPL/GPL | SÍ |
| **FFmpeg** `vidstabdetect`/`vidstabtransform` | Estabilización 2‑pasos | (vid.stab GPL → build con `--enable-gpl`) | SÍ (respetar GPL en distribución del binario) |
| **ffprobe** | Metadatos, rotación explícita, streams | LGPL/GPL | SÍ |

> Nota FFmpeg: `vidstab` requiere build **GPL**. Mantener separado el pipeline
> de estabilización si el resto usa build LGPL, o documentar el uso GPL.

---

## Matriz de "prohibidos para publicar" (resumen ejecutable)

Estos NO entran a ningún output con `pauta = sí`:

- **Voz:** XTTS‑v2 (CPML), F5‑TTS (CC‑BY‑NC).
- **Música:** MusicGen (CC‑BY‑NC); sonidos generales de plataforma; librerías
  comerciales por‑plataforma usadas cross‑platform (CML/Meta/YT).
- **SFX:** pings reales de apps y meme sounds (marca registrada / sin licencia)
  → se generan **originales** con el mismo mecanismo psicológico.

El cumplimiento está en código: `scripts/voice.ts` (allowlist de motores),
`scripts/music.ts::assertPaidSafe()`, y el registro por‑pista en `report.md`.
