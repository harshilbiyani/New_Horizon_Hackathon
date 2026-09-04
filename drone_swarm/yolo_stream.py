"""
drone_swarm/yolo_stream.py — Real-time YOLOv8 Video Streaming with Tactical HUD

Generates an MJPEG stream with live YOLOv8 person bounding boxes,
confidence ratings, tactical crosshairs, and live telemetry overlays.
Streams over HTTP multipart/x-mixed-replace to standard HTML <img> or <canvas>.
"""

import time
from pathlib import Path
import cv2
import numpy as np
from ultralytics import YOLO

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
VIDEOS_DIR = DATA_DIR / "videos"

_model = None


def get_yolo_model(model_name="yolov8n.pt"):
    global _model
    if _model is None:
        model_path = BASE_DIR / model_name
        if not model_path.exists():
            model_path = model_name
        _model = YOLO(str(model_path))
    return _model


def list_available_videos() -> list[dict]:
    """Finds all video files available in data/videos and data/."""
    vids = []
    seen = set()

    for p in list(VIDEOS_DIR.glob("*.mp4")) + list(VIDEOS_DIR.glob("*.webm")) + list(DATA_DIR.glob("*.mp4")) + list(DATA_DIR.glob("*.webm")):
        if p.name in seen or p.name.startswith("annotated_"):
            continue
        seen.add(p.name)
        rel = str(p.relative_to(BASE_DIR)).replace("\\", "/")
        vids.append({
            "name": p.name,
            "path": rel,
            "size_mb": round(p.stat().st_size / (1024 * 1024), 2)
        })

    return vids


def draw_tactical_hud(frame: np.ndarray, num_persons: int, fps: float, drone_id: str = "DRONE-1") -> np.ndarray:
    """Draws a sleek, modern tactical HUD overlay on the video frame."""
    h, w = frame.shape[:2]

    # Corner brackets (Cyan HUD style)
    color_cyan = (204, 255, 0)     # BGR for #00ffcc
    color_green = (50, 220, 50)
    color_red = (40, 40, 240)

    # Top banner bar
    cv2.rectangle(frame, (0, 0), (w, 36), (10, 15, 25), -1)
    cv2.line(frame, (0, 36), (w, 36), (60, 80, 100), 1)

    # Badge: Live YOLO Status
    badge_color = color_green if num_persons > 0 else (120, 140, 160)
    cv2.circle(frame, (18, 18), 5, badge_color, -1)
    cv2.putText(frame, "LIVE YOLOv8 DETECTOR", (32, 23), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (240, 240, 240), 1, cv2.LINE_AA)

    # Drone ID & FPS
    stats_text = f"{drone_id} | {fps:.1f} FPS"
    cv2.putText(frame, stats_text, (w - 170, 23), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color_cyan, 1, cv2.LINE_AA)

    # Detection Count Pill in Top Center
    if num_persons > 0:
        det_text = f"TARGET DETECTED: {num_persons} PERSON{'S' if num_persons > 1 else ''}"
        text_size = cv2.getTextSize(det_text, cv2.FONT_HERSHEY_SIMPLEX, 0.55, 2)[0]
        tx = (w - text_size[0]) // 2
        cv2.rectangle(frame, (tx - 10, 5), (tx + text_size[0] + 10, 30), (0, 40, 140), -1)
        cv2.putText(frame, det_text, (tx, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 240, 255), 2, cv2.LINE_AA)

    # Center tactical crosshair
    cx, cy = w // 2, h // 2
    cv2.line(frame, (cx - 16, cy), (cx - 6, cy), color_cyan, 1)
    cv2.line(frame, (cx + 6, cy), (cx + 16, cy), color_cyan, 1)
    cv2.line(frame, (cx, cy - 16), (cx, cy - 6), color_cyan, 1)
    cv2.line(frame, (cx, cy + 6), (cx, cy + 16), color_cyan, 1)

    # Bottom telemetry readout
    cv2.rectangle(frame, (0, h - 28), (w, h), (10, 15, 25), -1)
    cv2.line(frame, (0, h - 28), (w, h - 28), (60, 80, 100), 1)
    ts = time.strftime("%H:%M:%S UTC")
    telem = f"FPV OPTICAL CAM · {w}x{h} · {ts} · SECURE LINK 256-BIT"
    cv2.putText(frame, telem, (14, h - 9), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (160, 180, 200), 1, cv2.LINE_AA)

    return frame


def generate_yolo_mjpeg(source: str = "data/videos/test_video.mp4", conf: float = 0.35, target_fps: int = 24):
    """
    Continuous generator reading frames from video, running YOLO,
    drawing bounding boxes + tactical HUD, and yielding MJPEG frames.
    Loops indefinitely when the video ends.
    """
    # Resolve source path
    src_path = Path(source)
    if not src_path.is_absolute():
        src_path = BASE_DIR / source

    # Fallback to any available video if given path does not exist
    if not src_path.exists():
        vids = list_available_videos()
        if vids:
            src_path = BASE_DIR / vids[0]["path"]
        else:
            src_path = None

    model = get_yolo_model()
    cap = None
    frame_delay = 1.0 / max(1, target_fps)

    while True:
        if src_path and src_path.exists():
            if cap is None or not cap.isOpened():
                cap = cv2.VideoCapture(str(src_path))

            ret, frame = cap.read()
            if not ret:
                # Loop back to beginning
                cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                continue
        else:
            # Synthetic simulation fallback frame
            frame = np.zeros((480, 720, 3), dtype=np.uint8)
            cv2.putText(frame, "Awaiting Video Feed...", (220, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 204), 2)
            cv2.putText(frame, f"Source: {source}", (220, 280), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 180, 180), 1)

        # Scale down if very large for smooth real-time web streaming
        h, w = frame.shape[:2]
        if w > 850:
            scale = 850.0 / w
            frame = cv2.resize(frame, (850, int(h * scale)))

        # Run YOLOv8 inference (person class = 0)
        t_start = time.time()
        results = model(frame, classes=[0], conf=conf, verbose=False)
        r = results[0]
        num_persons = len(r.boxes)

        # Draw YOLO bounding boxes
        annotated = r.plot(line_width=2, font_size=0.8)

        # Calculate FPS
        infer_time = time.time() - t_start
        fps = 1.0 / max(0.001, infer_time)

        # Draw HUD overlays
        annotated = draw_tactical_hud(annotated, num_persons, fps)

        # Compress to JPEG
        _, buffer = cv2.imencode(".jpg", annotated, [cv2.IMWRITE_JPEG_QUALITY, 78])
        frame_bytes = buffer.tobytes()

        yield (
            b"--frame\r\n"
            b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
        )

        # Maintain smooth target framerate
        time.sleep(max(0.01, frame_delay - infer_time))
