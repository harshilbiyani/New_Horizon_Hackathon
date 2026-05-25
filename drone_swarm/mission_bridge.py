import sys
import json
import subprocess
import os

def main():
    input_data = sys.stdin.read()
    if not input_data:
        print(json.dumps({"detections": [], "field_summary": ""}))
        return

    try:
        data = json.loads(input_data)
        mission_state = data.get("missionState", {})
        drone_positions = data.get("dronePositions", [])
        
        target_type = mission_state.get("target_type", "person")
        priority_zone = mission_state.get("zone", "ALL")
        
        # Select drones in priority zone (mock selection logic for simulation)
        selected_drones = drone_positions[:2] if len(drone_positions) > 0 else []
        
        all_detections = []
        for drone in selected_drones:
            drone_id = drone.get("id", "U1")
            
            # Simulated dummy image path
            image_path = f"dummy_{drone_id}.jpg"
            
            # Call yolo_detector.py as subprocess
            script_dir = os.path.dirname(os.path.abspath(__file__))
            yolo_script = os.path.join(script_dir, "yolo_detector.py")
            
            result = subprocess.run(
                [sys.executable, yolo_script, image_path, target_type],
                capture_output=True, text=True
            )
            
            if result.stdout:
                try:
                    dets = json.loads(result.stdout)
                    for d in dets:
                        d["drone_id"] = drone_id
                        d["zone"] = priority_zone
                        all_detections.append(d)
                except Exception:
                    pass
                    
        output = {
            "detections": all_detections,
            "field_summary": ""
        }
        print(json.dumps(output))

    except Exception as e:
        print(json.dumps({"error": str(e), "detections": [], "field_summary": ""}))

if __name__ == "__main__":
    main()
