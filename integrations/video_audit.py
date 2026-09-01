#!/usr/bin/env python3
"""
VideoForge — Video Ad Auditor (Módulo 13).

A self-feedback QC pass over a rendered short-form ad. It is PLAN-AWARE: given the
rendered mp4 AND the video-plan.json that produced it, it audits *actual vs intended*
(did the render keep the hook, the CTA, the price, the shot lengths?) on top of
independent signal-quality checks — which is stronger than a generic video critic.

Layers (deterministic backbone; a VLM pass plugs in on top):
  1. structure/pacing  — hook, CTA, price, shot lengths, dead-air, compliance   (plan)
  2. audio             — LUFS/true-peak, dead-air, voice-vs-music balance       (ffmpeg)
  3. video signal      — dims/fps/pixfmt, black/freeze, per-scene sharpness      (ffmpeg/cv2)
  4. layout            — text safe-zones + text-over-face overlap                (cv2/mediapipe)
  5. vlm (optional)    — visual/copy/brand critique via a vision model           (pluggable)

Output: structured findings [{dimension, severity, atSec, scene, title, detail, fix}],
per-dimension scores, an overall grade, and a markdown report. Findings map back to
compose.ts levers so the loop can correct the video.

Usage:
  video_audit.py --video OUT.mp4 --plan video-plan.json [--out report.json]
                 [--md report.md] [--vlm none|frames] [--audio VO.wav]
"""
from __future__ import annotations
import argparse, json, subprocess, sys, os, tempfile, math, re

# ---- severity / scoring ------------------------------------------------------
SEV = {"info": 0, "warn": 1, "error": 2}
SEV_PENALTY = {"info": 0, "warn": 8, "error": 22}

# Reels/TikTok UI safe zones (px on a 1080x1920 canvas). Top: caption/handle;
# bottom: CTA/caption/menu; right: like/share/audio rail. Keep hero copy inside.
SAFE = {"top": 220, "bottom": 420, "left": 60, "right": 100}
# Loudness targets (short-form master).
LUFS_TARGET, LUFS_WARN, LUFS_ERR = -14.0, 1.0, 2.5
TP_MAX = -1.0
# Font role -> approx rendered line height in px, calibrated against actual AdCopy
# renders (a 3-line xl block ≈ 340px tall → ~113px/line). Used to estimate a copy
# block's on-screen box for safe-zone and text-over-subject checks.
FONT_PX = {"sm": 40, "md": 54, "lg": 72, "xl": 95}
LINE_FACTOR = 1.2      # line-to-line spacing multiplier
CHAR_W = 0.52          # avg glyph advance as a fraction of line height
FACE_OVERLAP_MIN = 0.15  # min fraction of the face box a copy box must cover to flag


def sh(cmd: list[str]) -> str:
    return subprocess.run(cmd, capture_output=True, text=True).stderr + \
           subprocess.run(cmd, capture_output=True, text=True).stdout


def ff(cmd: list[str]) -> str:
    """Run ffmpeg/ffprobe, return combined stderr+stdout (filters log to stderr)."""
    p = subprocess.run(cmd, capture_output=True, text=True)
    return (p.stderr or "") + (p.stdout or "")


class Audit:
    def __init__(self, video: str, plan: dict, audio: str | None):
        self.video = video
        self.plan = plan
        self.audio = audio
        self.fps = plan.get("fps", 30)
        self.findings: list[dict] = []
        # timeline scene starts (frames), recomputed like compose.ts does
        self.pos = self._scene_positions()
        self.total_sec = plan["durationFrames"] / self.fps

    # -- finding helper --
    def add(self, dim, sev, title, detail, fix="", at=None, scene=None):
        self.findings.append({
            "dimension": dim, "severity": sev, "title": title, "detail": detail,
            "fix": fix, "atSec": None if at is None else round(at, 2), "scene": scene,
        })

    def _scene_positions(self) -> list[int]:
        scenes = self.plan["scenes"]
        bounds = self.plan.get("boundaries", [])

        def tF(d):
            t = d.get("type")
            if t in ("hard-cut", "match-cut"):
                return 1
            return max(1, d.get("durationFrames", 1) or 1)
        pos = [0]
        for i in range(1, len(scenes)):
            lenF = scenes[i - 1]["outFrame"] - scenes[i - 1]["inFrame"]
            dec = bounds[i - 1]["decision"] if i - 1 < len(bounds) else {"type": "hard-cut"}
            pos.append(pos[i - 1] + lenF - tF(dec))
        return pos

    def scene_span(self, i) -> tuple[float, float]:
        s = self.plan["scenes"][i]
        lenF = s["outFrame"] - s["inFrame"]
        return self.pos[i] / self.fps, (self.pos[i] + lenF) / self.fps

    # ===================== LAYER 1: structure / pacing =====================
    def check_structure(self):
        p, scenes = self.plan, self.plan["scenes"]
        # duration window
        if self.total_sec < 12:
            self.add("structure", "warn", "Muy corto",
                     f"{self.total_sec:.1f}s — bajo el rango cómodo para contar problema→solución.",
                     "Alargar escenas o añadir un beat de beneficio.")
        if self.total_sec > 45:
            self.add("structure", "warn", "Largo para Reel frío",
                     f"{self.total_sec:.1f}s — la retención cae; ideal 15–35s.",
                     "Recortar B-roll o unir ideas.")
        # hook length + copy in first 3s
        h0, h1 = self.scene_span(0)
        if (h1 - h0) > 4.5:
            self.add("structure", "warn", "Hook largo",
                     f"La 1ª escena dura {h1-h0:.1f}s; el thumb-stop vive en los primeros ~3s.",
                     "Acortar inFrame/outFrame de la escena 1.", at=h0, scene=scenes[0]["clipId"])
        hook_copy = [c for c in p.get("copy", []) if c["startFrame"] / self.fps < 3.0]
        if not hook_copy:
            self.add("structure", "error", "Sin copy en el hook",
                     "No hay headline en los primeros 3s — se pierde el gancho visual.",
                     "Añadir un CopyBlock que arranque < 1s.", at=0)
        # CTA presence in last ~6s + price legibility
        cta_zone = self.total_sec - 6
        cta_copy = [c for c in p.get("copy", []) if c["endFrame"] / self.fps > cta_zone]
        if not cta_copy:
            self.add("structure", "error", "CTA ausente al cierre",
                     "Ningún copy activo en los últimos 6s.",
                     "Añadir CTA con verbo de acción + oferta.", at=cta_zone)
        price_re = re.compile(r"\$|COP|\d\.\d{3}")
        price_blocks = [c for c in p.get("copy", [])
                        if any(price_re.search(l.get("text", "")) for l in c["lines"])]
        for c in price_blocks:
            dwell = (c["endFrame"] - c["startFrame"]) / self.fps
            if dwell < 2.0:
                self.add("structure", "warn", "Precio poco tiempo en pantalla",
                         f"El precio se ve {dwell:.1f}s (<2s) — no da tiempo a leerlo.",
                         "Extender endFrame del bloque de precio.",
                         at=c["startFrame"] / self.fps)
        if not price_blocks and p.get("intake", {}).get("objective") == "venta directa":
            self.add("structure", "info", "Sin precio visible",
                     "Venta directa sin precio en pantalla; suele ayudar a la conversión.",
                     "Considerar mostrar el precio con el círculo de marca.")
        # shot-length rhythm
        for i, s in enumerate(scenes):
            a, b = self.scene_span(i)
            d = b - a
            if d > 8.0:
                self.add("pacing", "warn", "Escena larga",
                         f"'{s['clipId']}' dura {d:.1f}s — riesgo de arrastre.",
                         "Dividir con B-roll o recortar si la idea hablada ya cerró.",
                         at=a, scene=s["clipId"])
            if d < 1.2 and i not in (len(scenes) - 1,):
                self.add("pacing", "warn", "Escena demasiado corta",
                         f"'{s['clipId']}' dura {d:.1f}s — no da tiempo a leer el copy.",
                         "Alargar o quitar el copy de esa escena.", at=a, scene=s["clipId"])
        # compliance
        comp = p.get("compliance", {}).get("overall")
        if comp and comp != "green":
            self.add("compliance", "error", f"Compliance {comp}",
                     "El policy-check no dio verde.",
                     "Revisar findings de compliance en el plan.")

    # ===================== LAYER 2: audio =====================
    def check_audio(self):
        # integrated loudness + true peak via loudnorm measurement pass
        out = ff(["ffmpeg", "-hide_banner", "-i", self.video, "-af",
                  "loudnorm=I=-14:TP=-1:print_format=summary", "-f", "null", "-"])
        I = self._grab(out, r"Input Integrated:\s*(-?[\d.]+)")
        TP = self._grab(out, r"Input True Peak:\s*(-?[\d.]+)")
        if I is not None:
            dev = abs(I - LUFS_TARGET)
            if dev > LUFS_ERR:
                self.add("audio", "error", "Loudness fuera de spec",
                         f"{I:.1f} LUFS (objetivo {LUFS_TARGET}); plataformas normalizan y sonará mal.",
                         "Re-masterizar con loudnorm 2 pasadas a -14 LUFS.")
            elif dev > LUFS_WARN:
                self.add("audio", "warn", "Loudness algo desviado",
                         f"{I:.1f} LUFS (objetivo {LUFS_TARGET} ±1).", "Ajustar ganancia.")
        if TP is not None and TP > TP_MAX:
            self.add("audio", "warn", "True-peak alto",
                     f"{TP:.1f} dBTP (>{TP_MAX}) — riesgo de clipping tras recompresión.",
                     "Limitar a -1 dBTP (alimiter level=disabled).")
        # dead air
        sil = ff(["ffmpeg", "-hide_banner", "-i", self.video, "-af",
                  "silencedetect=noise=-35dB:d=0.6", "-f", "null", "-"])
        durs = [float(x) for x in re.findall(r"silence_duration:\s*([\d.]+)", sil)]
        max_dead = self.plan.get("retention", {}).get("maxDeadAirSec", 2.5)
        for d in durs:
            if d > max_dead:
                self.add("audio", "warn", "Aire muerto",
                         f"Silencio contiguo de {d:.1f}s (>{max_dead}s presupuestado).",
                         "Recortar la pausa o solapar VO/música.")
        total_sil = sum(durs)
        if self.total_sec and total_sil / self.total_sec > 0.18:
            self.add("audio", "info", "Mucho silencio total",
                     f"{int(100*total_sil/self.total_sec)}% del video es silencio.",
                     "Tensar el ritmo del VO.")
        # voice vs music balance: speech scene windows vs endcard (music-only) tail
        endcard_a = (self.plan["scenes"][-1]["outFrame"] - self.plan["scenes"][-1]["inFrame"]
                     + self.pos[-1]) / self.fps
        music_lvl = self._mean_vol(endcard_a + 0.3, min(self.total_sec, endcard_a + 1.6))
        sp_a, sp_b = self.scene_span(len(self.plan["scenes"]) // 2)
        voice_lvl = self._mean_vol(sp_a + 0.5, sp_b - 0.3)
        if music_lvl is not None and voice_lvl is not None:
            delta = voice_lvl - music_lvl
            if delta < 6:
                self.add("audio", "warn", "Voz no destaca sobre la música",
                         f"Voz ~{delta:.0f} dB sobre la cama (ideal 9–12).",
                         "Subir VO o duckear más la música (sidechain).")

    def _mean_vol(self, a, b):
        if b <= a:
            return None
        out = ff(["ffmpeg", "-hide_banner", "-ss", f"{a:.2f}", "-t", f"{b-a:.2f}",
                  "-i", self.video, "-af", "volumedetect", "-f", "null", "-"])
        return self._grab(out, r"mean_volume:\s*(-?[\d.]+)")

    # ===================== LAYER 3: video signal =====================
    def check_video(self):
        meta = subprocess.run(
            ["ffprobe", "-v", "error", "-select_streams", "v:0", "-show_entries",
             "stream=width,height,r_frame_rate,pix_fmt:format=duration",
             "-of", "json", self.video], capture_output=True, text=True).stdout
        try:
            m = json.loads(meta); st = m["streams"][0]
            w, h = st["width"], st["height"]
            num, den = st["r_frame_rate"].split("/")
            fps = float(num) / float(den or 1)
            pix = st.get("pix_fmt")
            dur = float(m["format"]["duration"])
        except Exception as e:
            self.add("video", "error", "No se pudo leer el video", str(e)); return
        if (w, h) != (1080, 1920):
            self.add("video", "error", "Dimensiones no 9:16 1080×1920",
                     f"{w}×{h}.", "Renderizar/escalar a 1080×1920.")
        if abs(fps - self.fps) > 0.2:
            self.add("video", "warn", "FPS distinto al plan",
                     f"{fps:.2f} vs {self.fps}.", "Igualar fps de export.")
        if pix not in ("yuv420p",):
            self.add("video", "warn", "Pixel format no yuv420p",
                     f"{pix} — algunos players cambian color (yuvj420p full-range).",
                     "Exportar yuv420p limited-range.")
        if abs(dur - self.total_sec) > 0.3:
            self.add("video", "info", "Duración distinta al plan",
                     f"{dur:.1f}s vs {self.total_sec:.1f}s.", "")
        # end-card is an intentional static tapa → suppress freeze/black there.
        last = self.plan["scenes"][-1]
        endcard_start = (self.pos[-1] + last["outFrame"] - last["inFrame"]) / self.fps
        # black / freeze
        blk = ff(["ffmpeg", "-hide_banner", "-i", self.video, "-vf",
                  "blackdetect=d=0.1:pic_th=0.98", "-an", "-f", "null", "-"])
        for bs in re.findall(r"black_start:([\d.]+)", blk):
            t = float(bs)
            if 0.2 < t < dur - 0.2 and t < endcard_start - 0.15:
                self.add("video", "warn", "Frame(s) en negro",
                         f"Negro a los {t:.1f}s (posible hueco entre cortes).",
                         "Revisar el corte en ese punto.", at=t)
        frz = ff(["ffmpeg", "-hide_banner", "-i", self.video, "-vf",
                  "freezedetect=n=-60dB:d=0.5", "-an", "-f", "null", "-"])
        for fs in re.findall(r"freeze_start:\s*([\d.]+)", frz):
            t = float(fs)
            if t < endcard_start - 0.15:  # ignore the static end-card
                self.add("video", "info", "Segmento congelado",
                         f"Imagen congelada desde {t:.1f}s.",
                         "Verificar que no sea un frame pegado.", at=t)
        # per-scene sharpness (cv2 Laplacian variance) — flag a soft outlier
        self._sharpness_outliers()

    def _sharpness_outliers(self):
        try:
            import cv2, numpy as np
        except Exception:
            return
        cap = cv2.VideoCapture(self.video)
        vals = []
        for i in range(len(self.plan["scenes"])):
            a, b = self.scene_span(i)
            t = (a + b) / 2
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
            ok, fr = cap.read()
            if not ok:
                vals.append(None); continue
            g = cv2.cvtColor(fr, cv2.COLOR_BGR2GRAY)
            vals.append(float(cv2.Laplacian(g, cv2.CV_64F).var()))
        cap.release()
        good = [v for v in vals if v]
        if len(good) < 3:
            return
        med = sorted(good)[len(good) // 2]
        for i, v in enumerate(vals):
            if v and v < 0.45 * med:
                a, _ = self.scene_span(i)
                self.add("video", "warn", "Escena blanda/desenfocada",
                         f"'{self.plan['scenes'][i]['clipId']}' nitidez {v:.0f} vs mediana {med:.0f} "
                         "(posible foco suave o motion-blur no intencional).",
                         "Revisar foco/estabilidad o elegir otro frame de entrada.",
                         at=a, scene=self.plan["scenes"][i]["clipId"])

    # ===================== LAYER 4: layout (safe-zone + text over face) =====
    def check_layout(self):
        try:
            import cv2, numpy as np
            import mediapipe as mp
        except Exception as e:
            self.add("layout", "info", "Layout sin mediapipe/cv2", str(e)); return
        W, H = 1080, 1920
        det = mp.solutions.face_detection.FaceDetection(model_selection=1, min_detection_confidence=0.5)
        cap = cv2.VideoCapture(self.video)
        for c in self.plan.get("copy", []):
            t = (c["startFrame"] + c["endFrame"]) / 2 / self.fps
            # copy bbox (approx) from anchor/align/lines. Height uses the block's
            # tallest line × LINE_FACTOR; width is per-line (each line uses ITS OWN
            # font size — a long 'sm' subline must not inherit an 'xl' width).
            line_h = max(FONT_PX.get(l.get("size", "md"), FONT_PX["md"]) for l in c["lines"]) * LINE_FACTOR
            block_h = len(c["lines"]) * line_h
            block_w = max((len(l.get("text", "")) * FONT_PX.get(l.get("size", "md"), FONT_PX["md"]) * CHAR_W
                           for l in c["lines"]), default=0)
            ax, ay = c["anchor"]["x"] * W, c["anchor"]["y"] * H
            if c.get("align") == "center":
                x0, x1 = ax - block_w / 2, ax + block_w / 2
            else:
                x0, x1 = ax, ax + block_w
            y0, y1 = ay, ay + block_h
            # safe zones
            if y0 < SAFE["top"]:
                self.add("layout", "warn", "Copy en zona superior de UI",
                         f"Bloque {c['id']} arranca a y={int(y0)}px (<{SAFE['top']}) — lo tapa el handle/caption.",
                         "Bajar anchor.y.", at=t)
            if y1 > H - SAFE["bottom"]:
                self.add("layout", "warn", "Copy en zona inferior de UI",
                         f"Bloque {c['id']} llega a y={int(y1)}px — lo tapan CTA/menú de Reels.",
                         "Subir anchor.y o reducir tamaño.", at=t)
            if x0 < SAFE["left"] or x1 > W - SAFE["right"]:
                self.add("layout", "info", "Copy cerca del borde/rail",
                         f"Bloque {c['id']} x=[{int(x0)},{int(x1)}] roza el margen seguro.",
                         "Ajustar anchor.x o align.", at=t)
            # text over face
            cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
            ok, fr = cap.read()
            if not ok:
                continue
            res = det.process(cv2.cvtColor(fr, cv2.COLOR_BGR2RGB))
            if res.detections:
                for d in res.detections:
                    bb = d.location_data.relative_bounding_box
                    fx0, fy0 = bb.xmin * W, bb.ymin * H
                    fx1, fy1 = fx0 + bb.width * W, fy0 + bb.height * H
                    # flag only a MEANINGFUL intrusion (≥15% of the face covered),
                    # so a headline sitting just above the forehead is not a false hit
                    ix = max(0.0, min(x1, fx1) - max(x0, fx0))
                    iy = max(0.0, min(y1, fy1) - max(y0, fy0))
                    face_area = max(1.0, (fx1 - fx0) * (fy1 - fy0))
                    if (ix * iy) / face_area >= FACE_OVERLAP_MIN:
                        self.add("layout", "warn", "Copy sobre la cara",
                                 f"El bloque {c['id']} cubre ~{int(100*ix*iy/face_area)}% del rostro (~{int(fy0)}–{int(fy1)}px).",
                                 "Mover el copy al espacio negativo (arriba/lado).", at=t)
                        break
        cap.release()

    # ===================== LAYER 5: VLM (pluggable) =====================
    def check_vlm(self, mode: str):
        if mode == "none":
            return
        try:
            findings = vlm_pass(self.video, self.plan, self.pos, self.fps,
                                deterministic=self.findings)
        except Exception as e:
            self.add("vlm", "info", "Pase VLM no disponible", str(e),
                     "Levantar Ollama (`ollama run qwen3-vl:8b`) o fijar VF_VLM_BASE_URL/API_KEY.")
            return
        for f in findings:
            self.add("vlm", f.get("severity", "info"), f.get("title", "Observación VLM"),
                     f.get("detail", ""), f.get("fix", ""), at=f.get("atSec"),
                     scene=f.get("scene"))

    # ---- helpers ----
    def _grab(self, text, pattern):
        m = re.search(pattern, text)
        return float(m.group(1)) if m else None

    # ---- scoring / report ----
    def score(self):
        dims = ["structure", "pacing", "audio", "video", "layout", "compliance", "vlm"]
        scores = {}
        for d in dims:
            pen = sum(SEV_PENALTY[f["severity"]] for f in self.findings if f["dimension"] == d)
            scores[d] = max(0, 100 - pen)
        overall = round(sum(scores.values()) / len(scores))
        return scores, overall

    def run(self, vlm="none"):
        for fn in (self.check_structure, self.check_audio, self.check_video, self.check_layout):
            try:
                fn()
            except Exception as e:
                self.add("audit", "info", f"Check falló: {fn.__name__}", str(e))
        self.check_vlm(vlm)
        scores, overall = self.score()
        order = {"error": 0, "warn": 1, "info": 2}
        self.findings.sort(key=lambda f: (order[f["severity"]], f["dimension"]))
        return {"video": self.video, "durationSec": round(self.total_sec, 2),
                "overall": overall, "scores": scores,
                "counts": {s: sum(1 for f in self.findings if f["severity"] == s)
                           for s in SEV},
                "findings": self.findings}


# ===================== VLM pass (grounded, pluggable backend) =====================
# One OpenAI-compatible client covers every recommended backend by pointing
# VF_VLM_BASE_URL at it:
#   • local, free, private (default):  Ollama  → http://localhost:11434/v1, model qwen3-vl:8b
#   • cloud cheap:  OpenRouter (qwen/*, google/gemini-2.5-flash) or OpenAI
# Frames (not native video) are sent — portable across all of them and best for the
# frame-level legibility/CTA/brand checks. The first 3s (hook) is oversampled.
VLM_RUBRIC = """Eres un director creativo QC de anuncios verticales (Reels/TikTok) para la
marca de fajas Salomé (audaz, femenina, sensual pero cálida; español de Colombia).
Te doy FRAMES etiquetados con su timestamp, el copy y el CTA planeados, y MÉTRICAS ya
medidas por herramientas deterministas (confía en ellas, no las recalcules). Juzga solo
lo que se ve en los frames. Reporta problemas ACCIONABLES de: legibilidad/contraste del
texto, texto que tapa el sujeto, coherencia de marca (colores/logo/tono), fuerza del hook
en los primeros 3s, claridad/timing del CTA y del precio, y errores de copy (ortografía,
tono). Si un elemento no se ve claramente, decláralo ausente; no lo inventes.
Devuelve SOLO JSON: {"findings":[{"category","severity","atSec","title","detail","fix"}]}
category ∈ [legibility,visual,brand,hook,cta,copy,pacing]; severity ∈ [error,warn,info].
Sé conciso; máximo 8 findings, los más importantes primero. Si todo está bien, findings=[]."""


def _sample_frames(video, plan, pos, fps):
    """Return [(atSec, jpeg_bytes)] — hook oversampled + each scene mid + endcard."""
    import cv2
    times = [0.5, 1.5, 2.5]  # oversample the hook (first 3s)
    scenes = plan["scenes"]
    for i, s in enumerate(scenes):
        a = pos[i] / fps
        b = (pos[i] + s["outFrame"] - s["inFrame"]) / fps
        times.append(round((a + b) / 2, 2))
    last = scenes[-1]
    endcard = (pos[-1] + last["outFrame"] - last["inFrame"]) / fps
    times.append(round(min(plan["durationFrames"] / fps - 0.2, endcard + 1.0), 2))
    times = sorted(set(t for t in times if t >= 0))
    cap = cv2.VideoCapture(video)
    out = []
    for t in times:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000)
        ok, fr = cap.read()
        if not ok:
            continue
        h, w = fr.shape[:2]
        nw = 512
        fr = cv2.resize(fr, (nw, int(h * nw / w)))
        ok, buf = cv2.imencode(".jpg", fr, [cv2.IMWRITE_JPEG_QUALITY, 80])
        if ok:
            out.append((t, buf.tobytes()))
    cap.release()
    return out


def vlm_pass(video, plan, pos, fps, deterministic=None):
    import base64, urllib.request
    base = os.environ.get("VF_VLM_BASE_URL", "http://localhost:11434/v1").rstrip("/")
    model = os.environ.get("VF_VLM_MODEL", "qwen3-vl:8b")
    key = os.environ.get("VF_VLM_API_KEY", "ollama")
    frames = _sample_frames(video, plan, pos, fps)
    if not frames:
        raise RuntimeError("no se pudieron muestrear frames")
    copy_txt = " | ".join(" / ".join(l.get("text", "") for l in c["lines"])
                          for c in plan.get("copy", []))
    metrics = "; ".join(f"{f['dimension']}:{f['title']}" for f in (deterministic or []))
    content = [{"type": "text", "text":
                f"{VLM_RUBRIC}\n\nCOPY PLANEADO: {copy_txt}\nCTA: {plan.get('intake',{}).get('cta','')}\n"
                f"MÉTRICAS DETERMINISTAS: {metrics or 'sin banderas'}\n\nFRAMES:"}]
    for t, jpg in frames:
        content.append({"type": "text", "text": f"t={t}s:"})
        content.append({"type": "image_url", "image_url":
                        {"url": "data:image/jpeg;base64," + base64.b64encode(jpg).decode()}})
    body = json.dumps({
        "model": model, "temperature": 0,
        "messages": [{"role": "user", "content": content}],
        "response_format": {"type": "json_object"},
    }).encode()
    req = urllib.request.Request(base + "/chat/completions", data=body,
                                 headers={"Content-Type": "application/json",
                                          "Authorization": f"Bearer {key}"})
    with urllib.request.urlopen(req, timeout=300) as r:
        data = json.loads(r.read())
    txt = data["choices"][0]["message"]["content"]
    m = re.search(r"\{[\s\S]*\}", txt)
    parsed = json.loads(m.group(0) if m else txt)
    return parsed.get("findings", []) if isinstance(parsed, dict) else []


def to_md(r: dict) -> str:
    grade = "🟢" if r["overall"] >= 85 else ("🟡" if r["overall"] >= 70 else "🔴")
    L = [f"# Auditoría — {os.path.basename(r['video'])}",
         "", f"**Score global: {grade} {r['overall']}/100**  ·  {r['durationSec']}s  ·  "
         f"{r['counts']['error']} errores, {r['counts']['warn']} avisos, {r['counts']['info']} notas",
         "", "| Dimensión | Score |", "|---|---|"]
    for d, s in r["scores"].items():
        L.append(f"| {d} | {s} |")
    L.append("")
    icon = {"error": "🔴", "warn": "🟡", "info": "🔵"}
    L.append("## Hallazgos")
    if not r["findings"]:
        L.append("_Sin hallazgos._")
    for f in r["findings"]:
        at = f" · {f['atSec']}s" if f.get("atSec") is not None else ""
        sc = f" · {f['scene']}" if f.get("scene") else ""
        L.append(f"- {icon[f['severity']]} **[{f['dimension']}]** {f['title']}{at}{sc}  \n"
                 f"  {f['detail']}" + (f"  \n  → _{f['fix']}_" if f.get("fix") else ""))
    return "\n".join(L) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--video", required=True)
    ap.add_argument("--plan", required=True)
    ap.add_argument("--out", default=None, help="write findings JSON here")
    ap.add_argument("--md", default=None, help="write markdown report here")
    ap.add_argument("--vlm", choices=["none", "frames"], default="none")
    ap.add_argument("--audio", default=None, help="optional VO stem for cadence")
    args = ap.parse_args()

    plan = json.load(open(args.plan))
    a = Audit(args.video, plan, args.audio)
    r = a.run(vlm=args.vlm)
    if args.out:
        json.dump(r, open(args.out, "w"), ensure_ascii=False, indent=2)
    if args.md:
        open(args.md, "w").write(to_md(r))
    print(to_md(r))
    return 0


if __name__ == "__main__":
    sys.exit(main())
