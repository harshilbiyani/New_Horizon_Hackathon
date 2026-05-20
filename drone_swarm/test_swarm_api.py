# test_swarm_api.py

from swarm_api import SwarmAPI, APICommand, MockSwarmController
import json

print("=" * 70)
print("  PHASE 4 TASK 10 — SWARM API FOR TEAM A")
print("=" * 70)

# Initialize with mock swarm
swarm = MockSwarmController()

# Add some test detection data
swarm.blackboard.post_detection(1, {
    "survivor_id": 5,
    "location": (15, 20),
    "confidence": 0.78,
    "zone_id": 1
})

swarm.blackboard.post_detection(2, {
    "survivor_id": 3,
    "location": (32, 18),
    "confidence": 0.65,
    "zone_id": 8
})

swarm.blackboard.post_warning(3, {
    "type": "OBSTACLE",
    "location": (25, 25),
    "severity": "MEDIUM",
    "zone_id": 12
})

# Initialize API
api = SwarmAPI(swarm)

print(f"\nSwarm API initialized (v{api.api_version})\n")

print("=" * 70)
print("  [ TEAM A COMMAND CENTER ]")
print("=" * 70)

print("\n┌─ API QUERY: Health Status")
print("│  GET /health")
print("└─ Response:")

health = api.health_status()
print(f"""
  {json.dumps(health, indent=2)}
""")

print("┌─ API QUERY: Mission Status")
print("│  GET /mission")
print("└─ Response:")

mission = api.mission_status()
print(f"""
  {json.dumps(mission, indent=2)}
""")

print("┌─ API QUERY: Drone Positions")
print("│  GET /drones/positions")
print("└─ Response:")

positions = api.drone_positions()
if positions.get("error"):
    print(f"  Note: {positions['error']}")
else:
    print(f"""
  Drones online: {len(positions)}
  (Position data would show live drone coordinates)
""")

print("┌─ API QUERY: Survivor Detections")
print("│  GET /detections")
print("└─ Response:")

detections = api.detections()
print(f"""
  Total detections: {detections['count']}
""")
for det in detections['detections']:
    print(f"    • Survivor {det['survivor_id']} @ {det['location']} "
          f"(confidence: {det['confidence']}, Drone {det['detected_by']})")

print("\n┌─ API QUERY: Threats/Warnings")
print("│  GET /threats")
print("└─ Response:")

threats = api.threats()
print(f"""
  Active threats: {threats['count']}
""")
for threat in threats['threats']:
    print(f"    ⚠️  [{threat['priority']}] {threat['type']} "
          f"reported by Drone {threat['reported_by']}")

print("\n" + "=" * 70)
print("  [ TEAM A SENDING COMMANDS ]")
print("=" * 70)

commands_to_test = [
    (APICommand.START_MISSION, {"target": (25, 25), "priority": "HIGH"}),
    (APICommand.RECON_ZONE, {"zone_id": 12, "priority": "HIGH"}),
    (APICommand.MARK_ZONE_DANGER, {"zone_id": 5, "threat_type": "FLOODING"}),
    (APICommand.RETURN_TO_BASE, {}),
]

for cmd, params in commands_to_test:
    print(f"\n┌─ COMMAND: {cmd.value}")
    print(f"│  Parameters: {params}")
    print(f"└─ Response:")
    
    response = api.send_command(cmd, params)
    for key, value in response.items():
        print(f"  {key}: {value}")

print("\n" + "=" * 70)
print("  [ EMERGENCY SCENARIO ]")
print("=" * 70)

print("\n⚠️  CRITICAL EVENT: Fire detected in Zone 8")
print("    Team A issuing EMERGENCY RECALL\n")

emergency_cmd = api.send_command(APICommand.EMERGENCY_RECALL, 
                                 {"reason": "Fire in Zone 8"})

print(f"Response:")
for key, value in emergency_cmd.items():
    icon = "🔴" if key == "status" and value == "critical" else "  "
    print(f"  {icon} {key}: {value}")

print("\n" + "=" * 70)
print("  [ MISSION REPORT EXPORT ]")
print("=" * 70)

print("\nTeam A requesting full mission report...")

report = api.export_mission_report()

print(f"""
Mission Report Summary:
  Generated: {report['report_generated']}
  
  Status:
    - Mission State: {'ACTIVE' if report['health']['mission_active'] else 'INACTIVE'}
    - Drones: {report['health']['drones']['healthy']}/{report['health']['drones']['total']} healthy
    - Health: {report['health']['health_percentage']}%
  
  Findings:
    - Survivors detected: {report['detections']['count']}
    - Threats identified: {report['threats']['count']}
  
  Drone Activity:
    - Drones online: {len(report['drone_status'])}
""")

print("\n" + "=" * 70)
print("  [ API REQUEST LOG ]")
print("=" * 70)

log = api.get_request_log(limit=10)
print(f"\nTotal API requests: {log['request_count']}")
print("Last commands sent:")
for idx, req in enumerate(log['last_requests'], 1):
    print(f"  {idx}. {req['command']}")

print("\n--- Task 10 complete ---")
