# Voz para marketing — playbook (Módulo 2.3 / VO)

Cómo se trabaja la voz (grabada y clonada) para ads short-form. Aplica al hook,
la narración y el CTA. La voz debe sentirse **nativa del edit**, no locución de
stock. Fuentes al final.

## 1. Ritmo / cadencia (lo más medible)
- **Conversacional:** ~150 WPM (~2.5 palabras/s). **Alta energía / comercial:**
  ~180 WPM (~3.0 pal/s). Los ads de audio rinden mejor a paso **moderado-rápido**,
  no atropellado.
- **Short-form (Reels/TikTok):** creadoras reales hablan **~180–200 WPM
  (~3.0–3.3 pal/s)** — ágil y "nativo". Guion de 30s ≈ 70–80 palabras.
- **Regla de oro:** la voz en off debe **empatar la cadencia de la modelo** en
  pantalla (medir y alinear). Un desajuste (VO lenta vs modelo ágil) rompe el flujo.
- **Silencio interno < 15%.** Pausas sí, pero **intencionales** (tras el hook y
  tras un punto clave, para que "aterrice"); nada de dead-air que rompa el ritmo.

## 2. Tono / expresividad
- **Cálido y conversacional con "smile in the voice"** (se oye la sonrisa),
  entusiasmo contenido, cercano y creíble. Para Salomé: audaz/sensual pero cálido.
- **Variación de tono expresiva pero no sobre-actuada.** Guía medible: desviación
  de pitch **~20–45 Hz** es natural; **>60 Hz = dramática/artificial** (típico de
  TTS con exaggeration alto).
- **Énfasis** en: palabra-beneficio, nombre de producto/marca y el CTA. Inflexión
  para conectar, no monótono.

## 3. Arco emocional (estructura)
- **Hook (primeros 1.5–3s):** decide la retención (thumb-stop). Arranca con
  **curiosidad / pattern-interrupt**, ágil. Ganar los 3s ≈ +62% completion, −54% CPM.
- **Medio:** práctico, específico, muestra el beneficio/feature.
- **Cierre/CTA:** **confiado**, claro, sin sonar "a comercial".
- Narrativa antes/después (storytime) conecta emocionalmente > pitch de ventas.

## 4. Autenticidad UGC
- Primera persona, uso cotidiano, testimonio genuino **superan** a la locución
  pulida. 92% confía más en UGC. La voz debe sonar de alguien real, no narrador.

## 5. Mezcla / loudness
- Master integrado **−14 LUFS**, true-peak ≤ −1 dBTP.
- **VO por encima de la cama musical** (~9–12 dB); **duckear** la música bajo la voz.
- **Comprimir** la voz grabada de la modelo (ratio ~3–4:1) para nivelar los
  momentos fuertes/saltos.

## 6. Cómo lograrlo con la voz clonada (Chatterbox)
| Objetivo | Parámetro |
|---|---|
| Natural con energía (default) | `exaggeration` 0.5–0.6 |
| Evitar sobre-dramatismo | `exaggeration` ≤ 0.6 (0.75+ = actuado) |
| Pacing tight/ágil | `cfg_weight` 0.5–0.65 (bajo <0.4 = arrastra) |
| Empatar cadencia de modelo | medir con `voice_analyze.py`, ajustar `atempo` |
| Sin dead-air | `silenceremove` + trim; luego cleanup chain (−16 LUFS stem) |
| Muestra de referencia | usar toma **conversacional larga** de la locutora (mejor clon) |

## 7. QC de voz (herramienta)
`integrations/voice_analyze.py` mide un VO: **palabras/s (WPM)**, **pitch mediano
+ variación**, **% de silencio real (por energía)**, y **compara contra una
referencia** (la voz de la modelo). Targets por `--mode`:
- **narration** (por defecto): 2.5–3.3 pal/s, silencio <15%, pitch-std 20–45 Hz.
- **hook** (pregunta / situación relatable): puede **respirar** (1.9–3.0 pal/s) y
  llevar **más entonación** (pitch-std 28–75 Hz) para implicar la pregunta y armar
  el problema→solución. NO aplanar ni acelerar de más un hook.
- Cadencia: |Δpal/s vs modelo| < ~0.7.

**Aprendizaje clave:** para un hook, generar varios takes y elegir con la
herramienta; NO usar `silenceremove`/`atempo` agresivos — matan las pausas y la
entonación de pregunta. Preferir un `exaggeration` alto (~0.75) + solo cleanup.

---
### Fuentes
- [WARC — speech delivery speed in audio ads](https://www.warc.com/newsandopinion/news/how-speech-delivery-speed-impacts-audio-ads/en-gb/43304)
- [Bunny Studio — voiceover WPM](https://bunnystudio.com/blog/voiceover-words-per-minute-choosing-the-ideal-information-rate/)
- [The Remnant Agency — 150-word rule](https://www.theremnantagency.com/60-second-radio-ad-word-count-benchmarks/)
- [618media — voiceover techniques for YouTube ads](https://618media.com/en/blog/voiceover-techniques-for-youtube-ads/)
- [WellSaid Labs — voiceover in advertising](https://www.wellsaid.io/resources/blog/voiceover-in-advertising-how-advertisers-can-capitalize-on-this-3b-industry)
- [Narrationbox — AI voice styles for short-form](https://narrationbox.com/blog/best-ai-voice-styles-for-viral-short-form-videos)
- [DansUGC — UGC hook formulas](https://dansugc.com/blog/ugc-hooks-tiktok-ads-formulas)
</content>
