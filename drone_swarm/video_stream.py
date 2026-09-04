"""
video_stream.py — Continuous periodic frame sampler for DroneShield VLM Phase 2.

Reads frames from:
  - Local MP4/AVI/MOV file  (via OpenCV VideoCapture)
  - RTSP URL                (rtsp://...)
  - Synthetic sim feed      (fallback: generates frames from demo_ingest scenes)

Every `sample_interval_sec` seconds a frame is captured, sent through
FrameCaptureService → CLIP embed → FAISS index.

GPS metadata is sourced from:
  1. DJI .SRT file alongside the video file (real GPS)
  2. Synthetic GPS walk (smooth circle, used when no SRT)

Usage (standalone demo):
    python drone_swarm/video_stream.py --source data/videos/demo.mp4 --interval 3

Usage (via Flask API):
    POST /stream/start  { "source": "data/videos/demo.mp4", "sample_interval": 3, "drone_id": "drone-1" }
    POST /stream/stop
    GET  /stream/status
"""

import argparse
import io
import logging
import math
import random
import sys
import threading
import time
import uuid
from pathlib import Path

from PIL import Image

# ─── Logging ─────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="[video_stream] %(asctime)s %(levelname)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("video_stream")

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
VIDEOS_DIR = DATA_DIR / "videos"
VIDEOS_DIR.mkdir(parents=True, exist_ok=True)

VLM_BASE = "http://localhost:5001"


# ─── SSE event queue (shared with vlm_service Flask app) ─────────────────────
_sse_queue: list[dict] = []
_sse_lock = threading.Lock()


def push_sse_event(event: dict):
    """Push an event into the global SSE queue (consumed by /stream/events)."""
    with _sse_lock:
        _sse_queue.append(event)
        if len(_sse_queue) > 200:
            _sse_queue.pop(0)


def drain_sse_events(since_idx: int = 0) -> tuple[list[dict], int]:
    """Return new events since `since_idx` and the new tail index."""
    with _sse_lock:
        new = _sse_queue[since_idx:]
        return new, len(_sse_queue)


# ─── Synthetic frame generator (fallback when no video file) ─────────────────
def _make_synthetic_frame(scene_idx: int) -> Image.Image:
    """Generate a synthetic drone-camera frame (reuses demo_ingest scenes)."""
    try:
        from drone_swarm.demo_ingest import SCENES, generate_frame
    except ImportError:
        try:
            sys.path.insert(0, str(BASE_DIR))
            from drone_swarm.demo_ingest import SCENES, generate_frame
        except ImportError:
            # Absolute fallback: plain colored image
            color = (random.randint(30, 180), random.randint(30, 180), random.randint(30, 180))
            return Image.new("RGB", (640, 480), color)
    scene = SCENES[scene_idx % len(SCENES)]
    return generate_frame(scene)


# ─── VideoStreamReader ────────────────────────────────────────────────────────
class VideoStreamReader:
    """
    Thread that periodically samples frames from a video source and
    pipelines them through FrameCaptureService → VLM service.
    """

    def __init__(
        self,
        source: str = "synthetic",
        sample_interval_sec: float = 3.0,
        drone_id: str = "drone-1",
        vlm_base: str = VLM_BASE,
        loop: bool = True,
    ):
        self.source = source
        self.sample_interval_sec = sample_interval_sec
        self.drone_id = drone_id
        self.vlm_base = vlm_base
        self.loop = loop  # loop video when it ends

        self._thread: threading.Thread | None = None
        self._stop_event = threading.Event()
        self._lock = threading.Lock()
        
        import concurrent.futures
        self._executor = concurrent.futures.ThreadPoolExecutor(max_workers=5)

        # Stats
        self.frames_processed = 0
        self.start_time: float | None = None
        self.current_lat = 12.9716
        self.current_lon = 77.5946
        self.error: str | None = None

        # Determine source type
        from drone_swarm.yolo_stream import parse_source
        self._is_camera, self._camera_idx = parse_source(source)
        self._is_synthetic = (source == "synthetic" or source == "") and not self._is_camera
        self._is_rtsp = str(source).lower().startswith("rtsp://")
        self._is_file = not self._is_synthetic and not self._is_rtsp and not self._is_camera

        # SRT parser for real video files
        self._srt: object | None = None
        if self._is_file:
            self._init_srt()

        # FrameCaptureService
        from drone_swarm.frame_capture import FrameCaptureService
        self._capture = FrameCaptureService(vlm_base=vlm_base)

    def _init_srt(self):
        """Try to find a .SRT file alongside the video."""
        video_path = Path(self.source)
        if not video_path.is_absolute():
            video_path = BASE_DIR / self.source
        srt_path = video_path.with_suffix(".SRT")
        if not srt_path.exists():
            srt_path = video_path.with_suffix(".srt")
        if srt_path.exists():
            from drone_swarm.srt_parser import SRTParser
            self._srt = SRTParser(srt_path)
            log.info(f"Loaded SRT: {srt_path.name} ({self._srt.block_count} blocks)")
        else:
            log.info("No SRT file found — using synthetic GPS walk")

    @property
    def running(self) -> bool:
        return self._thread is not None and self._thread.is_alive()

    @property
    def fps_estimate(self) -> float:
        if not self.start_time or self.frames_processed == 0:
            return 0.0
        elapsed = time.time() - self.start_time
        return round(self.frames_processed / elapsed, 3) if elapsed > 0 else 0.0

    def start(self):
        if self.running:
            log.warning("Stream already running")
            return
        self._stop_event.clear()
        self.frames_processed = 0
        self.error = None
        self.start_time = time.time()
        self._thread = threading.Thread(target=self._run, daemon=True, name="vlm-stream")
        self._thread.start()
        log.info(f"Stream started: source='{self.source}' interval={self.sample_interval_sec}s")

    def stop(self):
        self._stop_event.set()
        if self._thread:
            self._thread.join(timeout=5)
        log.info(f"Stream stopped after {self.frames_processed} frames")
        push_sse_event({"type": "stopped", "total": self.frames_processed,
                        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())})

    def status(self) -> dict:
        return {
            "running": self.running,
            "source": self.source,
            "frames_processed": self.frames_processed,
            "fps_estimate": self.fps_estimate,
            "current_lat": self.current_lat,
            "current_lon": self.current_lon,
            "sample_interval_sec": self.sample_interval_sec,
            "drone_id": self.drone_id,
            "error": self.error,
        }

    # ── Internal run loop ─────────────────────────────────────────────────────
    def _run(self):
        if self._is_camera:
            self._run_camera()
        elif self._is_synthetic:
            self._run_synthetic()
        elif self._is_file or self._is_rtsp:
            self._run_opencv()
        else:
            log.error(f"Unknown source type: {self.source}")

    def _run_camera(self):
        """Sample frames periodically from local laptop camera/webcam via shared CameraManager."""
        try:
            import cv2
        except ImportError:
            self.error = "OpenCV not installed"
            log.error(self.error)
            return

        from drone_swarm.srt_parser import synthetic_gps_walk
        from drone_swarm.yolo_stream import get_yolo_model, CameraManager

        cam_mgr = CameraManager.get_instance(self._camera_idx)
        cam_mgr.acquire()

        log.info(f"Attached to live camera index {self._camera_idx} for ingestion (interval={self.sample_interval_sec}s)")
        model = get_yolo_model()
        frame_idx = 0

        try:
            while not self._stop_event.is_set():
                bgr_frame = cam_mgr.get_frame(timeout=3.0)
                if bgr_frame is None:
                    self._stop_event.wait(timeout=0.2)
                    continue

                rgb = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2RGB)
                results = model(rgb, classes=[0], conf=0.15, verbose=False)
                num_persons = len(results[0].boxes)

                if num_persons > 0:
                    lat, lon, alt, hdg = synthetic_gps_walk(
                        frame_idx, 1000,
                        lat_center=12.9716, lon_center=77.5946,
                    )
                    boxes = results[0].boxes.xyxy.cpu().numpy().astype(int)
                    confs = results[0].boxes.conf.cpu().numpy()
                    h, w = rgb.shape[:2]
                    pad = 20

                    for box, conf_val in zip(boxes, confs):
                        x1, y1, x2, y2 = box
                        px1 = max(0, x1 - pad)
                        py1 = max(0, y1 - pad)
                        px2 = min(w, x2 + pad)
                        py2 = min(h, y2 + pad)
                        crop = rgb[py1:py2, px1:px2]
                        if crop.size == 0:
                            continue
                        crop_resized = cv2.resize(crop, None, fx=3.0, fy=3.0, interpolation=cv2.INTER_CUBIC)
                        crop_pil = Image.fromarray(crop_resized)
                        self._executor.submit(
                            self._process_frame,
                            crop_pil,
                            lat=lat, lon=lon, altitude_m=alt, heading_deg=hdg,
                            frame_idx=frame_idx, confidence=float(conf_val)
                        )
                else:
                    log.info(f"Live Cam frame {frame_idx}: No persons detected")

                frame_idx += 1
                self._stop_event.wait(timeout=self.sample_interval_sec)
        finally:
            cam_mgr.release()
            log.info("Live camera detached from ingestion")

    def _run_synthetic(self):
        """Generate synthetic frames at the sample interval."""
        from drone_swarm.srt_parser import synthetic_gps_walk
        frame_idx = 0
        while not self._stop_event.is_set():
            img = _make_synthetic_frame(frame_idx)
            lat, lon, alt, hdg = synthetic_gps_walk(
                frame_idx, total_frames=100,
                lat_center=12.9716, lon_center=77.5946,
            )
            self._process_frame(img, lat=lat, lon=lon, altitude_m=alt,
                                heading_deg=hdg, frame_idx=frame_idx)
            frame_idx += 1
            self._stop_event.wait(timeout=self.sample_interval_sec)

    def _run_opencv(self):
        """Sample frames from a video file or RTSP stream via OpenCV."""
        try:
            import cv2
        except ImportError:
            self.error = "opencv-python-headless not installed. Run: pip install opencv-python-headless"
            log.error(self.error)
            return

        from drone_swarm.srt_parser import synthetic_gps_walk

        source = self.source
        if self._is_file and not Path(source).is_absolute():
            source = str(BASE_DIR / self.source)

        while not self._stop_event.is_set():
            cap = cv2.VideoCapture(source)
            if not cap.isOpened():
                self.error = f"Cannot open video source: {source}"
                log.error(self.error)
                # Fall back to synthetic
                self._run_synthetic()
                return

            fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 9999
            frame_idx = 0
            sample_every_n = max(1, int(fps * self.sample_interval_sec))

            log.info(f"Opened video: fps={fps:.1f} total_frames={total_frames} sample_every={sample_every_n}")

            from drone_swarm.yolo_stream import get_yolo_model
            model = get_yolo_model()

            while not self._stop_event.is_set():
                ret, bgr_frame = cap.read()
                if not ret:
                    log.info("End of video stream")
                    break

                # Only process every Nth frame
                if frame_idx % sample_every_n == 0:
                    # Convert BGR → RGB
                    rgb = cv2.cvtColor(bgr_frame, cv2.COLOR_BGR2RGB)
                    
                    # RUN YOLO
                    results = model(rgb, classes=[0], conf=0.15, verbose=False)
                    num_persons = len(results[0].boxes)
                    
                    if num_persons > 0:
                        # Get GPS from SRT or synthetic walk (only once per frame)
                        if self._srt and hasattr(self._srt, "get_frame_meta"):
                            m = self._srt.get_frame_meta(frame_idx, fps)
                            lat, lon, alt, hdg = m.lat, m.lon, m.altitude_m, m.heading_deg
                            if lat == 0.0 and lon == 0.0:
                                lat, lon, alt, hdg = synthetic_gps_walk(
                                    frame_idx, total_frames,
                                    lat_center=12.9716, lon_center=77.5946,
                                )
                        else:
                            lat, lon, alt, hdg = synthetic_gps_walk(
                                frame_idx, total_frames,
                                lat_center=12.9716, lon_center=77.5946,
                            )

                        boxes = results[0].boxes.xyxy.cpu().numpy().astype(int)
                        confs = results[0].boxes.conf.cpu().numpy()
                        
                        h, w = rgb.shape[:2]
                        pad = 20

                        for box, conf_val in zip(boxes, confs):
                            x1, y1, x2, y2 = box
                            
                            # Pad the box
                            px1 = max(0, x1 - pad)
                            py1 = max(0, y1 - pad)
                            px2 = min(w, x2 + pad)
                            py2 = min(h, y2 + pad)
                            
                            crop = rgb[py1:py2, px1:px2]
                            
                            # Skip if crop is empty
                            if crop.size == 0:
                                continue
                                
                            # Upscale by 3x for clarity and better CLIP embeddings
                            crop_resized = cv2.resize(crop, None, fx=3.0, fy=3.0, interpolation=cv2.INTER_CUBIC)
                            crop_pil = Image.fromarray(crop_resized)

                            # Process asynchronously via ThreadPoolExecutor
                            self._executor.submit(
                                self._process_frame,
                                crop_pil, 
                                lat=lat, lon=lon, altitude_m=alt, heading_deg=hdg, 
                                frame_idx=frame_idx, confidence=float(conf_val)
                            )
                    else:
                        log.info(f"Frame {frame_idx} (skip): No persons detected")

                    # Respect sample interval via sleep (approximate)
                    self._stop_event.wait(timeout=max(0.05, self.sample_interval_sec - 0.5))

                frame_idx += 1

            cap.release()
            if not self.loop or self._stop_event.is_set():
                break
            log.info("Video ended — looping ...")

    def _process_frame(
        self, img: Image.Image,
        lat: float, lon: float,
        altitude_m: float, heading_deg: float,
        frame_idx: int,
        confidence: float = 0.85,
    ):
        """Send one frame through FrameCaptureService and push SSE event."""
        self.current_lat = lat
        self.current_lon = lon

        det_id = str(uuid.uuid4())
        meta = self._capture.on_detection(
            img,
            drone_id=self.drone_id,
            lat=lat,
            lon=lon,
            altitude_m=altitude_m,
            heading_deg=heading_deg,
            confidence=round(confidence, 2),
            detection_id=det_id,
        )

        if meta:
            with self._lock:
                self.frames_processed += 1
            push_sse_event({
                "type": "frame_indexed",
                "detection": meta,
                "total": self.frames_processed,
                "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            })
            log.info(f"[{self.frames_processed}] frame indexed: lat={lat:.4f} lon={lon:.4f}")
        else:
            log.warning(f"Frame {frame_idx} failed to index")


# ─── Singleton stream (used by Flask endpoints) ───────────────────────────────
_active_stream: VideoStreamReader | None = None
_stream_lock = threading.Lock()


def get_active_stream() -> VideoStreamReader | None:
    return _active_stream


def start_stream(source: str, sample_interval: float, drone_id: str) -> VideoStreamReader:
    global _active_stream
    with _stream_lock:
        if _active_stream and _active_stream.running:
            _active_stream.stop()
        _active_stream = VideoStreamReader(
            source=source,
            sample_interval_sec=sample_interval,
            drone_id=drone_id,
        )
        _active_stream.start()
        return _active_stream


def stop_stream():
    global _active_stream
    with _stream_lock:
        if _active_stream:
            _active_stream.stop()


# ─── CLI entry point ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="DroneShield VLM video stream sampler")
    parser.add_argument("--source", default="synthetic",
                        help="Video source: 'synthetic', path/to/file.mp4, or rtsp://...")
    parser.add_argument("--interval", type=float, default=3.0,
                        help="Sample interval in seconds (default: 3)")
    parser.add_argument("--drone", default="drone-1", help="Drone ID label")
    args = parser.parse_args()

    stream = VideoStreamReader(
        source=args.source,
        sample_interval_sec=args.interval,
        drone_id=args.drone,
    )
    stream.start()
    try:
        while stream.running:
            s = stream.status()
            log.info(f"Status: frames={s['frames_processed']} fps={s['fps_estimate']} "
                     f"lat={s['current_lat']:.4f} lon={s['current_lon']:.4f}")
            time.sleep(5)
    except KeyboardInterrupt:
        log.info("Stopping ...")
        stream.stop()
