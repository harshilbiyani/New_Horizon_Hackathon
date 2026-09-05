import os
import sys
import json
import time
import requests
import cloudinary
import cloudinary.uploader
from ultralytics import YOLO

# Cloudinary configuration from environment variables
cloud_name = os.getenv("CLOUDINARY_CLOUD_NAME", "dqng4xws1")
api_key = os.getenv("CLOUDINARY_API_KEY", "316269317342895")
api_secret = os.getenv("CLOUDINARY_API_SECRET", "")

if cloud_name and api_key and api_secret:
    cloudinary.config(
        cloud_name=cloud_name,
        api_key=api_key,
        api_secret=api_secret
    )
else:
    print("WARNING: Cloudinary credentials missing from environment.")

def run_detection(drone_id, image_path, lat, lon):
    print(f"Running YOLO detection on {image_path} for {drone_id}...")
    
    if not os.path.exists(image_path):
        print(f"ERROR: Image {image_path} not found.")
        return

    try:
        model = YOLO("yolov8n.pt")
        # Run inference
        results = model(image_path, verbose=False, conf=0.45)
        
        found_person = False
        # Create an annotated image with bounding boxes
        for r in results:
            for box in r.boxes:
                cls_id = int(box.cls[0].item())
                class_name = model.names[cls_id]
                if class_name == "person":
                    found_person = True
                    break
        
        if found_person:
            print("Survivor found! Annotating and uploading to Cloudinary...")
            # Save the annotated frame
            annotated_frame = results[0].plot()
            annotated_path = f"detected_{drone_id}.jpg"
            import cv2
            cv2.imwrite(annotated_path, annotated_frame)
            
            # Upload to Cloudinary. Wait, if the preset requires unsigned uploads, we can use it.
            # But we have the api_secret, so we can do an authenticated upload.
            upload_result = cloudinary.uploader.upload(
                annotated_path, 
                folder="drone_shield_survivors"
            )
            
            image_url = upload_result.get("secure_url")
            print(f"Uploaded to Cloudinary: {image_url}")
            
            # Send alert to Dashboard
            payload = {
                "drone_id": f"DRN-{drone_id:03d}",
                "lat": lat,
                "lon": lon,
                "image_url": image_url
            }
            try:
                requests.post("http://localhost:3001/api/survivor_found", json=payload, timeout=2)
                print("Alert successfully sent to dashboard.")
            except Exception as e:
                print(f"Failed to push alert to dashboard: {e}")
                
        else:
            print("No survivor found in frame.")

    except Exception as e:
        print(f"YOLO error: {e}")

if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--drone", type=int, default=1)
    parser.add_argument("--image", type=str, default="survivor.jpg")
    parser.add_argument("--lat", type=float, default=0.0)
    parser.add_argument("--lon", type=float, default=0.0)
    args = parser.parse_args()
    
    run_detection(args.drone, args.image, args.lat, args.lon)
