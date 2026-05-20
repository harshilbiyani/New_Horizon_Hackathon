# test_zone_fitness.py

from survivor_detector import generate_survivors, detect_survivors
from snapshot_tagger import create_snapshot, merge_snapshots
from zone_fitness import ZoneDivider, compute_zone_fitness, rank_zones

print("=" * 70)
print("  PHASE 2 TASK 4 — ZONE FITNESS SCORING")
print("=" * 70)

# Initialize zone divider (5x5 = 25 zones on 50x50 grid)
divider = ZoneDivider(grid_size=50, zone_size=10)
print(f"\nGrid divided into {divider.total_zones} zones ({divider.zones_per_row}x{divider.zones_per_row})")
print(f"Each zone is {divider.zone_size}x{divider.zone_size} cells\n")

# Generate survivors and run missions (like Task 3)
survivors = generate_survivors()

drone_scans = [
    (1, (10, 10)),
    (2, (33, 7)),
    (3, (25, 25)),
]

snapshots = []
drone_positions = []

for drone_id, pos in drone_scans:
    drone_positions.append((drone_id, pos))
    detections = detect_survivors(drone_id=drone_id, drone_pos=pos, survivors=survivors)
    snapshot = create_snapshot(drone_id, pos, detections)
    snapshots.append(snapshot)

# Merge into mission data
mission = merge_snapshots(snapshots)

print("=" * 70)
print("  MISSION SUMMARY")
print("=" * 70)
print(f"Total drones: {len(drone_positions)}")
print(f"Survivors detected: {mission['total_survivors_detected']}")
print(f"Grid cells covered: {mission['coverage_cells']}\n")

# Score ALL zones
print("=" * 70)
print("  ZONE FITNESS SCORES (ALL 25 ZONES)")
print("=" * 70)

zone_scores = []
for zone_id in range(divider.total_zones):
    fitness = compute_zone_fitness(
        zone_id, 
        divider, 
        mission, 
        drone_positions
    )
    zone_scores.append(fitness)

# Rank them
ranked = rank_zones(zone_scores)

# Display all zones
for zone in ranked:
    zone_symbol = "◆" if zone["final_score"] >= 0.70 else "■" if zone["final_score"] >= 0.50 else "●"
    print(f"\n{zone_symbol} RANK {zone['rank']:2d} | Zone {zone['zone_id']:2d} | "
          f"Score: {zone['final_score']:.4f} [{zone['label']}]")
    print(f"   Center: {zone['zone_center']}  |  Explored: {zone['cells_explored']}/{zone['cells_total']} cells")
    print(f"   Components:")
    print(f"      Exploration: {zone['components']['exploration']:.3f}")
    print(f"      Survivors:   {zone['components']['survivor_density']:.3f}")
    print(f"      Distance:    {zone['components']['distance']:.3f}")
    print(f"      Threat:      {zone['components']['threat']:.3f}")
    print(f"      Connect:     {zone['components']['connectivity']:.3f}")

# Show top 5 recommendation
print("\n" + "=" * 70)
print("  TOP 5 ZONES TO EXPLORE NEXT")
print("=" * 70)

for idx, zone in enumerate(ranked[:5]):
    print(f"\n  {idx + 1}. Zone {zone['zone_id']} — Score {zone['final_score']:.4f} [{zone['label']}]")
    print(f"     Target: {zone['zone_center']}")
    print(f"     Why: ", end="")
    reasons = []
    if zone['components']['exploration'] > 0.5:
        reasons.append("unexplored")
    if zone['components']['survivor_density'] > 0.3:
        reasons.append("likely survivors")
    if zone['components']['distance'] > 0.6:
        reasons.append("accessible distance")
    if zone['components']['threat'] > 0.8:
        reasons.append("safe zone")
    print(", ".join(reasons) if reasons else "balanced metrics")

print("\n--- Task 4 complete ---")
