#!/usr/bin/env python3
"""
Voice QC for VideoForge marketing VO (Módulo 2.3).

Measures a voice-over against the marketing-voice playbook
(references/voice/marketing-voice.md): speaking rate (words/s + WPM), pitch
(median + variation), and silence ratio; optionally compares cadence against a
reference clip (e.g. the on-camera model's recorded voice) so the VO matches.

Usage:
  voice_analyze.py --audio VO.wav --words 5 [--ref MODEL.wav --ref-words 30]
Outputs JSON to stdout with metrics + flags vs targets.

Targets (short-form marketing): 2.5–3.3 words/s (150–200 WPM), silence < 15%,
pitch-std 20–45 Hz (>60 = over-dramatic), |Δwords/s vs reference| < 0.6.
"""
import argparse, json, sys

# Narration: steady pace, moderate intonation. Hook (a question / relatable
# situation): allowed to breathe (slower, emphatic) and carry MORE intonation to
# imply the question and set up the problem→solution.
TARGETS = {
    "narration": {"wps": (2.5, 3.3), "silence": 0.15, "pitch_std": (18.0, 45.0)},
    "hook": {"wps": (1.9, 3.0), "silence": 0.20, "pitch_std": (28.0, 75.0)},
}
CADENCE_MATCH_MAX_DELTA = 0.7


def _metrics(path, words):
    import librosa
    import numpy as np
    y, sr = librosa.load(path, sr=24000)
    yt, _ = librosa.effects.trim(y, top_db=30)
    dur = len(yt) / sr if sr else 0.0
    f0, vflag, _ = librosa.pyin(yt, fmin=80, fmax=400, sr=sr)
    f0v = f0[~np.isnan(f0)]
    med = float(np.median(f0v)) if len(f0v) else 0.0
    std = float(np.std(f0v)) if len(f0v) else 0.0
    # Silence = actual low-energy gaps (real pauses), NOT unvoiced consonants —
    # measure the non-silent intervals by energy and subtract from total.
    intervals = librosa.effects.split(yt, top_db=32)
    speech = int(sum(b - a for a, b in intervals)) if len(intervals) else 0
    silence_ratio = 1.0 - (speech / len(yt)) if len(yt) else 0.0
    wps = (words / dur) if dur > 0 else 0.0
    return {
        "durationSec": round(dur, 2),
        "words": words,
        "wordsPerSec": round(wps, 2),
        "wpm": round(wps * 60, 0),
        "pitchMedianHz": round(med, 1),
        "pitchStdHz": round(std, 1),
        "silenceRatio": round(silence_ratio, 2),
    }


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--audio", required=True)
    ap.add_argument("--words", type=int, required=True)
    ap.add_argument("--ref", default=None, help="reference clip (model's voice)")
    ap.add_argument("--ref-words", dest="ref_words", type=int, default=None)
    ap.add_argument("--mode", choices=["narration", "hook"], default="narration")
    args = ap.parse_args()

    T = TARGETS[args.mode]
    WPS, SIL, PSTD = T["wps"], T["silence"], T["pitch_std"]

    try:
        m = _metrics(args.audio, args.words)
    except Exception as e:
        print(json.dumps({"error": f"{type(e).__name__}: {e}"}))
        return 0

    flags = []
    if m["wordsPerSec"] < WPS[0]:
        flags.append(f"too slow ({m['wordsPerSec']} w/s < {WPS[0]}); speed up (atempo) or lower cfg_weight")
    if m["wordsPerSec"] > WPS[1]:
        flags.append(f"too fast ({m['wordsPerSec']} w/s > {WPS[1]}); rushed — a hook should breathe")
    if m["silenceRatio"] > SIL:
        flags.append(f"too much silence ({int(m['silenceRatio']*100)}% > {int(SIL*100)}%); trim / silenceremove")
    if m["pitchStdHz"] > PSTD[1]:
        flags.append(f"over-dramatic pitch (std {m['pitchStdHz']} > {PSTD[1]}); lower exaggeration")
    if m["pitchStdHz"] < PSTD[0] and m["pitchStdHz"] > 0:
        flags.append(f"flat/monotone (std {m['pitchStdHz']} < {PSTD[0]}); raise exaggeration / more intonation")

    out = {"mode": args.mode, "metrics": m, "targets": {"wordsPerSec": WPS, "silenceRatioMax": SIL, "pitchStdHz": PSTD}}

    if args.ref and args.ref_words:
        try:
            r = _metrics(args.ref, args.ref_words)
            out["reference"] = r
            d_wps = round(m["wordsPerSec"] - r["wordsPerSec"], 2)
            d_pitch = round(m["pitchMedianHz"] - r["pitchMedianHz"], 1)
            out["cadenceMatch"] = {"deltaWordsPerSec": d_wps, "deltaPitchHz": d_pitch}
            if abs(d_wps) > CADENCE_MATCH_MAX_DELTA:
                flags.append(f"cadence mismatch vs model (Δ{d_wps} w/s > {CADENCE_MATCH_MAX_DELTA}); match the model's pace")
            if abs(d_pitch) > 60:
                flags.append(f"pitch far from model (Δ{d_pitch} Hz); likely a different voice/register")
        except Exception as e:
            out["referenceError"] = str(e)

    out["flags"] = flags
    out["pass"] = len(flags) == 0
    print(json.dumps(out, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
