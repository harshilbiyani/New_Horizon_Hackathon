"""
drone_swarm/yolo_detector.py — YOLO Object Detection
=====================================================
Called by mission_bridge.py with a real image path.

IMPORTANT: This script is ONLY called when a real image is available.
           Do NOT add silent mocks for missing images here.
           If the image doesn't exist, exit with an empty detection list
           and a clear warning to stderr so operators know there's a problem.

OUTPUT FORMAT (stdout, one JSON array):
    [{"class_name": "person", "confidence": 0.88, "bbox": [x1,y1,x2,y2], "matched": true}, ...]

USAGE:
    python yolo_detector.py <image_path> <target_type>
    python yolo_detector.py frame_drone_1.jpg person
    python yolo_detector.py /tmp/cam_frame.jpg fire

MODEL SELECTION:
    Set YOLO_MODEL env var to use a different model:
      YOLO_MODEL=yolov8n.pt   (default, fastest, ~6MB)
      YOLO_MODEL=yolov8s.pt   (small, more accurate)
      YOLO_MODEL=yolov8m.pt   (medium, even more accurate, ~50MB)
    For Jetson Nano: export YOLO_MODEL=yolov8n.pt and use TensorRT export for ~2-3x speedup.
"""

import sys
import json
import argparse
import os

YOLO_MODEL_PATH = os.environ.get("YOLO_MODEL", "yolov8n.pt")
YOLO_CONFIDENCE_THRESHOLD = float(os.environ.get("YOLO_CONFIDENCE", "0.45"))

# Class name mappings for common COCO classes relevant to search-and-rescue
TARGET_CLASS_MAP = {
    "person": {"person"},
    "kid":    {"person"},           # YOLO doesn't distinguish adults/kids — use size heuristic
    "fire":   {"fire", "flame"},    # Only in fire-trained models; COCO doesn't include fire
}

try:
    from ultralytics import YOLO
    _yolo_available = True
except ImportError:
    _yolo_available = False


def run_yolo(image_path: str, target_type: str) -> list:
    """
    Run YOLO detection on the given image.

    Returns:
        List of detection dicts. Empty list if no detections or YOLO unavailable.
    """
    # Guard: explicit failure if image doesn't exist
    if not os.path.exists(image_path):
        print(
            f"[yolo_detector] ERROR: image not found at '{image_path}'. "
            f"No detection performed. Set DRONE_IMAGE_SOURCE=sim to use simulation-based detection.",
            file=sys.stderr
        )
        return []

    if not _yolo_available:
        print(
            "[yolo_detector] WARNING: ultralytics not installed. "
            "Install with: pip install ultralytics\n"
            "No YOLO detection performed for this frame.",
            file=sys.stderr
        )
        return []

    target_classes = TARGET_CLASS_MAP.get(target_type, {"person"})

    try:
        model = YOLO(YOLO_MODEL_PATH)
        results = model(image_path, verbose=False, conf=YOLO_CONFIDENCE_THRESHOLD)

        detections = []
        for r in results:
            for box in r.boxes:
                cls_id     = int(box.cls[0].item())
                conf       = float(box.conf[0].item())
                coords     = box.xyxy[0].tolist()
                class_name = model.names[cls_id]

                matched = class_name.lower() in target_classes

                if matched:
                    det = {
                        "class_name": class_name,
                        "confidence": round(conf, 4),
                        "bbox":       [round(v, 1) for v in coords],
                        "matched":    True,
                    }
                    # Heuristic for kids: bbox height < 60% of frame height
                    if target_type == "kid" and class_name == "person":
                        h = r.orig_shape[0] if hasattr(r, "orig_shape") else 1000
                        bbox_h = coords[3] - coords[1]
                        det["is_likely_child"] = bbox_h < h * 0.6

                    detections.append(det)

        return detections

    except Exception as e:
        print(f"[yolo_detector] ERROR during inference: {e}", file=sys.stderr)
        return []


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Run YOLO detection on a drone camera frame."
    )
    parser.add_argument("image_path",  help="Path to the image file to analyze")
    parser.add_argument("target_type", help="Target class to search for: person | kid | fire")
    args = parser.parse_args()

    dets = run_yolo(args.image_path, args.target_type)
    print(json.dumps(dets))
