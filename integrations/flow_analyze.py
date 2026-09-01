#!/usr/bin/env python3
"""
Optical-flow motion analysis for VideoForge transition decisions.

Computes dominant motion direction + normalised magnitude over a time window of
a clip (Farneback dense flow, downscaled for speed). Emits an OpticalFlowSample:
  { "frame": int, "directionDeg": float (0=→, 90=↑), "magnitude": float 0..1 }

Usage:
  flow_analyze.py --video PATH [--start SEC] [--end SEC] [--fps 30] [--max-frames 24]
"""
import argparse, json, math, sys


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--start", type=float, default=0.0)
    ap.add_argument("--end", type=float, default=None)
    ap.add_argument("--fps", type=float, default=30.0)
    ap.add_argument("--max-frames", type=int, default=24)
    args = ap.parse_args()

    try:
        import cv2
        import numpy as np
    except Exception as e:
        print(json.dumps({"error": f"import: {e}"})); return 0

    cap = cv2.VideoCapture(args.video)
    if not cap.isOpened():
        print(json.dumps({"error": f"cannot open {args.video}"})); return 0

    vfps = cap.get(cv2.CAP_PROP_FPS) or args.fps
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    start_f = int(args.start * vfps)
    end_f = int(args.end * vfps) if args.end is not None else (total - 1)
    start_f = max(0, start_f); end_f = min(end_f, total - 1) if total else end_f
    if end_f <= start_f:
        end_f = start_f + 1

    n = min(args.max_frames, end_f - start_f)
    step = max(1, (end_f - start_f) // max(1, n))

    cap.set(cv2.CAP_PROP_POS_FRAMES, start_f)
    ok, prev = cap.read()
    if not ok:
        print(json.dumps({"error": "cannot read first frame"})); return 0
    # downscale for speed
    scale = 320.0 / max(1, prev.shape[1])
    def prep(img):
        g = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        return cv2.resize(g, (0, 0), fx=scale, fy=scale)
    prev_g = prep(prev)
    h = prev_g.shape[0]

    sum_dx = sum_dy = 0.0
    sum_mag = 0.0
    count = 0
    fidx = start_f
    for _ in range(n):
        fidx += step
        cap.set(cv2.CAP_PROP_POS_FRAMES, fidx)
        ok, frame = cap.read()
        if not ok or frame is None:
            break
        g = prep(frame)
        flow = cv2.calcOpticalFlowFarneback(prev_g, g, None,
                                            0.5, 3, 15, 3, 5, 1.2, 0)
        fx = float(np.mean(flow[..., 0]))
        fy = float(np.mean(flow[..., 1]))
        mag = float(np.mean(np.sqrt(flow[..., 0] ** 2 + flow[..., 1] ** 2)))
        sum_dx += fx; sum_dy += fy; sum_mag += mag; count += 1
        prev_g = g
    cap.release()

    if count == 0:
        print(json.dumps({"error": "no flow computed"})); return 0

    mean_dx = sum_dx / count
    mean_dy = sum_dy / count
    mean_mag = sum_mag / count
    # directionDeg: image y is down, so up = -dy. 0=→, 90=↑.
    direction = (math.degrees(math.atan2(-mean_dy, mean_dx)) + 360.0) % 360.0
    # normalise magnitude by ~10% of (downscaled) frame height, clamp 0..1
    norm_mag = max(0.0, min(1.0, mean_mag / (0.10 * h)))

    print(json.dumps({
        "frame": start_f,
        "directionDeg": round(direction, 1),
        "magnitude": round(norm_mag, 3),
        "rawMeanPx": round(mean_mag, 3),
        "meanDxDy": [round(mean_dx, 3), round(mean_dy, 3)],
        "framesAnalyzed": count,
    }))
    return 0


if __name__ == "__main__":
    sys.exit(main())
