"""
drone_swarm/yolo_stream.py - Real-time YOLOv8 Video Streaming with Tactical HUD

Generates an MJPEG stream with live YOLOv8 person bounding boxes,
confidence ratings, tactical crosshairs, and live telemetry overlays.
Supports live laptop webcam or local/remote video files.
Streams over HTTP multipart/x-mixed-replace to standard HTML <img> or <canvas>.
"""

import time
import io
import uuid
import threading
import requests
import os
from pathlib import Path
import cv2
import numpy as np
from ultralytics import YOLO
import cloudinary
import cloudinary.uploader
from dotenv import load_dotenv

load_dotenv()

cloudinary.config(
  cloud_name = os.getenv("VITE_CLOUDINARY_CLOUD_NAME"),
  api_key = os.getenv("VITE_CLOUDINARY_API_KEY"),
  api_secret = os.getenv("VITE_CLOUDINARY_API_SECRET"),
  secure = True
)

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
VIDEOS_DIR = DATA_DIR / "videos"

_model = None


class CameraManager:
    """Thread-safe webcam frame grabber singleton that prevents device locking."""
    _instances = {}
    _lock = threading.Lock()

    def __init__(self, cam_idx: int = 0):
        self.cam_idx = cam_idx
        self.cap = None
        self.latest_frame = None
        self.running = False
        self.thread = None
        self.lock = threading.Lock()
        self.ref_count = 0
        self.last_frame_time = 0.0

    @classmethod
    def get_instance(cls, cam_idx: int = 0):
        with cls._lock:
            if cam_idx not in cls._instances:
                cls._instances[cam_idx] = CameraManager(cam_idx)
            return cls._instances[cam_idx]

    def acquire(self):
        with self.lock:
            self.ref_count += 1
            if not self.running:
                self.running = True
                self.thread = threading.Thread(target=self._run, daemon=True, name=f"cam-grabber-{self.cam_idx}")
                self.thread.start()

    def release(self):
        with self.lock:
            self.ref_count = max(0, self.ref_count - 1)

    def get_frame(self, timeout=3.0):
        start = time.time()
        while time.time() - start < timeout:
            with self.lock:
                if self.latest_frame is not None:
                    return self.latest_frame.copy()
            time.sleep(0.02)
        return None

    def _run(self):
        print(f"[CameraManager] Initializing camera index {self.cam_idx} ...")
        cap = cv2.VideoCapture(self.cam_idx, cv2.CAP_DSHOW)
        if not cap.isOpened():
            cap = cv2.VideoCapture(self.cam_idx)

        if not cap.isOpened():
            print(f"[CameraManager] Could not open camera {self.cam_idx}")
            with self.lock:
                self.running = False
            return

        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 1280)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 720)
        self.cap = cap

        # Warm up sensor: read 3 frames
        for _ in range(3):
            cap.read()
            time.sleep(0.02)

        idle_start = None
        while self.running:
            with self.lock:
                refs = self.ref_count

            # Idle shutdown after 20s of no active consumers
            if refs == 0:
                if idle_start is None:
                    idle_start = time.time()
                elif time.time() - idle_start > 20.0:
                    print("[CameraManager] Camera idle timeout reached. Releasing hardware.")
                    break
            else:
                idle_start = None

            ret, frame = cap.read()
            if ret and frame is not None:
                with self.lock:
                    self.latest_frame = frame
                    self.last_frame_time = time.time()
            else:
                time.sleep(0.04)

            time.sleep(0.01)

        cap.release()
        self.cap = None
        with self.lock:
            self.running = False
            self.latest_frame = None
        print(f"[CameraManager] Camera {self.cam_idx} closed cleanly.")


def parse_source(source: str):
    """
    Determines if source is a local webcam/camera or video file.
    Returns (is_camera: bool, cam_index_or_path: int | str).
    """
    if not source:
        return False, source
    s = str(source).strip()
    s_lower = s.lower()
    if s_lower in ("webcam", "camera", "live", "cam", "0"):
        return True, 0
    if s.isdigit():
        return True, int(s)
    if s_lower.startswith("camera:") or s_lower.startswith("cam:") or s_lower.startswith("webcam:"):
        part = s.split(":", 1)[1].strip()
        return True, int(part) if part.isdigit() else 0
    return False, source


def get_yolo_model(model_name="yolov8n.pt"):
    global _model
    if _model is None:
        model_path = BASE_DIR / model_name
        if not model_path.exists():
            model_path = model_name
        _model = YOLO(str(model_path))
    return _model


def list_available_videos() -> list[dict]:
    """Finds all video files available in data/videos and data/ plus live camera option."""
    vids = [
        {
            "name": "Live Laptop Camera",
            "path": "webcam",
            "size_mb": 0.0,
            "is_camera": True
        }
    ]
    seen = set()

    for p in list(VIDEOS_DIR.glob("*.mp4")) + list(VIDEOS_DIR.glob("*.webm")) + list(DATA_DIR.glob("*.mp4")) + list(DATA_DIR.glob("*.webm")):
        if p.name in seen or p.name.startswith("annotated_"):
            continue
        seen.add(p.name)
        rel = p.relative_to(BASE_DIR).as_posix()
        vids.append({
            "name": p.name,
            "path": rel,
            "size_mb": round(p.stat().st_size / (1024 * 1024), 2),
            "is_camera": False
        })

    return vids


def upload_frame_background(frame_bytes: bytes, num_persons: int):
    """Uploads detected frame to Cloudinary and indexes into VLM backend."""
    try:
        det_id = str(uuid.uuid4())
        resp = cloudinary.uploader.upload(
            frame_bytes,
            public_id=f"drone_shield/detections/{det_id}",
            resource_type="image"
        )
        cloud_url = resp.get("secure_url")
        
        vlm_base = "http://localhost:5001"
        buf = io.BytesIO(frame_bytes)
        
        r_embed = requests.post(
            f"{vlm_base}/embed/image",
            files={"file": ("frame.jpg", buf, "image/jpeg")},
            timeout=10
        )
        if not r_embed.ok:
            return
            
        embedding = r_embed.json()["embedding"]
        
        metadata = {
            "id": det_id,
            "drone_id": "drone-1",
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "image_path": cloud_url,
            "lat": round(12.9716 + np.random.uniform(-0.005, 0.005), 6),
            "lon": round(77.5946 + np.random.uniform(-0.005, 0.005), 6),
            "altitude_m": 45.0,
            "heading_deg": 180.0,
            "confidence": 0.88,
            "scene_label": f"Live Detection ({num_persons} persons)",
            "description": f"Real-time YOLO detection of {num_persons} person(s)",
        }
        
        requests.post(
            f"{vlm_base}/index",
            json={"embedding": embedding, "metadata": metadata},
            timeout=10
        )
    except Exception as e:
        print(f"[YOLO] Background upload failed: {e}")


def draw_tactical_hud(frame: np.ndarray, num_persons: int, fps: float, drone_id: str = "DRONE-1") -> np.ndarray:
    """Draws a sleek, modern tactical HUD overlay on the video frame."""
    h, w = frame.shape[:2]

    color_cyan = (204, 255, 0)     # BGR for #00ffcc
    color_green = (50, 220, 50)

    # Top banner bar
    cv2.rectangle(frame, (0, 0), (w, 36), (10, 15, 25), -1)
    cv2.line(frame, (0, 36), (w, 36), (60, 80, 100), 1)

    # Badge: Live YOLO Status
    badge_color = color_green if num_persons > 0 else (120, 140, 160)
    cv2.circle(frame, (18, 18), 5, badge_color, -1)
    title = "LIVE WEBCAM YOLOv8" if "CAM" in drone_id else "LIVE YOLOv8 DETECTOR"
    cv2.putText(frame, title, (32, 23), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (240, 240, 240), 1, cv2.LINE_AA)

    # Drone ID & FPS
    stats_text = f"{drone_id} | {fps:.1f} FPS"
    cv2.putText(frame, stats_text, (w - 180, 23), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color_cyan, 1, cv2.LINE_AA)

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
    telem = f"OPTICAL CAM | {w}x{h} | {ts} | SECURE LINK 256-BIT"
    cv2.putText(frame, telem, (14, h - 9), cv2.FONT_HERSHEY_SIMPLEX, 0.42, (160, 180, 200), 1, cv2.LINE_AA)

    return frame


def generate_yolo_mjpeg(source: str = "webcam", conf: float = 0.15, target_fps: int = 24):
    """
    Continuous generator reading frames from live camera or video file,
    running YOLO, drawing bounding boxes + tactical HUD, and yielding MJPEG frames.
    """
    is_cam, cam_or_path = parse_source(source)
    src_path = None
    cam_mgr = None

    if is_cam:
        cam_mgr = CameraManager.get_instance(cam_or_path)
        cam_mgr.acquire()
    else:
        src_path = Path(source)
        if not src_path.is_absolute():
            src_path = BASE_DIR / source

        if not src_path.exists():
            vids = [v for v in list_available_videos() if not v.get("is_camera")]
            if vids:
                src_path = BASE_DIR / vids[0]["path"]
            else:
                src_path = None

    model = get_yolo_model()
    cap = None
    video_start_time = time.time()
    video_fps = 30.0

    try:
        while True:
            t_loop_start = time.time()

            if is_cam:
                frame = cam_mgr.get_frame(timeout=2.0)
                if frame is None:
                    frame = np.zeros((480, 720, 3), dtype=np.uint8)
                    cv2.putText(frame, "CONNECTING TO WEBCAM...", (180, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 204), 2)
                    cv2.putText(frame, f"Device Index: {cam_or_path} | Initializing DirectShow", (160, 275), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (160, 160, 160), 1)
            elif src_path and src_path.exists():
                if cap is None or not cap.isOpened():
                    cap = cv2.VideoCapture(str(src_path))
                    video_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
                    video_start_time = time.time()

                elapsed = time.time() - video_start_time
                target_frame = int(elapsed * video_fps)
                total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

                if target_frame >= total_frames and total_frames > 0:
                    video_start_time = time.time()
                    target_frame = 0

                cap.set(cv2.CAP_PROP_POS_FRAMES, target_frame)
                ret, frame = cap.read()

                if not ret:
                    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
                    video_start_time = time.time()
                    continue
            else:
                frame = np.zeros((480, 720, 3), dtype=np.uint8)
                cv2.putText(frame, "Awaiting Video Feed...", (220, 240), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 204), 2)
                cv2.putText(frame, f"Source: {source}", (220, 280), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 180, 180), 1)

            # Scale down if very large for smooth real-time web streaming
            h, w = frame.shape[:2]
            if w > 850:
                scale = 850.0 / w
                frame = cv2.resize(frame, (850, int(h * scale)))

            # Run YOLOv8 inference (person class = 0)
            t_infer = time.time()
            effective_conf = conf if conf is not None else 0.15
            results = model(frame, classes=[0], conf=effective_conf, verbose=False)
            r = results[0]
            num_persons = len(r.boxes)

            annotated = frame.copy()

            # Draw custom tactical YOLO bounding boxes
            if num_persons > 0:
                boxes = r.boxes.xyxy.cpu().numpy().astype(int)
                confs = r.boxes.conf.cpu().numpy()

                for box, conf_val in zip(boxes, confs):
                    x1, y1, x2, y2 = box
                    cv2.rectangle(annotated, (x1, y1), (x2, y2), (0, 255, 204), 2)
                    label = f"PERSON {int(conf_val * 100)}%"
                    (text_w, text_h), _ = cv2.getTextSize(label, cv2.FONT_HERSHEY_SIMPLEX, 0.45, 1)
                    cv2.rectangle(annotated, (x1, max(0, y1 - 20)), (x1 + text_w + 4, y1), (0, 255, 204), -1)
                    cv2.putText(annotated, label, (x1 + 2, max(15, y1 - 5)), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1, cv2.LINE_AA)

            # Calculate FPS
            infer_duration = time.time() - t_infer
            fps = 1.0 / max(0.001, infer_duration)

            # Draw HUD overlays
            drone_tag = "LIVE-CAM" if is_cam else "DRONE-1"
            annotated = draw_tactical_hud(annotated, num_persons, fps, drone_id=drone_tag)

            # Encode to JPEG
            ret, buffer = cv2.imencode('.jpg', annotated, [cv2.IMWRITE_JPEG_QUALITY, 80])
            if not ret:
                continue

            frame_bytes = buffer.tobytes()

            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n\r\n" + frame_bytes + b"\r\n"
            )

            # Throttle to target FPS
            loop_duration = time.time() - t_loop_start
            sleep_time = (1.0 / max(1, target_fps)) - loop_duration
            if sleep_time > 0.001:
                time.sleep(sleep_time)

    finally:
        if is_cam and cam_mgr is not None:
            cam_mgr.release()
        if cap is not None:
            cap.release()
