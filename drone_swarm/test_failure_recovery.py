# test_failure_recovery.py

from survivor_detector import generate_survivors, detect_survivors
from snapshot_tagger import create_snapshot, merge_snapshots
from zone_fitness import ZoneDivider, compute_zone_fitness, rank_zones
from task_allocator import SwarmAllocator
from failure_recovery import FailureRecoveryManager, DroneStatus

print("=" * 70)
print("  PHASE 2 TASK 6 — DYNAMIC FAILURE RECOVERY")
print("=" * 70)

# Setup
NUM_DRONES = 5
survivors = generate_survivors()
divider = ZoneDivider(grid_size=50, zone_size=10)

# Simulate missions and zone scoring
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

zone_scores = [compute_zone_fitness(zone_id, divider, mission, drone_positions)
               for zone_id in range(divider.total_zones)]
ranked = rank_zones(zone_scores)

# Initialize allocator
allocator = SwarmAllocator(num_drones=NUM_DRONES, scout_ratio=0.2, onlooker_ratio=0.3)
allocator.initialize_roles()

# Allocate initial tasks
tasks = allocator.allocate_zones(ranked, drone_positions)
allocator.drone_tasks = tasks

print("\n" + "=" * 70)
print("  INITIAL STATE")
print("=" * 70)

print(f"\nInitial task assignments: {len(allocator.drone_tasks)}")
for drone_id, task in allocator.drone_tasks.items():
    print(f"  Drone {drone_id}: {task.task_id} → Zone {task.zone_id}")

# Initialize failure recovery manager
manager = FailureRecoveryManager(failure_threshold=3)

print("\n" + "=" * 70)
print("  HEALTH MONITORING START")
print("=" * 70)

# Register all drones
for drone_id in range(1, NUM_DRONES + 1):
    manager.register_drone(drone_id)

print(f"\nHealth monitoring active for {NUM_DRONES} drones")

# Simulate health checks with some drones failing
print("\n" + "=" * 70)
print("  SIMULATED FAILURE CASCADE")
print("=" * 70)

# Check 1: All healthy
print("\n⚪ Health Check #1 - All drones healthy")
for drone_id in range(1, NUM_DRONES + 1):
    manager.record_heartbeat(drone_id)
health_status = manager.get_swarm_health()
print(f"  Status: {health_status['healthy']}/{health_status['total_drones']} healthy ({health_status['health_pct']}%)")

# Check 2-4: Drone 2 misses heartbeats
print("\n🟡 Health Check #2-4 - Drone 2 missing heartbeats...")
for check_num in range(2, 5):
    # Drone 2 is silent, others respond
    for drone_id in [1, 3, 4, 5]:
        manager.record_heartbeat(drone_id)
    
    failed = manager.check_health(allocator.drone_tasks)
    health_status = manager.get_swarm_health()
    
    if failed:
        print(f"  Check #{check_num}: ⚠️  FAILURE DETECTED")
        for failed_id in failed:
            print(f"    → Drone {failed_id} FAILED")
            if failed_id in allocator.drone_tasks:
                task = allocator.drone_tasks[failed_id]
                print(f"      Task interrupted: {task.task_id}")
    else:
        print(f"  Check #{check_num}: Drone 2 silent ({manager.missed_heartbeats[2]}/{manager.failure_threshold} missed)")
    
    print(f"  Swarm: {health_status['healthy']} healthy, {health_status['failed']} failed")

print("\n" + "=" * 70)
print("  FAILURE REPORT")
print("=" * 70)

failure_report = manager.get_failure_report()
print(f"\nFailure events: {len(failure_report['events'])}")
for event in failure_report['events']:
    print(f"  Drone {event['drone_id']}: {event['type']}")
    if event['status'] == 'ACTIVE':
        print(f"    Status: {event['status']}")

print(f"\nOrphaned tasks needing reassignment: {failure_report['unresolved_tasks']}")
if manager.backup_tasks:
    for task in manager.backup_tasks:
        print(f"  → {task.task_id} (Zone {task.zone_id}, fitness={task.fitness_score:.4f})")

print("\n" + "=" * 70)
print("  TASK REALLOCATION")
print("=" * 70)

print(f"\nReassigning {len(manager.backup_tasks)} orphaned tasks\n")

# Remove failed drone from active tasks
for drone_id in [d for d, s in manager.drone_health.items() if s == DroneStatus.FAILED]:
    if drone_id in allocator.drone_tasks:
        del allocator.drone_tasks[drone_id]

# Reallocate
reallocations = manager.reallocate_tasks(allocator, ranked)

print(f"✓ Reassigned {len(reallocations)} tasks:")
for drone_id, new_task in reallocations.items():
    print(f"  → Drone {drone_id}: {new_task.task_id} (Zone {new_task.zone_id})")
    print(f"     Priority fitness: {new_task.fitness_score:.4f}")

print("\n" + "=" * 70)
print("  RECOVERY SIMULATION")
print("=" * 70)

print(f"\nDrone 2 comes back online...\n")
manager.notify_recovery(2)
manager.record_heartbeat(2)

print(f"Drone 2 restored to service")
health_status = manager.get_swarm_health()
print(f"\nSwarm health: {health_status['healthy']}/{health_status['total_drones']} healthy")
print(f"Recovery rate: {health_status['health_pct']}%")

print("\n" + "=" * 70)
print("  FINAL SWARM STATUS")
print("=" * 70)

status = manager.get_swarm_health()
print(f"\nTotal drones:       {status['total_drones']}")
print(f"Healthy:            {status['healthy']}")
print(f"Failed:             {status['failed']}")
print(f"Recovered:          {status['recovered']}")
print(f"Health %:           {status['health_pct']}%")
print(f"Critical alerts:    {status['active_failures']}")

print("\n--- Task 6 complete ---")
