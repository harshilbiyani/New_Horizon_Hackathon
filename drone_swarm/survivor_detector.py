# UNUSED / FUTURE MODULE � Retained for architectural completeness.
# Active live pipeline uses Node.js decision engine & Python ai_bridge.py

# TODO: unused � not imported by ai_bridge.py. Wire in or remove before demo (Phase 4 decision).
# survivor_detector.py

import random
import math
from config import GRID_SIZE, DETECTION_RADIUS, NUM_SURVIVORS
from confidence_scorer import compute_confidence


def generate_survivors(num=NUM_SURVIVORS, seed=42):
    """Randomly place survivors on the grid. Seed keeps it reproducible."""
    random.seed(seed)
    survivors = []
    for i in range(num):
        x = random.randint(0, GRID_SIZE - 1)
        y = random.randint(0, GRID_SIZE - 1)
        survivors.append({
            "id": i + 1,
            "x": x,
            "y": y,
            "detected": False
        })
    return survivors


def distance(pos1, pos2):
    """Euclidean distance between two (x, y) grid positions."""
    return math.sqrt((pos1[0] - pos2[0])**2 + (pos1[1] - pos2[1])**2)



def detect_survivors(drone_id, drone_pos, survivors, radius=DETECTION_RADIUS):
    """
    Scan from drone_pos and return any survivors within radius.

    Args:
        drone_id  : int   — which drone is scanning
        drone_pos : (x,y) — drone's current grid position
        survivors : list  — list of survivor dicts from generate_survivors()
        radius    : int   — detection range in grid cells

    Returns:
        List of detection dicts (empty if nothing found)
    """
    detections = []

    for survivor in survivors:
        if survivor["detected"]:
            continue  # skip already-found survivors

        s_pos = (survivor["x"], survivor["y"])
        dist  = distance(drone_pos, s_pos)

        if dist <= radius:
            confidence_result = compute_confidence(dist, radius, drone_id=drone_id)
            survivor["detected"] = True  # mark as found

            detections.append({
                "drone_id"    : drone_id,
                "survivor_id" : survivor["id"],
                "location"    : s_pos,
                "distance"    : round(dist, 2),
                "confidence"  : confidence_result["final_score"],
                "label"       : confidence_result["label"],
                "signals"     : confidence_result["signals"],
                "status"      : "DETECTED"
            })

    return detections

