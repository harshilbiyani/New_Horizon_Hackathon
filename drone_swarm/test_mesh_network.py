# test_mesh_network.py

from mesh_network import MeshNetwork

print("=" * 70)
print("  PHASE 3 TASK 8 — DRONE-TO-DRONE MESH NETWORK")
print("=" * 70)

# Initialize mesh network
network = MeshNetwork(communication_range=20.0)

print(f"\nMesh Network initialized (range: 20.0 units)\n")

print("=" * 70)
print("  DRONE REGISTRATION")
print("=" * 70)

# Register drones at various positions
drone_positions = {
    1: (10, 10),
    2: (15, 10),
    3: (25, 10),
    4: (30, 20),
    5: (50, 50)
}

for drone_id, pos in drone_positions.items():
    network.register_drone(drone_id, pos)
    print(f"✓ Drone {drone_id} registered at {pos}")

print("\n" + "=" * 70)
print("  NETWORK TOPOLOGY")
print("=" * 70)

topology = network.get_network_topology()
print(f"\nNetwork connectivity (range = 20.0):")
for drone_id in sorted(topology.keys()):
    print(f"\n  Drone {drone_id} @ {topology[drone_id]['position']}")
    if topology[drone_id]['neighbors']:
        for neighbor_id, signal in topology[drone_id]['neighbors']:
            print(f"    → can reach Drone {neighbor_id} (signal: {signal})")
    else:
        print(f"    → isolated (no neighbors in range)")

print("\n" + "=" * 70)
print("  UNICAST MESSAGE (Drone 1 → Drone 2)")
print("=" * 70)

# Send detection message from drone 1 to drone 2
msg1 = network.send_message(
    sender_id=1,
    receiver_id=2,
    message_type="DETECTION",
    payload={"survivor_id": 7, "location": (10, 10), "confidence": 0.75},
    priority="URGENT"
)
print(f"\n✓ Message sent: {msg1.message_id}")
print(f"  Content: Survivor 7 detected at (10, 10)")

network.process_messages()
delivered = network.get_received_messages(2, "DETECTION")
print(f"\n✓ Delivered to Drone 2: {len(delivered)} message(s)")
if delivered:
    for msg in delivered:
        print(f"  Route: {' → '.join(map(str, msg.route))}")

print("\n" + "=" * 70)
print("  BROADCAST MESSAGE (Drone 1 → ALL)")
print("=" * 70)

print(f"\nSending BROADCAST from Drone 1...")

# Broadcast warning from drone 1 to all neighbors
msg2 = network.send_message(
    sender_id=1,
    receiver_id=-1,  # -1 means broadcast
    message_type="WARNING",
    payload={"type": "OBSTACLE", "location": (12, 10), "severity": "HIGH"},
    priority="URGENT"
)

network.process_messages()

print(f"✓ Broadcast flooded to neighbors")
print(f"  Pending messages: {network.get_message_stats()['pending_messages']}")
print(f"  Delivered total: {network.get_message_stats()['delivered_messages']}")

# Check who received the broadcast
print(f"\n  Broadcast reception:")
for drone_id in range(1, 6):
    received = network.get_received_messages(drone_id, "WARNING")
    if received:
        print(f"    Drone {drone_id}: YES ({len(received)} message)")
    else:
        print(f"    Drone {drone_id}: NO")

print("\n" + "=" * 70)
print("  MULTI-HOP RELAY (Drone 1 → Drone 5)")
print("=" * 70)

print(f"\nDrone 1 and Drone 5 are NOT in direct range (distance > 20)")
print(f"  Trying to relay through intermediate drones 2 → 3 → 4")

msg3 = network.send_message(
    sender_id=1,
    receiver_id=5,
    message_type="DISCOVERY",
    payload={"type": "CLEARING", "location": (50, 50), "size": "LARGE"},
    priority="NORMAL"
)

# Process relaying
relay_rounds = 0
max_rounds = 10
while network.message_queue and relay_rounds < max_rounds:
    relay_rounds += 1
    print(f"\n  Relay round {relay_rounds}:")
    network.process_messages()
    print(f"    Pending: {len(network.message_queue)}, Delivered: {len(network.delivered_messages)}")

# Check if message reached drone 5
received_at_5 = network.get_received_messages(5, "DISCOVERY")
print(f"\n✓ Message reached Drone 5: {'YES' if received_at_5 else 'NO'}")
if received_at_5:
    for msg in received_at_5:
        print(f"  Route: {' → '.join(map(str, msg.route))}")
        print(f"  Hops used: {msg.hop_limit - msg.hops_remaining}")

print("\n" + "=" * 70)
print("  CRITICAL ALERT PROPAGATION")
print("=" * 70)

print(f"\nDrone 4 broadcasts critical battery alert...")

network.broadcast_cache.clear()  # reset cache
msg4 = network.send_message(
    sender_id=4,
    receiver_id=-1,  # broadcast
    message_type="ALERT",
    payload={"alert_type": "BATTERY_CRITICAL", "level": 5},
    priority="CRITICAL"
)

network.process_messages()

# Count recipients of critical alert
recipients = set()
for msg in network.delivered_messages:
    if msg.message_type == "ALERT" and msg.priority == "CRITICAL":
        for drone in msg.route[1:]:  # exclude sender
            recipients.add(drone)

print(f"\n✓ Critical alert received by: {sorted(recipients)}")

print("\n" + "=" * 70)
print("  NETWORK STATISTICS")
print("=" * 70)

stats = network.get_message_stats()
print(f"\nNetwork Stats:")
print(f"  Total drones:           {stats['total_drones']}")
print(f"  Pending messages:       {stats['pending_messages']}")
print(f"  Delivered messages:     {stats['delivered_messages']}")
print(f"  Network connections:    {stats['network_connections']}")

# Message summary
print(f"\nMessage Summary:")
detection_msgs = [m for m in network.delivered_messages if m.message_type == "DETECTION"]
warning_msgs = [m for m in network.delivered_messages if m.message_type == "WARNING"]
alert_msgs = [m for m in network.delivered_messages if m.message_type == "ALERT"]
print(f"  Detections delivered:   {len(detection_msgs)}")
print(f"  Warnings delivered:     {len(warning_msgs)}")
print(f"  Alerts delivered:       {len(alert_msgs)}")

print("\n--- Task 8 complete ---")
