#!/usr/bin/env python3
"""
MediaPipe face detector for VideoForge occlusion (Module 3.4).

Uses the MediaPipe Tasks API (FaceDetector / BlazeFace). Samples frames across a
time/frame span of a video (or a single --image) and returns normalised face
bounding boxes so `solveCaptionAnchor` can place captions clear of faces.

Output (stdout): JSON { "faceBoxes": [{x,y,w,h}...], "productBoxes": [] }
Coordinates normalised 0..1 against frame width/height, matching the TypeScript
`BoundingBox` contract in src/types.ts.

Product detection is intentionally empty (no reliable brand-agnostic product
detector); the occlusion solver treats empty productBoxes as "no constraint".

Usage:
  mediapipe_detect.py --image PATH [--min-confidence 0.5]
  mediapipe_detect.py --video PATH [--start-frame N --end-frame M | --start S --end E]
                      [--samples 5] [--min-confidence 0.5]

Degrades cleanly: prints JSON with an "error" key and empty boxes (exit 0) if it
can't read input, so the caller keeps the preferred anchor instead of crashing.
"""
import argparse
import json
import os
import sys

def eprint(*a):
    print(*a, file=sys.stderr)


def _clamp01(v):
    return max(0.0, min(1.0, v))


def _boxes_from_detections(detections):
    """MediaPipe solutions FaceDetection → normalised {x,y,w,h} boxes."""
    out = []
    for det in detections or []:
        rbb = det.location_data.relative_bounding_box
        x, y = _clamp01(rbb.xmin), _clamp01(rbb.ymin)
        w, h = _clamp01(rbb.width), _clamp01(rbb.height)
        if w <= 0 or h <= 0:
            continue
        out.append({"x": round(x, 5), "y": round(y, 5),
                    "w": round(w, 5), "h": round(h, 5)})
    return out


def run_image(path, min_conf):
    import cv2
    import mediapipe as mp
    bgr = cv2.imread(path)
    if bgr is None:
        return None
    rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
    # model_selection=1 = full-range model (faces at varied distances).
    with mp.solutions.face_detection.FaceDetection(
            model_selection=1, min_detection_confidence=min_conf) as fd:
        res = fd.process(rgb)
        return _boxes_from_detections(getattr(res, "detections", None))


def run_video(path, start_f, end_f, samples, min_conf):
    import cv2
    import mediapipe as mp
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        return None, []
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    if start_f is None:
        start_f = 0
    if end_f is None:
        end_f = max(total - 1, start_f)
    start_f = max(0, start_f)
    end_f = max(start_f, end_f)
    if total > 0:
        end_f = min(end_f, total - 1)
    n = max(1, samples)
    if end_f > start_f:
        step = (end_f - start_f) / float(n)
        frame_ids = [int(start_f + i * step) for i in range(n)]
    else:
        frame_ids = [start_f]

    boxes = []
    with mp.solutions.face_detection.FaceDetection(
            model_selection=1, min_detection_confidence=min_conf) as fd:
        for fid in frame_ids:
            cap.set(cv2.CAP_PROP_POS_FRAMES, fid)
            ok, frame = cap.read()
            if not ok or frame is None:
                continue
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            res = fd.process(rgb)
            boxes.extend(_boxes_from_detections(getattr(res, "detections", None)))
    cap.release()
    return boxes, frame_ids


def _iou(a, b):
    ax2, ay2 = a["x"] + a["w"], a["y"] + a["h"]
    bx2, by2 = b["x"] + b["w"], b["y"] + b["h"]
    ix = max(0.0, min(ax2, bx2) - max(a["x"], b["x"]))
    iy = max(0.0, min(ay2, by2) - max(a["y"], b["y"]))
    inter = ix * iy
    if inter <= 0:
        return 0.0
    ua = a["w"] * a["h"] + b["w"] * b["h"] - inter
    return inter / ua if ua > 0 else 0.0


def _union(a, b):
    x = min(a["x"], b["x"])
    y = min(a["y"], b["y"])
    x2 = max(a["x"] + a["w"], b["x"] + b["w"])
    y2 = max(a["y"] + a["h"], b["y"] + b["h"])
    return {"x": round(x, 5), "y": round(y, 5),
            "w": round(x2 - x, 5), "h": round(y2 - y, 5)}


def _merge(boxes, iou_thresh=0.3):
    clusters = []
    for box in boxes:
        placed = False
        for i, c in enumerate(clusters):
            if _iou(c, box) >= iou_thresh:
                clusters[i] = _union(c, box)
                placed = True
                break
        if not placed:
            clusters.append(box)
    return clusters


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", default=None)
    ap.add_argument("--image", default=None)
    ap.add_argument("--start-frame", type=int, default=None)
    ap.add_argument("--end-frame", type=int, default=None)
    ap.add_argument("--start", type=float, default=None)
    ap.add_argument("--end", type=float, default=None)
    ap.add_argument("--fps", type=float, default=30.0)
    ap.add_argument("--samples", type=int, default=5)
    ap.add_argument("--min-confidence", type=float, default=0.5)
    args = ap.parse_args()

    empty = {"faceBoxes": [], "productBoxes": []}
    try:
        if args.image:
            boxes = run_image(args.image, args.min_confidence)
            if boxes is None:
                print(json.dumps({**empty, "error": f"cannot read image {args.image}"}))
                return 0
            merged = _merge(boxes)
            print(json.dumps({"faceBoxes": merged, "productBoxes": [],
                              "rawDetections": len(boxes)}))
            return 0

        if not args.video:
            print(json.dumps({**empty, "error": "need --image or --video"}))
            return 0

        # frame span from seconds if provided
        sf = args.start_frame
        ef = args.end_frame
        if args.start is not None:
            sf = int(args.start * args.fps)
        if args.end is not None:
            ef = int(args.end * args.fps)
        boxes, frame_ids = run_video(args.video, sf, ef, args.samples, args.min_confidence)
        if boxes is None:
            print(json.dumps({**empty, "error": f"cannot open {args.video}"}))
            return 0
        merged = _merge(boxes)
        print(json.dumps({"faceBoxes": merged, "productBoxes": [],
                          "sampledFrames": frame_ids, "rawDetections": len(boxes)}))
        return 0
    except Exception as e:
        print(json.dumps({**empty, "error": f"{type(e).__name__}: {e}"}))
        return 0


if __name__ == "__main__":
    sys.exit(main())
