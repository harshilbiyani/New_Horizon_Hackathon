"""
drone_swarm/test_video_yolo.py — Test YOLOv8 Human Detection on a Video File

Usage:
  python drone_swarm/test_video_yolo.py --video "path/to/your/video.mp4"
  python drone_swarm/test_video_yolo.py --video "data/videos/demo.mp4" --conf 0.45 --save

Options:
  --video    Path to your MP4/AVI/MOV video file (required)
  --conf     Confidence threshold (default: 0.40)
  --model    YOLO model to use: yolov8n.pt (default), yolov8s.pt, yolov8m.pt
  --save     Save annotated video with bounding boxes to runs/detect/
  --max-sec  Process only the first N seconds (optional, e.g. 30)
"""

import argparse
import sys
import time
from pathlib import Path

try:
    import cv2
    from ultralytics import YOLO
except ImportError as e:
    print(f"Error: Missing dependencies. {e}")
    print("Run: pip install ultralytics opencv-python-headless")
    sys.exit(1)


def process_video(video_path: str, conf_threshold: float = 0.40, model_name: str = "yolov8n.pt",
                  save_output: bool = True, max_seconds: float = None):
    p = Path(video_path)
    if not p.exists():
        print(f"❌ Error: Video file not found at '{video_path}'")
        sys.exit(1)

    print("=" * 65)
    print(f"🚁 DroneShield YOLOv8 Video Test")
    print(f"📹 Source Video : {p.name}")
    print(f"🧠 Model        : {model_name}")
    print(f"🎯 Threshold    : {conf_threshold}")
    print("=" * 65)

    print("Loading YOLOv8 model ...")
    model = YOLO(model_name)

    cap = cv2.VideoCapture(str(p))
    if not cap.isOpened():
        print(f"❌ Error: OpenCV could not open video: {video_path}")
        sys.exit(1)

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration_sec = total_frames / fps if fps > 0 else 0

    print(f"Resolution : {width}x{height} @ {fps:.1f} FPS")
    print(f"Total Frames: {total_frames} (~{duration_sec:.1f}s)")
    print("-" * 65)

    out_writer = None
    output_path = None
    if save_output:
        out_dir = Path("runs") / "detect"
        out_dir.mkdir(parents=True, exist_ok=True)
        output_path = out_dir / f"annotated_{p.stem}.mp4"
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        out_writer = cv2.VideoWriter(str(output_path), fourcc, fps, (width, height))

    max_frames = int(max_seconds * fps) if max_seconds else total_frames
    frame_count = 0
    total_persons_detected = 0
    frames_with_persons = 0
    start_time = time.time()

    print("Processing video frames ... (press Ctrl+C to stop early)")
    try:
        while cap.isOpened() and frame_count < max_frames:
            ret, frame = cap.read()
            if not ret:
                break

            # Run inference on frame (COCO class 0 is 'person')
            results = model(frame, classes=[0], conf=conf_threshold, verbose=False)
            r = results[0]

            num_persons = len(r.boxes)
            if num_persons > 0:
                frames_with_persons += 1
                total_persons_detected += num_persons

            # Annotate
            annotated_frame = r.plot()

            if out_writer:
                out_writer.write(annotated_frame)

            frame_count += 1
            if frame_count % int(fps) == 0 or frame_count == total_frames:
                pct = (frame_count / max_frames) * 100
                sec = frame_count / fps
                print(f"  [{pct:5.1f}%] {sec:5.1f}s | Frame {frame_count}/{max_frames} | Humans in frame: {num_persons}")

    except KeyboardInterrupt:
        print("\nInterrupted by user, finalizing output...")

    cap.release()
    if out_writer:
        out_writer.release()

    elapsed = time.time() - start_time
    proc_fps = frame_count / elapsed if elapsed > 0 else 0

    print("=" * 65)
    print("✅ Detection Run Completed!")
    print(f"⏱  Time Elapsed       : {elapsed:.2f}s ({proc_fps:.1f} FPS processing speed)")
    print(f"🎞  Frames Processed   : {frame_count}")
    print(f"👥 Frames with Humans : {frames_with_persons} ({((frames_with_persons/max(1, frame_count))*100):.1f}%)")
    print(f"🎯 Total Person Dets  : {total_persons_detected}")
    if output_path and output_path.exists():
        print(f"💾 Annotated Video    : {output_path.resolve()}")
    print("=" * 65)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Test YOLOv8 person detection on video")
    parser.add_argument("--video", required=True, help="Path to video file")
    parser.add_argument("--conf", type=float, default=0.40, help="Confidence threshold (default: 0.40)")
    parser.add_argument("--model", default="yolov8n.pt", help="YOLO model (default: yolov8n.pt)")
    parser.add_argument("--save", action="store_true", default=True, help="Save annotated video")
    parser.add_argument("--max-sec", type=float, default=None, help="Max seconds to process")
    args = parser.parse_args()

    process_video(
        video_path=args.video,
        conf_threshold=args.conf,
        model_name=args.model,
        save_output=args.save,
        max_seconds=args.max_sec,
    )
