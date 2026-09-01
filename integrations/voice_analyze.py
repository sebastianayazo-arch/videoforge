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

TARGET_WPS = (2.5, 3.3)
TARGET_SILENCE_MAX = 0.15
TARGET_PITCH_STD = (18.0, 45.0)
CADENCE_MATCH_MAX_DELTA = 0.6


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
    args = ap.parse_args()

    try:
        m = _metrics(args.audio, args.words)
    except Exception as e:
        print(json.dumps({"error": f"{type(e).__name__}: {e}"}))
        return 0

    flags = []
    if m["wordsPerSec"] < TARGET_WPS[0]:
        flags.append(f"too slow ({m['wordsPerSec']} w/s < {TARGET_WPS[0]}); speed up (atempo) or lower cfg_weight")
    if m["wordsPerSec"] > TARGET_WPS[1]:
        flags.append(f"too fast ({m['wordsPerSec']} w/s > {TARGET_WPS[1]}); rushed")
    if m["silenceRatio"] > TARGET_SILENCE_MAX:
        flags.append(f"too much silence ({int(m['silenceRatio']*100)}% > {int(TARGET_SILENCE_MAX*100)}%); trim / silenceremove")
    if m["pitchStdHz"] > TARGET_PITCH_STD[1]:
        flags.append(f"over-dramatic pitch (std {m['pitchStdHz']} > {TARGET_PITCH_STD[1]}); lower exaggeration")
    if m["pitchStdHz"] < TARGET_PITCH_STD[0] and m["pitchStdHz"] > 0:
        flags.append(f"flat/monotone (std {m['pitchStdHz']} < {TARGET_PITCH_STD[0]}); raise exaggeration")

    out = {"metrics": m, "targets": {"wordsPerSec": TARGET_WPS, "silenceRatioMax": TARGET_SILENCE_MAX, "pitchStdHz": TARGET_PITCH_STD}}

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
