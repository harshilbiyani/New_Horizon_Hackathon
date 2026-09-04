"""
demo_ingest.py — Generates 20 synthetic drone-camera frames and ingests
them into the VLM FAISS index for a zero-hardware demo.

Run:
    python drone_swarm/demo_ingest.py

Requires vlm_service.py to be running on port 5001.
"""

import io
import math
import random
import sys
import time
import uuid
import logging
from pathlib import Path

import requests
from PIL import Image, ImageDraw, ImageFont

logging.basicConfig(
    level=logging.INFO,
    format="[demo_ingest] %(asctime)s %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("demo_ingest")

VLM_BASE = "http://localhost:5001"
BASE_DIR = Path(__file__).resolve().parent.parent
DETECTIONS_DIR = BASE_DIR / "data" / "detections"
DETECTIONS_DIR.mkdir(parents=True, exist_ok=True)

# ─── Synthetic scene descriptions ─────────────────────────────────────────────
SCENES = [
    {
        "desc": "Person in red jacket standing near water body",
        "bg": (20, 60, 100),       # dark blue water
        "person_color": (180, 30, 30),
        "label": "red_jacket_water",
    },
    {
        "desc": "Man in white t-shirt on open field",
        "bg": (80, 140, 60),       # green grass
        "person_color": (230, 230, 230),
        "label": "white_tshirt_field",
    },
    {
        "desc": "Child in yellow raincoat on road",
        "bg": (60, 60, 60),        # asphalt
        "person_color": (220, 200, 30),
        "label": "yellow_raincoat_road",
    },
    {
        "desc": "Group of people in orange vests at construction site",
        "bg": (140, 110, 70),      # dirt/sand
        "person_color": (210, 100, 20),
        "label": "orange_vest_construction",
    },
    {
        "desc": "Woman in blue dress walking through forest",
        "bg": (30, 80, 30),        # dark forest
        "person_color": (50, 80, 180),
        "label": "blue_dress_forest",
    },
    {
        "desc": "Survivor waving arms in open terrain",
        "bg": (190, 170, 120),     # desert/dry land
        "person_color": (200, 150, 100),
        "label": "survivor_waving_terrain",
    },
    {
        "desc": "Person in dark clothing crouching near debris",
        "bg": (80, 70, 70),        # rubble/grey
        "person_color": (40, 40, 50),
        "label": "dark_clothing_debris",
    },
    {
        "desc": "Elderly person with walking stick on path",
        "bg": (120, 100, 80),      # dirt path
        "person_color": (160, 120, 80),
        "label": "elderly_path",
    },
    {
        "desc": "Rescue team member in green uniform",
        "bg": (50, 90, 50),        # vegetation
        "person_color": (40, 110, 40),
        "label": "green_uniform_rescue",
    },
    {
        "desc": "Injured person lying on rooftop",
        "bg": (90, 90, 90),        # rooftop
        "person_color": (200, 160, 120),
        "label": "injured_rooftop",
    },
]


def generate_frame(scene: dict, width=640, height=480) -> Image.Image:
    """
    Creates a synthetic aerial-ish JPEG frame:
    - Solid background (terrain color)
    - Gradient noise for realism
    - Stylised person silhouette
    - Metadata text overlay
    """
    rng = random.Random(scene["label"])
    img = Image.new("RGB", (width, height), scene["bg"])
    draw = ImageDraw.Draw(img)

    # Terrain texture — random darker patches
    for _ in range(60):
        rx = rng.randint(0, width)
        ry = rng.randint(0, height)
        r_w = rng.randint(20, 120)
        r_h = rng.randint(10, 60)
        shade = tuple(max(0, c - rng.randint(10, 40)) for c in scene["bg"])
        draw.ellipse([rx, ry, rx + r_w, ry + r_h], fill=shade)

    # Person silhouette (simple rectangle + circle = body + head)
    px = width // 2 + rng.randint(-80, 80)
    py = height // 2 + rng.randint(-60, 60)
    body_w, body_h = 30, 60
    head_r = 14
    pc = scene["person_color"]
    # Shadow
    draw.ellipse([px - 2, py + body_h - 4, px + body_w + 2, py + body_h + 8], fill=(0, 0, 0, 120))
    # Body
    draw.rectangle([px, py, px + body_w, py + body_h], fill=pc)
    # Head
    draw.ellipse(
        [px + body_w // 2 - head_r, py - head_r * 2, px + body_w // 2 + head_r, py],
        fill=(220, 180, 140),
    )
    # Arms
    draw.rectangle([px - 10, py + 5, px, py + 40], fill=pc)
    draw.rectangle([px + body_w, py + 5, px + body_w + 10, py + 40], fill=pc)
    # Legs
    draw.rectangle([px + 2, py + body_h, px + 13, py + body_h + 30], fill=pc)
    draw.rectangle([px + 17, py + body_h, px + body_w - 2, py + body_h + 30], fill=pc)

    # Detection bounding box
    box_pad = 20
    box_x0 = max(0, px - box_pad)
    box_y0 = max(0, py - head_r * 2 - box_pad)
    box_x1 = min(width - 1, px + body_w + box_pad)
    box_y1 = min(height - 1, py + body_h + 30 + box_pad)
    draw.rectangle([box_x0, box_y0, box_x1, box_y1], outline=(0, 255, 200), width=2)
    draw.text((box_x0 + 4, box_y0 + 4), "PERSON", fill=(0, 255, 200))

    return img


def ingest_scenes():
    # Health check
    try:
        r = requests.get(f"{VLM_BASE}/health", timeout=5)
        if not r.ok:
            log.error("VLM service health check failed. Is vlm_service.py running?")
            sys.exit(1)
        log.info(f"VLM service OK — {r.json()}")
    except Exception as e:
        log.error(f"Cannot reach VLM service at {VLM_BASE}: {e}")
        log.error("Start it first: python drone_swarm/vlm_service.py")
        sys.exit(1)

    # Use 2 copies of each scene for 20 total
    all_scenes = SCENES * 2
    random.shuffle(all_scenes)

    lat_base, lon_base = 12.9716, 77.5946
    drone_ids = ["drone-1", "drone-2", "drone-3", "drone-4", "drone-5"]

    log.info(f"Ingesting {len(all_scenes)} synthetic frames ...")
    success = 0

    for i, scene in enumerate(all_scenes):
        det_id = str(uuid.uuid4())
        img = generate_frame(scene)

        # Save JPEG
        img_path = DETECTIONS_DIR / f"{det_id}.jpg"
        img.save(str(img_path), "JPEG", quality=88)

        # Embed
        buf = io.BytesIO()
        img.save(buf, "JPEG")
        buf.seek(0)
        try:
            r = requests.post(
                f"{VLM_BASE}/embed/image",
                files={"file": ("frame.jpg", buf, "image/jpeg")},
                timeout=30,
            )
            r.raise_for_status()
            embedding = r.json()["embedding"]
        except Exception as e:
            log.warning(f"  [{i+1}] embed failed: {e}")
            continue

        # Metadata
        angle = (i / len(all_scenes)) * 2 * math.pi
        lat = lat_base + 0.01 * math.sin(angle) + random.uniform(-0.002, 0.002)
        lon = lon_base + 0.01 * math.cos(angle) + random.uniform(-0.002, 0.002)
        metadata = {
            "id": det_id,
            "drone_id": random.choice(drone_ids),
            "timestamp": time.strftime(
                "%Y-%m-%dT%H:%M:%SZ",
                time.gmtime(time.time() - random.randint(0, 3600)),
            ),
            "image_path": f"data/detections/{det_id}.jpg",
            "lat": round(lat, 6),
            "lon": round(lon, 6),
            "altitude_m": round(random.uniform(30, 120), 1),
            "heading_deg": round(random.uniform(0, 360), 1),
            "confidence": round(random.uniform(0.60, 0.98), 2),
            "scene_label": scene["label"],
            "description": scene["desc"],
        }

        # Index
        try:
            r = requests.post(
                f"{VLM_BASE}/index",
                json={"embedding": embedding, "metadata": metadata},
                timeout=10,
            )
            r.raise_for_status()
            total = r.json().get("total", "?")
            log.info(f"  [{i+1:02d}/{len(all_scenes)}] ✓ {scene['label']} → total={total}")
            success += 1
        except Exception as e:
            log.warning(f"  [{i+1}] index failed: {e}")

    log.info(f"\nDemo ingest complete: {success}/{len(all_scenes)} frames indexed ✓")
    log.info("Now open the app at http://localhost:5173/search and try searching!")


if __name__ == "__main__":
    ingest_scenes()
