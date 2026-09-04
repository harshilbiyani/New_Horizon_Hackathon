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

        # 1. Convert frame to JPEG bytes
        try:
            frame_rgb = frame.convert("RGB")
            buf = io.BytesIO()
            frame_rgb.save(buf, "JPEG", quality=85)
            frame_bytes = buf.getvalue()
        except Exception as e:
            log.error(f"Failed to encode frame: {e}")
            return None

        # 2. Upload to Cloudinary
        try:
            import cloudinary
            import cloudinary.uploader
            import os
            from dotenv import load_dotenv
            load_dotenv()
            
            cloudinary.config(
              cloud_name = os.getenv("VITE_CLOUDINARY_CLOUD_NAME"),
              api_key = os.getenv("VITE_CLOUDINARY_API_KEY"),
              api_secret = os.getenv("VITE_CLOUDINARY_API_SECRET"),
              secure = True
            )
            
            resp_cloud = cloudinary.uploader.upload(
                frame_bytes,
                public_id=f"drone_shield/detections/{det_id}",
                resource_type="image"
            )
            cloud_url = resp_cloud.get("secure_url")
            log.info(f"Uploaded to Cloudinary: {cloud_url}")
        except Exception as e:
            log.error(f"Cloudinary upload failed: {e}")
            return None

        # 3. Get embedding
        try:
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

        # 4. Index
        metadata = {
            "id": det_id,
            "drone_id": drone_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "image_path": cloud_url,
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
