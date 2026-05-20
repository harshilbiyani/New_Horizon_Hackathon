# test_task_allocator.py

from survivor_detector import generate_survivors, detect_survivors
from snapshot_tagger import create_snapshot, merge_snapshots
from zone_fitness import ZoneDivider, compute_zone_fitness, rank_zones
from task_allocator import SwarmAllocator, DroneRole

print("=" * 70)
print("  PHASE 2 TASK 5 — ABC-INSPIRED TASK ALLOCATOR")
print("=" * 70)

# Setup
NUM_DRONES = 5
survivors = generate_survivors()
divider = ZoneDivider(grid_size=50, zone_size=10)

# Simulate missions
drone_scans = [
    (1, (10, 10)),
    (2, (33, 7)),
    (3, (25, 25)),
    (4, (5, 40)),
    (5, (45, 45))
]

snapshots = []
drone_positions = []

for drone_id, pos in drone_scans:
    drone_positions.append((drone_id, pos))
    detections = detect_survivors(drone_id=drone_id, drone_pos=pos, survivors=survivors)
    snapshot = create_snapshot(drone_id, pos, detections)
    snapshots.append(snapshot)

mission = merge_snapshots(snapshots)

# Score all zones
zone_scores = []
for zone_id in range(divider.total_zones):
    fitness = compute_zone_fitness(zone_id, divider, mission, drone_positions)
    zone_scores.append(fitness)

ranked = rank_zones(zone_scores)

print("\n" + "=" * 70)
print("  SWARM INITIALIZATION")
print("=" * 70)

# Initialize ABC allocator
allocator = SwarmAllocator(num_drones=NUM_DRONES, scout_ratio=0.2, onlooker_ratio=0.3)
allocator.initialize_roles()

print(f"\nSwarm composition:")
print(f"  Employed bees: {allocator.num_employed}")
print(f"  Onlooker bees: {allocator.num_onlookers}")
print(f"  Scout bees:    {allocator.num_scouts}")
print(f"  Total:         {allocator.num_drones}\n")

print("Drone role assignments:")
for drone_id in range(1, NUM_DRONES + 1):
    role = allocator.drone_roles[drone_id]
    print(f"  Drone {drone_id}: {role.value.upper()}")

print("\n" + "=" * 70)
print("  TASK ALLOCATION — ROUND 1")
print("=" * 70)

# Allocate zones to employed bees
tasks = allocator.allocate_zones(ranked, drone_positions)

print(f"\nAllocated {len(tasks)} tasks to employed bees:")
for drone_id, task in tasks.items():
    print(f"  {task.task_id}: Drone {drone_id} → Zone {task.zone_id}")
    print(f"     Target: {task.zone_center}")
    print(f"     Expected fitness: {task.fitness_score:.4f}")

# Store for later (simulate task execution)
allocator.drone_tasks = tasks

print("\n" + "=" * 70)
print("  SCOUT EXPLORATION")
print("=" * 70)

scout_tasks = allocator.scout_random_zones(ranked)
print(f"\nScouts assigned to random zones: {len(scout_tasks)}")
for task in scout_tasks:
    print(f"  {task.task_id}: Drone {task.drone_id} → Zone {task.zone_id} (random)")
    print(f"     Target: {task.zone_center}")

# Simulate task completion and quality feedback
print("\n" + "=" * 70)
print("  TASK COMPLETION & QUALITY FEEDBACK")
print("=" * 70)

# Simulate some drones completing tasks (with fake detection data)
completion_data = [
    (1, 2, 0.75),  # drone 1 found 2 survivors with avg confidence 0.75
    (2, 1, 0.65),  # drone 2 found 1 survivor with avg confidence 0.65
]

for drone_id, detections, conf_avg in completion_data:
    task = allocator.complete_task(drone_id, detections, conf_avg)
    if task:
        print(f"\n✓ {task.task_id} Complete")
        print(f"  Drone {task.drone_id} | Zone {task.zone_id}")
        print(f"  Survivors found: {task.detection_count}")
        print(f"  Quality score: {task.quality_score:.4f}")

print("\n" + "=" * 70)
print("  ONLOOKER DANCE COMMUNICATION")
print("=" * 70)

if allocator.completed_tasks:
    best_completed = max(allocator.completed_tasks, key=lambda t: t.quality_score)
    print(f"\nBest completed task: {best_completed.task_id}")
    print(f"Quality score: {best_completed.quality_score:.4f}")
    print(f"Broadcasting to onlookers via 'waggle dance'...\n")
    
    dance_tasks = allocator.onlooker_dance(best_completed, ranked[:5])
    print(f"Onlookers attracted to high-quality zone: {len(dance_tasks)} tasks")
    for task in dance_tasks:
        print(f"  {task.task_id}: Drone {task.drone_id} → Zone {task.zone_id}")

print("\n" + "=" * 70)
print("  SWARM STATUS REPORT")
print("=" * 70)

status = allocator.get_swarm_status()
print(f"\nActive tasks: {len(status['current_tasks'])}")
print(f"Completed tasks: {status['completed_tasks']}")
print(f"Average task quality: {status['avg_quality']:.4f}")
print(f"Total survivors found by swarm: {status['total_detections']}")

if status['current_tasks']:
    print(f"\nActive assignments:")
    for drone_id, task_info in status['current_tasks'].items():
        print(f"  Drone {drone_id}: {task_info['task_id']} (Zone {task_info['zone_id']})")

print("\n--- Task 5 complete ---")
