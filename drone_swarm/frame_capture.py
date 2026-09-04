"""
frame_capture.py - Real-time Ingestion & Storage Pipeline with Zero-Disk Footprint

Processes YOLOv8 person-detection events:
  1. Encodes detected person crop in-memory (BytesIO).
  2. Uploads crop to Cloudinary secure cloud storage.
  3. Obtains CLIP ViT-B/32 vision-language embedding.
  4. Indexes embedding + drone GPS telemetry in FAISS vector database.
  5. Automatically purges/deletes any local detection images from disk
     to ensure zero disk bloat.
"""

import io
import json
import logging
import os
import time
import uuid
from pathlib import Path
import threading
import queue

import requests
from PIL import Image
from dotenv import load_dotenv

load_dotenv()

log = logging.getLogger("frame_capture")

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DETECTIONS_DIR = DATA_DIR / "detections"
DETECTIONS_DIR.mkdir(parents=True, exist_ok=True)

VLM_BASE = os.getenv("VLM_BASE", "http://localhost:5001")


def clean_local_detections():
    """Purges any lingering local detection images from disk to keep module lightweight."""
    try:
        for f in list(DETECTIONS_DIR.glob("*.jpg")) + list(DETECTIONS_DIR.glob("*.png")):
            try:
                f.unlink(missing_ok=True)
            except Exception:
                pass
    except Exception as e:
        log.warning(f"Error cleaning detections folder: {e}")


class FrameCaptureService:
    """
    Receives detection events from drone AI pipeline,
    uploads to Cloudinary, computes CLIP embeddings, indexes into FAISS,
    and ensures no local files remain on disk.
    """

    def __init__(self, vlm_base: str = VLM_BASE):
        self.vlm_base = vlm_base
        self._check_vlm_health()
        # Clean local storage on service initialization
        clean_local_detections()

    def _check_vlm_health(self):
        try:
            r = requests.get(f"{self.vlm_base}/health", timeout=3)
            if r.ok:
                log.info(f"VLM service healthy: {r.json()}")
            else:
                log.warning("VLM service returned non-OK response")
        except Exception:
            log.warning("VLM service not reachable at startup - will retry on first capture")

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
        In-memory processing pipeline:
          1. Encode frame crop to JPEG bytes in memory (no disk file)
          2. Upload to Cloudinary CDN
          3. Get CLIP ViT-B/32 embedding from VLM service
          4. Index embedding + drone GPS metadata in FAISS
          5. Immediately ensure local detection folder remains clean

        Returns the indexed metadata dict, or None on failure.
        """
        det_id = detection_id or str(uuid.uuid4())

        # 1. Convert frame to JPEG bytes in memory (zero disk write)
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
            
            cloudinary.config(
                cloud_name=os.getenv("VITE_CLOUDINARY_CLOUD_NAME"),
                api_key=os.getenv("VITE_CLOUDINARY_API_KEY"),
                api_secret=os.getenv("VITE_CLOUDINARY_API_SECRET"),
                secure=True
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

        # 3. Get CLIP embedding from VLM service
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

        # 4. Index metadata & embedding in FAISS vector database
        metadata = {
            "id": det_id,
            "drone_id": drone_id,
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "image_path": cloud_url,  # Cloudinary public CDN URL
            "lat": lat,
            "lon": lon,
            "altitude_m": altitude_m,
            "heading_deg": heading_deg,
            "confidence": confidence,
            "is_simulated_gps": True,
        }
        try:
            resp = requests.post(
                f"{self.vlm_base}/index",
                json={"embedding": embedding, "metadata": metadata},
                timeout=10,
            )
            resp.raise_for_status()
            log.info(f"Indexed detection {det_id} (total: {resp.json().get('total')})")
            
            # 5. Ensure local disk cleanup
            clean_local_detections()
            
            return metadata
        except Exception as e:
            log.error(f"Failed to index detection: {e}")
            return None
