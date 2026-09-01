#!/usr/bin/env python3
"""
ACE-Step (cloud fallback) helper for VideoForge (Module 7).

Local ACE-Step needs ~3.5B params of weights + VRAM that a 16 GB M-series Mac
can't comfortably hold, so per the hardware assessment we generate ORIGINAL,
paid-safe music via the free public ACE-Step HuggingFace Space instead.

music.ts shells out as:
  ace-step --prompt "tag, tag" --bpm N --duration 30 --output OUT.wav

This connects to the Space with gradio_client, introspects its API to stay
robust across Space revisions, drives the generation, and copies the returned
audio to OUT. On ANY failure it exits non-zero with a clear message so music.ts
degrades to its documented path (track stays typed & paid-safe, file empty).

Env:
  VF_ACESTEP_SPACE   Space id (default "ACE-Step/ACE-Step")
  HF_TOKEN           optional, for higher free-tier quota
"""
import argparse
import os
import shutil
import sys


def eprint(*a):
    print(*a, file=sys.stderr)


def _has_endpoint(api: dict, name: str) -> bool:
    return name in (api.get("named_endpoints", {}) or {})


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--prompt", required=True, help="comma-separated tags / style")
    ap.add_argument("--bpm", type=int, default=None)
    ap.add_argument("--duration", type=float, default=30.0)
    ap.add_argument("--lyrics", default="[inst]", help="instrumental by default")
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--infer-step", dest="infer_step", type=int, default=27,
                    help="diffusion steps; lower = faster (default 27)")
    ap.add_argument("--output", required=True)
    args = ap.parse_args()

    space = os.environ.get("VF_ACESTEP_SPACE", "ACE-Step/ACE-Step")

    try:
        from gradio_client import Client
    except Exception as e:
        eprint(f"ace-step: gradio_client import failed: {e}")
        return 4

    prompt = args.prompt
    if args.bpm:
        prompt = f"{prompt}, {args.bpm} bpm"

    try:
        token = os.environ.get("HF_TOKEN")
        client = Client(space, hf_token=token, verbose=False) if token \
            else Client(space, verbose=False)
    except Exception as e:
        eprint(f"ace-step: cannot connect to Space '{space}': {e}")
        return 5

    try:
        api = client.view_api(return_format="dict")
    except Exception as e:
        eprint(f"ace-step: view_api failed: {e}")
        api = {"named_endpoints": {}}

    # ACE-Step's clean text2music generator is the /__call__ endpoint:
    #   (audio_duration, prompt, lyrics, infer_step, ...) -> (audio, params_json)
    # Every parameter has a server-side default, so we only name the few we set
    # and let the rest default. Fall back to /text2music_process_func if needed.
    endpoint = "/__call__" if _has_endpoint(api, "/__call__") else None
    if endpoint is None:
        for cand in ("/text2music_process_func", "/text2music"):
            if _has_endpoint(api, cand):
                endpoint = cand
                break
    if endpoint is None:
        eprint("ace-step: no text2music endpoint (/__call__) found on Space")
        return 6
    eprint(f"ace-step: endpoint={endpoint} dur={args.duration}s "
           f"steps={args.infer_step} prompt='{prompt[:56]}'")

    try:
        result = client.predict(
            audio_duration=float(args.duration),
            prompt=prompt,
            lyrics=args.lyrics,
            infer_step=int(args.infer_step),
            manual_seeds=str(args.seed),
            api_name=endpoint,
        )
    except Exception as e:
        eprint(f"ace-step: generation call failed: {e}")
        return 7

    audio_path = _extract_audio(result)
    if not audio_path or not os.path.isfile(audio_path):
        eprint(f"ace-step: no audio file in result: {result!r}")
        return 8

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    # The Space returns MP3; music.ts expects a real WAV. Transcode to PCM WAV
    # with ffmpeg when the output asks for .wav and a transcoder is available;
    # otherwise copy the bytes through unchanged.
    want_wav = args.output.lower().endswith(".wav")
    is_wav = audio_path.lower().endswith(".wav")
    if want_wav and not is_wav and shutil.which("ffmpeg"):
        import subprocess
        try:
            subprocess.run(
                ["ffmpeg", "-hide_banner", "-loglevel", "error", "-y",
                 "-i", audio_path, "-ar", "48000", "-ac", "2",
                 "-c:a", "pcm_s16le", args.output],
                check=True)
            eprint(f"ace-step: wrote {args.output} (transcoded MP3→WAV)")
            return 0
        except Exception as e:
            eprint(f"ace-step: transcode failed ({e}); copying raw bytes")
    shutil.copyfile(audio_path, args.output)
    eprint(f"ace-step: wrote {args.output}")
    return 0


def _extract_audio(result):
    if result is None:
        return None
    if isinstance(result, str):
        return result
    if isinstance(result, dict):
        return result.get("path") or result.get("name") or result.get("value")
    if isinstance(result, (list, tuple)):
        for item in result:
            p = _extract_audio(item)
            if p and isinstance(p, str) and os.path.isfile(p):
                return p
    return None


if __name__ == "__main__":
    sys.exit(main())
