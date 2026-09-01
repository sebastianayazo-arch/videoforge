# Voice samples — Silueta

This folder holds the **reference recordings** used to clone the brand voice
(Module 9A / `BrandVoiceProfile.samples`). The engine of record is
**`chatterbox`** — `XTTS-v2` and `F5-TTS` are **forbidden for publish**.

## What goes here

Short, clean recordings of the **authorised** brand voice talent, one WAV per
register. Each file must be referenced in `brand-profile.json → voice.samples`
with a `note` describing the register.

Current samples:

| File | Register | Use |
| --- | --- | --- |
| `carolina-neutral-01.wav` | Neutro conversacional | Base de clonación, narración general |
| `carolina-energetica-02.wav` | Energético | Ganchos, `oferta-urgencia`, `lanzamiento` |
| `carolina-calida-03.wav` | Cálido / íntimo | `ugc-testimonio`, cierres, end card |

### Recording spec
- Mono WAV, 48 kHz / 24-bit, sin música ni ruido de fondo.
- 15–30 s de habla continua por muestra; frases naturales, no lista de palabras.
- Sin compresión agresiva ni reverb; sala tratada o manta.
- Español de Colombia (mercado `CO`), tuteo.

## Consent requirement (hard gate)

`voice.consent` **must be `true`** with a `voice.consentDate` before ANY cloned
narration is generated. The signed consent authorises cloning this specific
voice for Silueta content. No consent on file ⇒ the pipeline falls back to
**recorded** VO only and blocks any `vo.source: "cloned"` scene.

The `.wav` files themselves are **git-ignored** (media never lives in the repo);
only this README and the JSON references are tracked. Store the masters and the
signed consent PDF in the brand's secured asset drive.
