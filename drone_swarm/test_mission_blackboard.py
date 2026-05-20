# test_mission_blackboard.py

from mission_blackboard import MissionBlackboard
from datetime import datetime

print("=" * 70)
print("  PHASE 3 TASK 7 — SHARED MISSION BLACKBOARD")
print("=" * 70)

# Initialize mission blackboard
blackboard = MissionBlackboard()

print(f"\nMission Blackboard initialized: {blackboard.mission_id}\n")

print("=" * 70)
print("  DRONE 1 - STATUS & DETECTIONS")
print("=" * 70)

# Drone 1 posts status
blackboard.post_status(drone_id=1, status_info={
    "position": (10, 10),
    "battery": 85,
    "task_id": "TASK_2",
    "zone_id": 18,
    "altitude": 45.5,
    "ground_speed": 8.2
})
print("\n✓ Drone 1 posted status")

# Drone 1 detects survivors
blackboard.post_detection(drone_id=1, detection_info={
    "survivor_id": 7,
    "location": (34, 5),
    "confidence": 0.65,
    "signals": {
        "proximity": 0.25,
        "thermal": 0.40,
        "motion": 0.09,
        "audio": 0.0
    },
    "zone_id": 18
})
print("✓ Drone 1 posted detection: Survivor 7")

blackboard.post_detection(drone_id=1, detection_info={
    "survivor_id": 3,
    "location": (17, 15),
    "confidence": 0.72,
    "signals": {
        "proximity": 0.45,
        "thermal": 0.68,
        "motion": 0.42,
        "audio": 0.15
    },
    "zone_id": 18
})
print("✓ Drone 1 posted detection: Survivor 3")

print("\n" + "=" * 70)
print("  DRONE 2 - STATUS & WARNING")
print("=" * 70)

# Drone 2 posts status
blackboard.post_status(drone_id=2, status_info={
    "position": (33, 7),
    "battery": 72,
    "task_id": "TASK_1",
    "zone_id": 3,
    "altitude": 42.0,
    "ground_speed": 6.5
})
print("\n✓ Drone 2 posted status")

# Drone 2 posts warning
blackboard.post_warning(drone_id=2, warning_info={
    "type": "OBSTACLE",
    "location": (35, 5),
    "severity": "HIGH",
    "description": "Dense tree canopy - navigation hazard",
    "zone_id": 3,
    "recommendation": "Increase altitude or divert around"
})
print("✓ Drone 2 posted warning: Obstacle detected")

print("\n" + "=" * 70)
print("  DRONE 3 - DISCOVERY")
print("=" * 70)

blackboard.post_discovery(drone_id=3, discovery_info={
    "type": "CLEARING",
    "location": (25, 25),
    "area_size": (8, 10),
    "surface_type": "grassland",
    "zone_id": 12,
    "landing_suitable": True,
    "signal_strength": "STRONG"
})
print("\n✓ Drone 3 discovered clearing at (25, 25)")

print("\n" + "=" * 70)
print("  DRONE 4 - CRITICAL ALERT")
print("=" * 70)

blackboard.post_alert(drone_id=4, alert_info={
    "alert_type": "BATTERY_CRITICAL",
    "severity": "CRITICAL",
    "battery_level": 10,
    "position": (5, 40),
    "action_required": "RETURN_TO_BASE",
    "eta_minutes": 12
})
print("\n✓ Drone 4 posted critical alert: Low battery")

print("\n" + "=" * 70)
print("  QUERYING BLACKBOARD")
print("=" * 70)

# Get all detections
detections = blackboard.get_latest_detections()
print(f"\nAll detections on blackboard: {len(detections)}")
for entry in detections:
    print(f"  ├─ Drone {entry.drone_id}: {entry.data['survivor_id']}")

# Get active warnings
warnings = blackboard.get_active_warnings()
print(f"\nActive warnings & alerts: {len(warnings)}")
for entry in warnings:
    print(f"  ├─ [{entry.priority}] Drone {entry.drone_id}: {entry.entry_type}")

# Get drone status summary
status_summary = blackboard.get_drone_status_summary()
print(f"\nDrone Status Summary: {len(status_summary)} drones online")
for drone_id, status in sorted(status_summary.items()):
    print(f"  ├─ Drone {drone_id}: Zone {status['zone_id']}, "
          f"Battery {status['battery']}%, Pos {status['position']}")

# Get zone intelligence
print("\n" + "=" * 70)
print("  ZONE INTELLIGENCE REPORT")
print("=" * 70)

zone_intel = blackboard.get_zone_intelligence(zone_id=18)
print(f"\nZone {zone_intel['zone_id']} Intelligence:")
print(f"  Detections:   {len(zone_intel['detections'])}")
for det in zone_intel['detections']:
    print(f"    → Survivor {det['data']['survivor_id']}: conf={det['data']['confidence']}")
print(f"  Warnings:     {len(zone_intel['warnings'])}")
print(f"  Discoveries:  {len(zone_intel['discoveries'])}")
print(f"  Last Update:  {zone_intel['last_update']}")

# Get mission stats
print("\n" + "=" * 70)
print("  MISSION STATISTICS")
print("=" * 70)

stats = blackboard.get_mission_stats()
print(f"\n{stats['mission_id']}")
print(f"  Total entries posted:  {stats['total_entries']}")
print(f"  Active entries:        {stats['active_entries']}")
print(f"  Survivor detections:   {stats['detections']}")
print(f"  Environmental hazards: {stats['warnings']}")
print(f"  Critical alerts:       {stats['alerts']}")
print(f"  Drones reporting:      {stats['drones_active']}")

# Print full summary
print("\n" + "=" * 70)
print("  BLACKBOARD SUMMARY EXPORT")
print("=" * 70)

print(blackboard.export_summary())

print("\n--- Task 7 complete ---")
