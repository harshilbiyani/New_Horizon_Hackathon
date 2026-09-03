import codecs
import re

path = 'simulation/ai_bridge.py'
with codecs.open(path, 'r', 'utf8') as f:
    text = f.read()

import_str = """import json
import os
import sys

# ADDED IMPORTS
from dead_reckoning import DeadReckoningEngine

dr_engines = {}
"""
text = text.replace("import json\nimport os\nimport sys", import_str)

process_body_old = """    for d in active_drones:
        droneId = d.get("id")
        sx = float(d.get("x", 0.0))
        sy = float(d.get("y", 0.0))
        status = d.get("status", "idle")

        blackboard.post_status(droneId, {"""

process_body_new = """    global dr_engines
    for d in active_drones:
        droneId = d.get("id")
        sx = float(d.get("x", 0.0))
        sy = float(d.get("y", 0.0))
        status = d.get("status", "idle")
        gpsMode = d.get("gpsMode", "normal")
        
        # Dead Reckoning Logic
        if gpsMode == "dead-reckoning":
            if droneId not in dr_engines:
                dr_engines[droneId] = DeadReckoningEngine((sx, sy), float(d.get("heading", 0.0)))
            engine = dr_engines[droneId]
            
            # Step physics
            engine.step(0.7, float(d.get("speed", 0.0)), float(d.get("heading", 0.0)))
            
            # Collaborative Correction
            COMM_RANGE = 90
            neighbors = []
            for other in active_drones:
                if other.get("id") != droneId and other.get("gpsMode") != "dead-reckoning":
                    ox, oy = float(other.get("x", 0)), float(other.get("y", 0))
                    dist = ((ox - sx)**2 + (oy - sy)**2)**0.5
                    if dist <= COMM_RANGE:
                        neighbors.append((ox, oy))
            
            if neighbors:
                engine.collaborative_correction(neighbors)
            
            # Provide coordinates based on estimate
            sx, sy = engine.estimate.x, engine.estimate.y
            
            # Log uncertainty to terminal for verification
            print(f"[{droneId}] Dead-Reckoning Uncertainty: {engine.estimate.uncertainty_radius:.3f}")
        else:
            if droneId in dr_engines:
                del dr_engines[droneId]

        blackboard.post_status(droneId, {"""
        
text = text.replace(process_body_old, process_body_new)
with codecs.open(path, 'w', 'utf8') as f:
    f.write(text)
print("Patch applied for Fix 4.")
