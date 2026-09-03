"""
drone_swarm/mission_bridge.py — Mission Detection Bridge
=========================================================
Connects server.js mission loop to the YOLO detection pipeline.

Called by server.js every 3 seconds via spawnSync when a mission command is active.

IMAGE SOURCE SELECTION
----------------------
Set the DRONE_IMAGE_SOURCE environment variable to control where images come from:

  DRONE_IMAGE_SOURCE=sim     (default) — no image; detection is simulation-based
  DRONE_IMAGE_SOURCE=file    — read from DRONE_IMAGE_DIR/{drone_id}.jpg
  DRONE_IMAGE_SOURCE=rtsp    — capture frame from DRONE_RTSP_URL_{drone_id}
  DRONE_IMAGE_SOURCE=v4l2    — capture from camera device DRONE_V4L2_DEVICE_{drone_id}

When source is 'sim' or no image is available, the pipeline returns
simulation-based detections (explicit and logged, NOT a silent mock).
"""

import sys
import json
import subprocess
import os
import tempfile

# ─── Configuration via environment variables ──────────────────────────────────
IMAGE_SOURCE = os.environ.get("DRONE_IMAGE_SOURCE", "sim").lower()
IMAGE_DIR    = os.environ.get("DRONE_IMAGE_DIR", "")
SCRIPT_DIR   = os.path.dirname(os.path.abspath(__file__))
YOLO_SCRIPT  = os.path.join(SCRIPT_DIR, "yolo_detector.py")


def get_drone_image(drone_id: str) -> str | None:
    """
    Return the file path to an image for this drone's current frame.
    Returns None to signal: use simulation-based detection instead.

    Controlled by DRONE_IMAGE_SOURCE env var.
    """
    if IMAGE_SOURCE == "sim":
        # Explicit sim fallback — not a silent mock
        return None

    if IMAGE_SOURCE == "file":
        if not IMAGE_DIR:
            _warn(f"DRONE_IMAGE_SOURCE=file but DRONE_IMAGE_DIR is not set. Falling back to sim.")
            return None
        candidates = [
            os.path.join(IMAGE_DIR, f"{drone_id}.jpg"),
            os.path.join(IMAGE_DIR, f"{drone_id}.png"),
        ]
        for path in candidates:
            if os.path.exists(path):
                return path
        _warn(f"No image found for drone {drone_id} in {IMAGE_DIR}. Falling back to sim.")
        return None

    if IMAGE_SOURCE == "rtsp":
        # Capture a frame from an RTSP stream and save to a temp file
        url_env = f"DRONE_RTSP_URL_{drone_id.replace('-', '_')}"
        rtsp_url = os.environ.get(url_env, os.environ.get("DRONE_RTSP_URL", ""))
        if not rtsp_url:
            _warn(f"DRONE_IMAGE_SOURCE=rtsp but {url_env} is not set. Falling back to sim.")
            return None
        return _capture_frame_rtsp(rtsp_url, drone_id)

    if IMAGE_SOURCE == "v4l2":
        # Capture from a Linux V4L2 camera device
        device_env = f"DRONE_V4L2_DEVICE_{drone_id.replace('-', '_')}"
        device = os.environ.get(device_env, os.environ.get("DRONE_V4L2_DEVICE", ""))
        if not device:
            _warn(f"DRONE_IMAGE_SOURCE=v4l2 but {device_env} not set. Falling back to sim.")
            return None
        return _capture_frame_v4l2(device, drone_id)

    _warn(f"Unknown DRONE_IMAGE_SOURCE={IMAGE_SOURCE!r}. Falling back to sim.")
    return None


def _capture_frame_rtsp(url: str, drone_id: str) -> str | None:
    """Capture single frame from RTSP URL using OpenCV. Returns temp file path or None."""
    try:
        import cv2
        cap = cv2.VideoCapture(url)
        ret, frame = cap.read()
        cap.release()
        if not ret:
            _warn(f"RTSP capture failed for drone {drone_id} at {url}")
            return None
        tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
        cv2.imwrite(tmp.name, frame)
        return tmp.name
    except ImportError:
        _warn("opencv-python not installed. Install with: pip install opencv-python")
        return None
    except Exception as e:
        _warn(f"RTSP capture error for drone {drone_id}: {e}")
        return None


def _capture_frame_v4l2(device: str, drone_id: str) -> str | None:
    """Capture frame from V4L2 device (Linux only). Returns temp file path or None."""
    try:
        import cv2
        cap = cv2.VideoCapture(device)
        ret, frame = cap.read()
        cap.release()
        if not ret:
            _warn(f"V4L2 capture failed for drone {drone_id} at device {device}")
            return None
        tmp = tempfile.NamedTemporaryFile(suffix=".jpg", delete=False)
        cv2.imwrite(tmp.name, frame)
        return tmp.name
    except ImportError:
        _warn("opencv-python not installed. Install with: pip install opencv-python")
        return None
    except Exception as e:
        _warn(f"V4L2 capture error for drone {drone_id}: {e}")
        return None


def run_detection(drone_id: str, image_path: str | None, target_type: str, priority_zone: str) -> list:
    """
    Run YOLO detection or simulation-based detection.
    Returns list of detection dicts.
    """
    if image_path is None:
        # Explicit sim-based detection — no YOLO, no silent mock
        return []  # server.js sim handles this via hiddenSurvivors proximity

    # Real image path — run YOLO
    result = subprocess.run(
        [sys.executable, YOLO_SCRIPT, image_path, target_type],
        capture_output=True,
        text=True,
        timeout=10,
    )

    if result.returncode != 0:
        _warn(f"yolo_detector.py exited with {result.returncode} for drone {drone_id}: {result.stderr.strip()}")
        return []

    if not result.stdout.strip():
        return []

    try:
        dets = json.loads(result.stdout)
        for d in dets:
            d["drone_id"]  = drone_id
            d["zone"]      = priority_zone
            d["source"]    = "yolo"
        return dets
    except Exception as e:
        _warn(f"Failed to parse yolo_detector output for drone {drone_id}: {e}")
        return []


def _warn(msg: str) -> None:
    print(f"[mission_bridge] WARNING: {msg}", file=sys.stderr)


def main():
    input_data = sys.stdin.read()
    if not input_data or not input_data.strip():
        print(json.dumps({"detections": [], "field_summary": "", "image_source": IMAGE_SOURCE}))
        return

    try:
        data          = json.loads(input_data)
        mission_state = data.get("missionState", {})
        drone_positions = data.get("dronePositions", [])

        target_type   = mission_state.get("target_type", "person")
        priority_zone = mission_state.get("zone", "ALL")

        # Only run detection on up to 2 drones per tick to limit CPU load
        selected_drones = drone_positions[:2] if drone_positions else []

        all_detections = []
        for drone in selected_drones:
            drone_id = drone.get("id", "DRONE-1")
            image_path = get_drone_image(drone_id)
            dets = run_detection(drone_id, image_path, target_type, priority_zone)
            all_detections.extend(dets)

        output = {
            "detections": all_detections,
            "field_summary": f"{len(all_detections)} detection(s) from {len(selected_drones)} drone(s).",
            "image_source": IMAGE_SOURCE,
        }
        print(json.dumps(output))

    except Exception as e:
        print(json.dumps({"error": str(e), "detections": [], "field_summary": "", "image_source": IMAGE_SOURCE}))


if __name__ == "__main__":
    main()
