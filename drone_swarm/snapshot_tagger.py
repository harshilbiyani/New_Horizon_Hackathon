# snapshot_tagger.py

from datetime import datetime
from config import GRID_SIZE


def create_snapshot(drone_id, position, detections, timestamp=None):
    """
    Create a timestamped snapshot of what a drone detected at a specific location.
    
    Args:
        drone_id   : int     — drone identifier
        position   : (x, y)  — drone's grid position when scan occurred
        detections : list    — list of detection dicts from detect_survivors()
        timestamp  : str     — ISO timestamp (auto-generated if None)
    
    Returns:
        Snapshot dict with metadata and tagged coordinates
    """
    if timestamp is None:
        timestamp = datetime.now().isoformat()
    
    # Create unique ID from timestamp (remove special chars, take first 14 chars)
    ts_clean = timestamp.replace(':', '').replace('-', '').replace('T', '')[:14]
    
    snapshot = {
        "snapshot_id": f"SNAP_{drone_id}_{ts_clean}",
        "drone_id": drone_id,
        "position": position,
        "timestamp": timestamp,
        "scan_count": len(detections),
        "detections": detections,
        "grid_coverage": compute_grid_coverage(position),
        "status": "COMPLETE"
    }
    
    return snapshot


def compute_grid_coverage(drone_pos, scan_radius=3):
    """
    Compute which grid cells were scanned from drone position.
    Returns list of (x, y) positions within scan radius (Manhattan + Euclidean hybrid).
    """
    from math import sqrt
    coverage = []
    x, y = drone_pos
    
    for dx in range(-scan_radius, scan_radius + 1):
        for dy in range(-scan_radius, scan_radius + 1):
            gx = x + dx
            gy = y + dy
            # Only include cells within grid bounds
            if 0 <= gx < GRID_SIZE and 0 <= gy < GRID_SIZE:
                dist = sqrt(dx**2 + dy**2)
                if dist <= scan_radius:
                    coverage.append((gx, gy))
    
    return sorted(coverage)


def tag_coordinates(snapshot):
    """
    Extract and tag all coordinates from detections in a snapshot.
    Returns a list of coordinate tags for mapping/visualization.
    """
    tags = []
    
    for detection in snapshot["detections"]:
        tag = {
            "survivor_id": detection["survivor_id"],
            "location": detection["location"],
            "drone_id": detection["drone_id"],
            "confidence": detection["confidence"],
            "label": detection["label"],
            "signals": detection["signals"],
            "timestamp": snapshot["timestamp"],
            "snapshot_id": snapshot["snapshot_id"]
        }
        tags.append(tag)
    
    return tags


def merge_snapshots(snapshots):
    """
    Merge multiple snapshots into one mission report.
    Deduplicates survivors and computes aggregated confidence.
    """
    if not snapshots:
        return None
    
    merged = {
        "mission_id": f"MISSION_{snapshots[0]['drone_id']}_{len(snapshots)}_SCANS",
        "total_snapshots": len(snapshots),
        "drones_involved": list(set(s["drone_id"] for s in snapshots)),
        "total_survivors_detected": 0,
        "unique_survivors": {},
        "coverage_cells": set(),
        "mission_start": snapshots[0]["timestamp"],
        "mission_end": snapshots[-1]["timestamp"],
    }
    
    # Aggregate all detections
    for snapshot in snapshots:
        merged["coverage_cells"].update(snapshot["grid_coverage"])
        
        for detection in snapshot["detections"]:
            survivor_id = detection["survivor_id"]
            
            if survivor_id not in merged["unique_survivors"]:
                merged["unique_survivors"][survivor_id] = {
                    "location": detection["location"],
                    "detections_count": 1,
                    "confidence_scores": [detection["confidence"]],
                    "avg_confidence": detection["confidence"],
                    "label": detection["label"],
                    "seen_by_drones": {detection["drone_id"]}
                }
            else:
                merged["unique_survivors"][survivor_id]["detections_count"] += 1
                merged["unique_survivors"][survivor_id]["confidence_scores"].append(detection["confidence"])
                merged["unique_survivors"][survivor_id]["seen_by_drones"].add(detection["drone_id"])
                
                # Update average confidence
                scores = merged["unique_survivors"][survivor_id]["confidence_scores"]
                avg = sum(scores) / len(scores)
                merged["unique_survivors"][survivor_id]["avg_confidence"] = round(avg, 4)
    
    merged["total_survivors_detected"] = len(merged["unique_survivors"])
    merged["coverage_cells"] = len(merged["coverage_cells"])
    
    return merged
