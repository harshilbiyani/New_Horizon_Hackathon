# test_snapshot.py

from survivor_detector import generate_survivors, detect_survivors
from snapshot_tagger import create_snapshot, tag_coordinates, merge_snapshots
import json

print("=" * 60)
print("  PHASE 1 TASK 3 — SNAPSHOT + COORDINATE TAGGING")
print("=" * 60)

# Generate survivors
survivors = generate_survivors()

# Simulate 3 drone scans
drone_scans = [
    (1, (10, 10)),
    (2, (33, 7)),
    (3, (25, 25)),
]

snapshots = []

print("\n" + "=" * 60)
print("  INDIVIDUAL SNAPSHOTS")
print("=" * 60)

for drone_id, pos in drone_scans:
    detections = detect_survivors(drone_id=drone_id, drone_pos=pos, survivors=survivors)
    snapshot = create_snapshot(drone_id, pos, detections)
    snapshots.append(snapshot)
    
    print(f"\n[SNAPSHOT] Drone {drone_id} @ {pos}")
    print(f"  ID: {snapshot['snapshot_id']}")
    print(f"  Timestamp: {snapshot['timestamp']}")
    print(f"  Detections: {snapshot['scan_count']}")
    print(f"  Coverage cells scanned: {len(snapshot['grid_coverage'])}")
    
    # Tag coordinates
    tags = tag_coordinates(snapshot)
    if tags:
        print(f"  Coordinate tags:")
        for tag in tags:
            print(f"    → Survivor {tag['survivor_id']} at {tag['location']}")
            print(f"      Confidence: {tag['confidence']} [{tag['label']}]")
    else:
        print(f"  No survivors tagged.")

# Merge all snapshots into mission report
print("\n" + "=" * 60)
print("  MERGED MISSION REPORT")
print("=" * 60)

mission = merge_snapshots(snapshots)

print(f"\nMission ID: {mission['mission_id']}")
print(f"Total snapshots: {mission['total_snapshots']}")
print(f"Drones involved: {mission['drones_involved']}")
print(f"Mission timespan: {mission['mission_start']} → {mission['mission_end']}")
print(f"Grid cells covered: {mission['coverage_cells']} cells")
print(f"Unique survivors detected: {mission['total_survivors_detected']}")

if mission['unique_survivors']:
    print(f"\n  Survivor Summary:")
    for survivor_id, data in mission['unique_survivors'].items():
        print(f"    Survivor {survivor_id}:")
        print(f"      Location: {data['location']}")
        print(f"      Times detected: {data['detections_count']}")
        print(f"      Avg confidence: {data['avg_confidence']} [{data['label']}]")
        print(f"      Seen by drones: {sorted(data['seen_by_drones'])}")
else:
    print("  No survivors detected in mission.")

print("\n--- Task 3 complete ---")
