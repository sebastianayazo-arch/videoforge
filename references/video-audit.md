# Auditor de videos — playbook + arquitectura (Módulo 13)

Un pase de QC con **auto-retroalimentación** sobre un ad renderizado: busca errores
visuales, de copy, de edición/ritmo, de CTA y de audio, los puntúa y propone la
corrección. Herramienta: `integrations/video_audit.py` (wrapper `integrations/bin/video-audit`).

## Idea central: es *plan-aware*
A diferencia de un crítico de video genérico, el auditor recibe el render **y** el
`video-plan.json` que lo produjo. Así audita **lo intencionado vs lo real** (¿el render
mantuvo el hook, el CTA, el precio, las duraciones?) además de la calidad de señal. El
plan es la verdad de referencia (sabemos el copy, los cortes, el precio) — más potente y
con menos alucinación que juzgar el pixel a ciegas.

## Arquitectura (multi-pase, determinista primero)
Confirmada por la literatura de *LLM-as-judge* (G-Eval, Self-Refine, Reflexion): las
métricas deterministas se calculan primero y **alimentan** al VLM como contexto medido;
el VLM razona sobre frames **y** números, no adivina medidas.

1. **Estructura / ritmo** (del plan): hook en los primeros 3s, largo del hook, CTA al
   cierre, precio legible ≥2s, duración total, largos de escena, aire muerto, compliance.
2. **Audio** (ffmpeg): LUFS integrado + true-peak (−14/−1), `silencedetect` (aire muerto),
   balance voz-vs-música (ventanas de escena vs tapa music-only).
3. **Señal de video** (ffprobe/ffmpeg/cv2): dims/fps/pixfmt, `blackdetect`, `freezedetect`
   (suprimido en la tapa estática), nitidez por escena (varianza de Laplaciano, marca la
   escena blanda atípica), `cropdetect`.
4. **Layout** (cv2 + mediapipe): safe-zones de Reels (top 220 / bottom 420 / lados) y
   **texto sobre la cara** (solape de área ≥15% con el rostro detectado).
5. **VLM (opcional, pluggable)**: crítica visual/copy/marca sobre frames muestreados
   (hook sobre-muestreado + medio de cada escena + tapa), alimentada con las métricas.

**Salida**: findings `{dimension, severity(error/warn/info), atSec, scene, title, detail, fix}`,
score por dimensión (penalización por severidad), score global, y reporte markdown.
Cada finding trae un **fix accionable** que mapea a las palancas de `compose.ts`.

## Uso
```bash
integrations/bin/video-audit --video work/salomeN/render/master.mp4 \
  --plan work/salomeN/video-plan.json --out audit.json --md audit.md --vlm frames
```
Sin backend VLM corre igual (solo determinista) y dice cómo activarlo.

## Backend VLM (una interfaz OpenAI-compatible, varios backends)
Se elige apuntando `VF_VLM_BASE_URL`. Recomendación de la investigación (sep-2026):

| Backend | Modelo | Coste | Nativo local (M4 16GB) | Cuándo |
|---|---|---|---|---|
| **Ollama (default)** | `qwen3-vl:8b` (6.1 GB) | **gratis, privado** | **sí** (`ollama run qwen3-vl:8b`) | dev loop, footage sensible de cliente |
| OpenRouter | `qwen/qwen3-vl-8b` · `google/gemini-2.5-flash` | ~$0.12–0.30 /M in | no | calidad/escala en cloud barato |
| Gemini 2.5 Flash | video nativo | $0.30/$2.50 /M (≈ sub-céntimo/ad) | no | primer pase masivo de biblioteca |
| Claude Opus/Sonnet | frames (tool-use JSON) | $/frame alto | no | juicio visual fino de marca |

Env: `VF_VLM_BASE_URL` (default `http://localhost:11434/v1`), `VF_VLM_MODEL`
(`qwen3-vl:8b`), `VF_VLM_API_KEY` (`ollama`). Se mandan **frames** (portable a todos;
mejor para legibilidad/CTA/color); el hook (primeros 3s) va sobre-muestreado.

**Sesgo clave a evitar (self-enhancement):** el modelo que **juzga** no debe ser el mismo
que **genera** el copy/video del loop — usar un VLM distinto (o un panel) como señal
externa. Los checks deterministas son la ancla honesta del loop.

## Loop de auto-corrección (audit → fix → re-render)
Patrón Self-Refine + memoria Reflexion:
1. Auditar → findings con fix.
2. Aplicar los fixes que mapean a palancas de `compose.ts` (bajar `anchor.y`, extender el
   bloque de precio, recortar escena larga, re-duckear música, etc.).
3. Re-renderizar → re-auditar. **Parar** cuando no queden errores/críticos, el score se
   estanque, o a las 3 iteraciones (tope). Arrastrar los findings previos para no repetir.

## ¿Comprar en vez de construir? No (survey sep-2026)
No hay API asequible y self-serve que haga QC holístico de short-form sobre un archivo:
**CreativeX** (CQS de ~21 elementos, pre-flight) es el producto más parecido pero es
enterprise (CPG, 6–12 semanas). **VidMob** (Scoring External Assets) y **Neurons Predict**
(atención/saliencia, API documentada) y **Memorable** (KPIs predichos) son integrables
pero *sales-gated*, 4–5 cifras/año. **Meta `quality_ranking`** y analytics de TikTok son
**post-lanzamiento** (no juzgan el archivo antes del gasto) — útiles como loop posterior.
La capa de **crítica de copy/CTA/ritmo no existe off-the-shelf** → es nuestro diferencial.

## Estado / pendientes
- v1 determinista: **operativo** (estructura, audio, video, layout). Probado en la 3003 →
  93/100, detectó copy pegado a la safe-zone superior.
- VLM: cableado y con degradación limpia; **activar** levantando Ollama o fijando base_url.
- Pendiente: OCR (PaddleOCR/Tesseract) para verificar texto quemado vs plan; panel
  multi-modelo; cierre del loop automático contra `compose.ts`.

### Fuentes (selección)
- LLM-as-judge: G-Eval (confident-ai), Self-Refine (arXiv 2303.17651), Reflexion (2303.11366).
- Determinista: ffmpeg filters (blackdetect/freezedetect/blurdetect/scdet/ebur128/silencedetect),
  OpenCV Laplaciano, WCAG contrast, PySceneDetect, WhisperX.
- VLM: Qwen3-VL (ollama/mlx), Gemini 2.5 Flash video, structured outputs (OpenAI/Gemini/Claude).
- Safe-zones Reels/TikTok; encuesta de productos (CreativeX/VidMob/Neurons/Memorable).
