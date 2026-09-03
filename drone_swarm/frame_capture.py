"""
frame_capture.py — Triggered by YOLOv8 person-detection events.

Usage (called from ai_detector.py or standalone):
    from drone_swarm.frame_capture import FrameCaptureService
    svc = FrameCaptureService()
    svc.on_detection(frame_pil, metadata_dict)

Saves JPEG → POSTs to vlm_service /embed/image → /index.
"""

import io
import json
import logging
import time
import uuid
from pathlib import Path

import requests
from PIL import Image

log = logging.getLogger("frame_capture")

BASE_DIR = Path(__file__).resolve().parent.parent
DETECTIONS_DIR = BASE_DIR / "data" / "detections"
DETECTIONS_DIR.mkdir(parents=True, exist_ok=True)

VLM_BASE = "http://localhost:5001"


class FrameCaptureService:
    """
    Receives detection events from the drone AI pipeline,
    saves the frame, gets a CLIP embedding, and indexes it.
    """

    def __init__(self, vlm_base: str = VLM_BASE):
        self.vlm_base = vlm_base
        self._check_vlm_health()

    def _check_vlm_health(self):
        try:
            r = requests.get(f"{self.vlm_base}/health", timeout=3)
            if r.ok:
                log.info(f"VLM service healthy: {r.json()}")
            else:
                log.warning("VLM service returned non-OK response")
        except Exception:
            log.warning(
                "VLM service not reachable at startup — will retry on first capture"
            )

    def on_detection(
        self,
        frame: Image.Image,
        *,
        drone_id: str = "drone-unknown",
        lat: float = 0.0,
        lon: float = 0.0,
        altitude_m: float = 0.0,
        heading_deg: float = 0.0,
        confidence: float = 0.0,
        detection_id: str | None = None,
    ) -> dict | None:
        """
        Full pipeline:
          1. Save JPEG to disk
          2. Get CLIP embedding from VLM service
          3. Index embedding + metadata

        Returns the indexed metadata dict, or None on failure.
        """
        det_id = detection_id or str(uuid.uuid4())
        image_filename = f"{det_id}.jpg"
        image_path = DETECTIONS_DIR / image_filename
        rel_path = f"data/detections/{image_filename}"

        # 1. Save frame
        try:
            frame_rgb = frame.convert("RGB")
            frame_rgb.save(str(image_path), "JPEG", quality=85)
            log.info(f"Saved frame: {image_path}")
        except Exception as e:
            log.error(f"Failed to save frame: {e}")
            return None

        # 2. Get embedding
        try:
            buf = io.BytesIO()
            frame_rgb.save(buf, "JPEG")
            buf.seek(0)
            resp = requests.post(
                f"{self.vlm_base}/embed/image",
                files={"file": ("frame.jpg", buf, "image/jpeg")},
                timeout=30,
            )
            resp.raise_for_status()
            embedding = resp.json()["embedding"]
        except Exception as e:
            log.error(f"Failed to get embedding from VLM service: {e}")
            return None

        # 3. Index
        metadata = {
            "id": det_id,
            "drone_id": drone_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "image_path": rel_path,
            "lat": lat,
            "lon": lon,
            "altitude_m": altitude_m,
            "heading_deg": heading_deg,
            "confidence": confidence,
        }
        try:
            resp = requests.post(
                f"{self.vlm_base}/index",
                json={"embedding": embedding, "metadata": metadata},
                timeout=10,
            )
            resp.raise_for_status()
            log.info(f"Indexed detection {det_id} (total: {resp.json().get('total')})")
            return metadata
        except Exception as e:
            log.error(f"Failed to index detection: {e}")
            return None
