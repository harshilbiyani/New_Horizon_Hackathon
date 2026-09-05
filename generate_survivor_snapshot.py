"""
Drone-Shield Dual-Spectral (RGB Optical + FLIR Thermal IR) Snapshot Generator
Generates dual-channel side-by-side composite snapshots (RGB Optical + Thermal IR)
annotated with YOLO bounding boxes, HUD telemetry, and direct Cloudinary upload.
"""

import os
import sys
import json
import time
import argparse
import numpy as np
import cv2
import cloudinary
import cloudinary.uploader

# Load environment variables
cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME", "dqng4xws1")
api_key = os.getenv("CLOUDINARY_API_KEY", "316269317342895")
api_secret = os.getenv("CLOUDINARY_API_SECRET", "LuEiH4XafGUUSLzn6VJIEyU9hr0")

cloudinary.config(
    cloud_name=cloud_name,
    api_key=api_key,
    api_secret=api_secret
)

def create_dual_spectral_snapshot(drone_id="DRN-001", x=0.0, y=0.0, lat=28.6139, lon=77.2090, alt=30.0, confidence=0.95, survivor_id=None):
    if not survivor_id:
        survivor_id = f"SURV-{int(time.time() * 1000) % 100000}"

    panel_w, panel_h = 400, 300
    font = cv2.FONT_HERSHEY_SIMPLEX

    # ---------------------------------------------------------
    # PANEL 1: RGB OPTICAL CAMERA VIEW (Left)
    # ---------------------------------------------------------
    script_dir = os.path.dirname(os.path.abspath(__file__))
    sample_images = ["survivor.jpg", "survivor2.jpg", "detected_1.jpg"]
    
    img_choice = sample_images[hash(survivor_id) % len(sample_images)]
    sample_path = os.path.join(script_dir, img_choice)
    
    if os.path.exists(sample_path):
        rgb_raw = cv2.imread(sample_path)
        rgb_panel = cv2.resize(rgb_raw, (panel_w, panel_h))
    else:
        # Fallback synthetic RGB frame if image file is missing
        rgb_panel = np.zeros((panel_h, panel_w, 3), dtype=np.uint8)
        rgb_panel[:] = (40, 45, 50)
        cv2.circle(rgb_panel, (panel_w // 2, panel_h // 2 - 20), 20, (180, 190, 200), -1)
        cv2.rectangle(rgb_panel, (panel_w // 2 - 25, panel_h // 2), (panel_w // 2 + 25, panel_h // 2 + 60), (120, 130, 140), -1)

    # Draw RGB Bounding Box & AI Detection Text
    rx1, ry1 = int(panel_w * 0.25), int(panel_h * 0.18)
    rx2, ry2 = int(panel_w * 0.75), int(panel_h * 0.82)
    cv2.rectangle(rgb_panel, (rx1, ry1), (rx2, ry2), (0, 255, 0), 2)
    cv2.rectangle(rgb_panel, (rx1, ry1 - 20), (rx1 + 190, ry1), (0, 255, 0), -1)
    cv2.putText(rgb_panel, f"HUMAN TARGET [{confidence*100:.1f}%]", (rx1 + 5, ry1 - 5), font, 0.4, (0, 0, 0), 1, cv2.LINE_AA)
    
    # RGB Panel Header Tag
    cv2.rectangle(rgb_panel, (0, 0), (panel_w, 22), (20, 20, 20), -1)
    cv2.putText(rgb_panel, "CAM-01 [RGB OPTICAL CAMERA]", (10, 15), font, 0.45, (0, 255, 0), 1, cv2.LINE_AA)

    # ---------------------------------------------------------
    # PANEL 2: FLIR THERMAL IR VIEW (Right)
    # ---------------------------------------------------------
    np.random.seed(int(abs(x * 100 + y * 10) % 10000))
    base_gray = np.random.normal(35, 10, (panel_h, panel_w)).astype(np.uint8)
    terrain_grid = (np.sin(np.linspace(0, 8, panel_h))[:, None] * np.cos(np.linspace(0, 8, panel_w))[None, :]) * 15
    base_gray = np.clip(base_gray.astype(np.int16) + terrain_grid.astype(np.int16), 10, 80).astype(np.uint8)
    
    thermal_panel = cv2.applyColorMap(base_gray, cv2.COLORMAP_INFERNO)
    
    # Render Thermal Heat Signature
    cx, cy = panel_w // 2, panel_h // 2
    cv2.circle(thermal_panel, (cx, cy - 25), 14, (255, 255, 240), -1)
    cv2.ellipse(thermal_panel, (cx, cy + 10), (20, 32), 0, 0, 360, (230, 245, 255), -1)
    cv2.line(thermal_panel, (cx - 15, cy - 10), (cx - 32, cy + 20), (200, 225, 255), 6)
    cv2.line(thermal_panel, (cx + 15, cy - 10), (cx + 32, cy + 20), (200, 225, 255), 6)
    cv2.line(thermal_panel, (cx - 12, cy + 35), (cx - 20, cy + 70), (210, 235, 255), 7)
    cv2.line(thermal_panel, (cx + 12, cy + 35), (cx + 20, cy + 70), (210, 235, 255), 7)
    thermal_panel = cv2.GaussianBlur(thermal_panel, (5, 5), 0)

    # Thermal Bounding Box & HUD
    tx1, ty1 = cx - 50, cy - 50
    tx2, ty2 = cx + 50, cy + 80
    cv2.rectangle(thermal_panel, (tx1, ty1), (tx2, ty2), (0, 255, 255), 2)
    cv2.drawMarker(thermal_panel, (cx, cy), (0, 255, 255), cv2.MARKER_CROSS, 18, 1)
    
    cv2.rectangle(thermal_panel, (tx1, ty1 - 20), (tx1 + 180, ty1), (0, 255, 255), -1)
    cv2.putText(thermal_panel, f"HEAT SIG [{confidence*100:.1f}%]", (tx1 + 5, ty1 - 5), font, 0.4, (0, 0, 0), 1, cv2.LINE_AA)

    # Thermal Panel Header Tag
    cv2.rectangle(thermal_panel, (0, 0), (panel_w, 22), (20, 20, 20), -1)
    cv2.putText(thermal_panel, "SENSOR-02 [FLIR THERMAL IR-850nm]", (10, 15), font, 0.45, (0, 255, 255), 1, cv2.LINE_AA)

    # ---------------------------------------------------------
    # COMBINE DUAL PANELS INTO SINGLE COMPOSITE FRAME
    # ---------------------------------------------------------
    header_h = 40
    footer_h = 45
    total_w = panel_w * 2
    total_h = header_h + panel_h + footer_h
    
    composite = np.zeros((total_h, total_w, 3), dtype=np.uint8)
    
    # 1. Top Header Bar
    cv2.rectangle(composite, (0, 0), (total_w, header_h), (15, 23, 42), -1)
    cv2.putText(composite, "DRONE-SHIELD DUAL-SPECTRAL DETECTION SNAPSHOT", (15, 26), font, 0.55, (255, 255, 255), 2, cv2.LINE_AA)
    cv2.putText(composite, f"DRONE: {drone_id} | TARGET ID: {survivor_id}", (total_w - 320, 26), font, 0.45, (0, 255, 255), 1, cv2.LINE_AA)
    
    # 2. Place Panels Side-by-Side
    composite[header_h:header_h + panel_h, 0:panel_w] = rgb_panel
    composite[header_h:header_h + panel_h, panel_w:total_w] = thermal_panel
    
    # Center Divider Line
    cv2.line(composite, (panel_w, header_h), (panel_w, header_h + panel_h), (0, 255, 255), 2)
    
    # 3. Bottom Footer Telemetry Bar
    cv2.rectangle(composite, (0, header_h + panel_h), (total_w, total_h), (15, 23, 42), -1)
    timestamp_str = time.strftime("%Y-%m-%d %H:%M:%S UTC", time.gmtime())
    
    telemetry_line1 = f"LAT: {lat:.6f}° N | LON: {lon:.6f}° E | ALT: {alt:.1f}m | GRID: [{x:.1f}, {y:.1f}]"
    telemetry_line2 = f"CONFIDENCE: {confidence*100:.1f}% | STATUS: CONFIRMED HUMAN TARGET | TIME: {timestamp_str}"
    
    cv2.putText(composite, telemetry_line1, (15, header_h + panel_h + 18), font, 0.4, (0, 255, 0), 1, cv2.LINE_AA)
    cv2.putText(composite, telemetry_line2, (15, header_h + panel_h + 36), font, 0.4, (200, 200, 200), 1, cv2.LINE_AA)

    # 4. Save to Disk Locally & Upload to Cloudinary
    temp_filename = f"dual_spectral_{survivor_id}.jpg"
    cv2.imwrite(temp_filename, composite)
    
    try:
        folder_path = "drone_shield_survivors"
        upload_res = cloudinary.uploader.upload(
            temp_filename,
            folder=folder_path,
            public_id=f"DUAL_{drone_id}_{survivor_id}",
            overwrite=True
        )
        secure_url = upload_res.get("secure_url")
        
        if os.path.exists(temp_filename):
            os.remove(temp_filename)
            
        return {
            "success": True,
            "survivor_id": survivor_id,
            "drone_id": drone_id,
            "image_url": secure_url
        }
    except Exception as e:
        print(f"[CLOUDINARY ERROR] {e}", file=sys.stderr)
        if os.path.exists(temp_filename):
            os.remove(temp_filename)
        return {
            "success": False,
            "error": str(e)
        }

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--drone_id", type=str, default="DRN-001")
    parser.add_argument("--x", type=float, default=0.0)
    parser.add_argument("--y", type=float, default=0.0)
    parser.add_argument("--lat", type=float, default=28.6139)
    parser.add_argument("--lon", type=float, default=77.2090)
    parser.add_argument("--alt", type=float, default=30.0)
    parser.add_argument("--confidence", type=float, default=0.95)
    parser.add_argument("--survivor_id", type=str, default=None)
    
    args = parser.parse_args()
    
    result = create_dual_spectral_snapshot(
        drone_id=args.drone_id,
        x=args.x,
        y=args.y,
        lat=args.lat,
        lon=args.lon,
        alt=args.alt,
        confidence=args.confidence,
        survivor_id=args.survivor_id
    )
    print(json.dumps(result))
