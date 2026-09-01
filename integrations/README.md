# VideoForge — Integraciones ML reales

Reemplazo de los stubs 🟡 DEGRADED por integraciones reales. Cada script del
pipeline hace shell-out a un binario en el `PATH`; aquí viven esos binarios
(wrappers en `integrations/bin/`, symlinked a `~/.local/bin/`) y los helpers
Python que ejecutan cada modelo en su propio venv aislado.

## Máquina objetivo
MacBook Pro · **Apple M4** · 10 núcleos · **16 GB** memoria unificada · macOS 26.
Sin Homebrew y sin sudo: todo el toolchain está en `~/.local` (Node, ffmpeg,
Python 3.11, venvs).

## Toolchain base (sin sudo)
| Herramienta | Ubicación |
|---|---|
| Node.js 24.20.0 | `~/.local/opt/node-v24.20.0-darwin-arm64` → `~/.local/bin/node` |
| ffmpeg/ffprobe 9.0.1 | `~/.local/opt/ffmpeg` (static, evermeet.cx) → `~/.local/bin` |
| Python 3.11.16 | `~/.local/opt/python-3.11.16` (python-build-standalone) |
| venvs ML | `~/.local/opt/vf-venvs/{whisperx,mediapipe,chatterbox,acestep}` |

`~/.local/bin` está en el `PATH` vía `~/.zshrc` y `~/.zprofile`.

## Los cuatro modelos

| Modelo | Binario | Venv | Dónde corre | Estado |
|---|---|---|---|---|
| **WhisperX** | `whisperx` | `whisperx` | Local, **CPU int8** (CTranslate2 no usa Metal) | ✅ real |
| **MediaPipe** | `mediapipe` | `mediapipe` (**0.10.14**) | Local, CPU (solutions API) | ✅ real |
| **Chatterbox** | `chatterbox` | `chatterbox` | Local, **MPS** (fallback CPU) | ✅ real |
| **ACE-Step** | `ace-step` | `acestep` | **Nube** (HF Space, gradio_client) | ✅ real vía fallback |

### WhisperX — `integrations/bin/whisperx`
Wrapper que inyecta `--device cpu --compute_type int8 --threads 8` (Apple Silicon
no tiene CUDA y CTranslate2 no tiene backend Metal). El paquete pip `whisperx`
ya provee el CLI con la superficie que `transcribe.ts` espera.
- Diarización (`--diarize`): requiere libs compartidas de ffmpeg (torchcodec) +
  `HF_TOKEN` para pyannote. El core de transcripción no las necesita.

### MediaPipe — `integrations/bin/mediapipe` + `integrations/mediapipe_detect.py`
Detector de rostros (solutions FaceDetection, `model_selection=1`). Devuelve
`{faceBoxes,productBoxes}` normalizado 0..1. **Pinned a mediapipe 0.10.14**:
la 1.0.x fuerza un delegado Metal (GPU) que crashea en macOS headless
(`Check failed: service_ Service is unavailable`).
- `occlusion.ts::detectBoxes` fue reescrito para hacer el shell-out real y
  parsear las cajas (antes devolvía vacío). `productBoxes` queda vacío
  (sin detector de producto brand-agnóstico fiable); el solver lo trata como
  "sin restricción de producto".

### Chatterbox — `integrations/bin/chatterbox` + `integrations/chatterbox_tts.py`
Clona la voz de marca desde `brand.voice.samples[0]` con
`ChatterboxMultilingualTTS` (MPS, `PYTORCH_ENABLE_MPS_FALLBACK=1`), idioma `es`
por defecto. Mapea los flags de `voice.ts` (`--text --audio-prompt --language
--output`). **Gate legal:** `voice.ts` no genera sin `brand.voice.consent===true`.

### ACE-Step — `integrations/bin/ace-step` + `integrations/acestep_cloud.py`
Genera música original **paid-safe** vía el Space gratuito `ACE-Step/ACE-Step`
(endpoint `/__call__`), porque el modelo 3.5B no entra cómodo en 16 GB. Descarga
el audio (MP3) y **transcodifica a WAV PCM** con ffmpeg (lo que espera `music.ts`).
Override del Space con `VF_ACESTEP_SPACE`; `HF_TOKEN` opcional para más cuota.
- Degradación: si el Space falla, sale ≠0 y `music.ts` cae a su ruta documentada
  (track tipado, `ace-step-original`, paid-safe, archivo vacío).

## Config de render añadida
`remotion.config.ts` añade `resolve.extensionAlias` (`.js`→`.ts/.tsx`) para que
el bundler webpack de Remotion resuelva los import specifiers NodeNext del repo.
También se instalaron `@remotion/cli`, `@remotion/renderer`, `@remotion/bundler`
(faltaban en `package.json`; solo estaba `remotion`).

## Reinstalar en una máquina nueva
Los venvs y binarios viven fuera del repo (`~/.local`). Para recrearlos:
1. Node/ffmpeg/Python a `~/.local` (ver tabla arriba).
2. `python3.11 -m venv <venv>` por herramienta e instalar:
   `whisperx` · `mediapipe==0.10.14 opencv-python` · `chatterbox-tts` · `gradio_client`.
3. `chmod +x integrations/bin/*` y symlink a `~/.local/bin/`.
