#!/usr/bin/env python3
"""
Chatterbox Multilingual TTS helper for VideoForge (Module 2.3).

voice.ts shells out as:
  chatterbox --text T --audio-prompt REF --language multilingual --output OUT.wav

This adapts that surface to the `chatterbox-tts` Python API, cloning the brand
voice from REF. Runs on Apple Silicon via MPS (with CPU fallback for any op
Metal doesn't implement), else CPU.

HARD RULE mirrored from the pipeline: this only ever runs when the caller has
already checked brand.voice.consent === true. This helper does not generate
without a reference sample.
"""
import argparse
import os
import sys


def eprint(*a):
    print(*a, file=sys.stderr)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", required=True)
    ap.add_argument("--audio-prompt", dest="audio_prompt", required=True)
    ap.add_argument("--language", default="multilingual",
                    help="mode passed by voice.ts; 'multilingual' uses the ML model")
    ap.add_argument("--language-id", dest="language_id", default=None,
                    help="ISO code for the multilingual model (default es)")
    ap.add_argument("--exaggeration", type=float, default=0.5)
    ap.add_argument("--cfg-weight", dest="cfg_weight", type=float, default=0.5)
    ap.add_argument("--output", required=True)
    args = ap.parse_args()

    if not os.path.isfile(args.audio_prompt):
        eprint(f"chatterbox: reference sample not found: {args.audio_prompt}")
        return 3

    # Let any op unsupported on MPS fall back to CPU rather than crashing.
    os.environ.setdefault("PYTORCH_ENABLE_MPS_FALLBACK", "1")

    try:
        import torch
        import torchaudio as ta
    except Exception as e:
        eprint(f"chatterbox: torch/torchaudio import failed: {e}")
        return 4

    device = "mps" if torch.backends.mps.is_available() else "cpu"
    eprint(f"chatterbox: device={device}")

    lang = args.language_id or ("es" if args.language in ("multilingual", "", None)
                                else args.language)

    # Prefer the multilingual model; fall back to the English-only class if the
    # installed build predates it.
    model = None
    sr = 24000
    try:
        from chatterbox.mtl_tts import ChatterboxMultilingualTTS
        model = ChatterboxMultilingualTTS.from_pretrained(device=device)
        sr = model.sr
        wav = model.generate(
            args.text,
            language_id=lang,
            audio_prompt_path=args.audio_prompt,
            exaggeration=args.exaggeration,
            cfg_weight=args.cfg_weight,
        )
    except ImportError:
        from chatterbox.tts import ChatterboxTTS
        model = ChatterboxTTS.from_pretrained(device=device)
        sr = model.sr
        wav = model.generate(
            args.text,
            audio_prompt_path=args.audio_prompt,
            exaggeration=args.exaggeration,
            cfg_weight=args.cfg_weight,
        )

    out = args.output
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    # wav is a torch tensor [1, N] (or [N]); normalise shape for torchaudio.save
    if hasattr(wav, "dim") and wav.dim() == 1:
        wav = wav.unsqueeze(0)
    ta.save(out, wav.detach().cpu(), sr)
    eprint(f"chatterbox: wrote {out} @ {sr} Hz (lang={lang})")
    return 0


if __name__ == "__main__":
    sys.exit(main())
