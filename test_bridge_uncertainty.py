import json
import os
import sys

import ai_bridge
from ai_bridge import parse_snapshot

def simulate(with_neighbors=False):
    if hasattr(ai_bridge, "dr_engines"): ai_bridge.dr_engines.clear()
    
    logs = []
    
    for tick in range(20):
        # mock snapshot
        drones = [
            {
                "id": "DRN-001",
                "x": 0.0 + tick*2,
                "y": 0.0,
                "speed": 10.0,
                "heading": 0.0,
                "status": "idle",
                "gpsMode": "dead-reckoning"
            },
            {"id": "DRN-003", "x": 0.0, "y": 99.0, "speed": 0.0, "heading": 0.0, "status": "idle", "gpsMode": "normal"},
            {"id": "DRN-004", "x": 0.0, "y": 99.0, "speed": 0.0, "heading": 0.0, "status": "idle", "gpsMode": "normal"},
            {"id": "DRN-005", "x": 0.0, "y": 99.0, "speed": 0.0, "heading": 0.0, "status": "idle", "gpsMode": "normal"},
            {"id": "DRN-006", "x": 0.0, "y": 99.0, "speed": 0.0, "heading": 0.0, "status": "idle", "gpsMode": "normal"}
        ]
        
        if with_neighbors:
            drones.append({
                "id": "DRN-002",
                "x": 0.0 + tick*2,
                "y": 5.0,
                "speed": 10.0,
                "heading": 0.0,
                "status": "idle",
                "gpsMode": "normal"
            })
            
        snap = {
            "missionId": "TEST",
            "tick": tick,
            "activeDrones": drones
        }
        
        with open("snap_tmp.json", "w") as f:
            json.dump(snap, f)
            
        # Temporarily capture stdout to grab our print logs safely
        import io
        from contextlib import redirect_stdout
        
        f_cap = io.StringIO()
        with redirect_stdout(f_cap):
            with open("snap_tmp.json") as fl:
                try:
                    parse_snapshot(json.load(fl))
                except Exception:
                    pass
            
            
        out = f_cap.getvalue()
        for line in out.split('\\n'):
            if "Uncertainty" in line:
                logs.append(line.strip())
                
    return logs

print("--- WITHOUT CORRECTION ---")
l1 = simulate(with_neighbors=False)
for x in l1: print(x)

print("\\n--- WITH COLLABORATIVE CORRECTION ---")
l2 = simulate(with_neighbors=True)
for x in l2: print(x)
