"""
End-to-end demo of the 10-drone disaster-response swarm discussed in the
mission planning: battery-range feasibility check, relay-chain + ring/
sector allocation, CBBA-based task allocation with event-driven partial
reallocation, and a multi-drone occupancy-grid map merge.

Run:
    python -m drone_swarm.simulation
(from the directory that contains the drone_swarm/ folder)
"""
import random
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt

from .drone import Drone
from .leapfrog_charging import LeapfrogChargingPlanner
from .relay_chain import RelayPlanner
from .ring_sector_allocation import RingSectorAllocator
from .slam import OccupancyGridMapper, merge_maps
from .swarm_coordinator import SwarmCoordinator

random.seed(7)

LAUNCH = (0.0, 0.0)
N_DRONES = 10
AVG_SPEED_MPS = 12.0
BATTERY_MIN = 20.0                 # matches the "20 min max battery" example discussed
COMM_RANGE_M = 1500.0
DISASTER_AREA_RADIUS_M = 4000.0    # matches the "4 km away" scenario discussed


def build_fleet():
    return [
        Drone(drone_id=i, position=LAUNCH, battery_capacity_min=BATTERY_MIN,
              avg_speed_mps=AVG_SPEED_MPS, comm_range_m=COMM_RANGE_M)
        for i in range(N_DRONES)
    ]


def demo_leapfrog_check():
    planner = LeapfrogChargingPlanner(avg_speed_mps=AVG_SPEED_MPS)
    feasible = planner.is_feasible(DISASTER_AREA_RADIUS_M, BATTERY_MIN)
    print(f"[Battery-range check] {DISASTER_AREA_RADIUS_M/1000:.1f} km on a "
          f"{BATTERY_MIN:.0f}-min battery -> feasible in one hop: {feasible}")
    if not feasible:
        stations = planner.station_positions(LAUNCH, (DISASTER_AREA_RADIUS_M, 0), BATTERY_MIN)
        print(f"  Needs {len(stations)} charging/battery-swap station(s) at: {stations}")


def demo_relay_and_ring_sector(fleet):
    relay_planner = RelayPlanner(comm_range_m=COMM_RANGE_M)
    relay_ids, checkpoints = relay_planner.assign_roles(fleet, LAUNCH, (DISASTER_AREA_RADIUS_M, 0))
    print(f"[Relay chain] relay drones: {relay_ids}")
    print(f"  checkpoints: {[tuple(round(v) for v in c) for c in checkpoints]}")

    searchers = [d for d in fleet if d.role == "searcher"]
    ring_allocator = RingSectorAllocator(ring_width_m=1000.0)
    assignment = ring_allocator.assign(searchers, max_radius_m=DISASTER_AREA_RADIUS_M)
    print(f"[Ring+sector allocation] {len(assignment)} search cells assigned to searchers")

    # place each searcher at its assigned cell's midpoint (for the plot, and
    # as the starting patrol point for that cell in a real mission)
    import math
    for drone in searchers:
        cell = assignment[drone.drone_id]
        r_mid = (cell["r_inner"] + cell["r_outer"]) / 2
        theta_mid = (cell["theta_start"] + cell["theta_end"]) / 2
        drone.position = (r_mid * math.cos(theta_mid), r_mid * math.sin(theta_mid))

    return relay_ids, checkpoints, assignment


def demo_cbba(fleet):
    coordinator = SwarmCoordinator(fleet, LAUNCH, COMM_RANGE_M)
    searchers = [d for d in fleet if d.role == "searcher"]
    zones = {i: (random.uniform(-3000, 3000), random.uniform(-3000, 3000)) for i in range(len(searchers))}
    coordinator.set_zones(zones)
    print("[CBBA] initial assignment:", coordinator.assignment)

    # simulate a battery event on one searcher to trigger partial reallocation
    searchers[0].battery_pct = 5.0
    coordinator.tick()
    for line in coordinator.event_log:
        print("[CBBA]", line)
    return coordinator


def demo_slam(fleet):
    mappers = [OccupancyGridMapper(width_m=200, height_m=200, resolution_m=1.0) for _ in range(3)]
    for i, mapper in enumerate(mappers):
        pose = (i * 10.0, i * 5.0, 0.0)
        fake_scan = [(a * 0.1, random.uniform(5, 40)) for a in range(-15, 16)]
        mapper.update(pose, fake_scan)
    merged = merge_maps(mappers)
    print(f"[Multi-robot SLAM] merged map shape: {merged.shape}, "
          f"max occupancy probability: {merged.max():.2f}")
    return merged


def visualize(fleet, checkpoints):
    fig, ax = plt.subplots(figsize=(7, 7))
    ax.scatter(*LAUNCH, c="black", marker="^", s=140, label="Launch / base")
    if checkpoints:
        cx, cy = zip(*checkpoints)
        ax.scatter(cx, cy, c="orange", marker="s", s=90, label="Relay checkpoint")
    colors = {"relay": "orange", "searcher": "green", "returning": "red", "idle": "gray"}
    plotted = set()
    for d in fleet:
        color = colors.get(d.role, "gray")
        label = d.role if d.role not in plotted else None
        ax.scatter(*d.position, c=color, s=70, label=label)
        ax.annotate(str(d.drone_id), d.position)
        plotted.add(d.role)
    ax.set_title("10-Drone Disaster-Response Swarm")
    ax.set_xlabel("meters")
    ax.set_ylabel("meters")
    ax.legend()
    ax.set_aspect("equal")
    fig.savefig("swarm_layout.png", dpi=150, bbox_inches="tight")
    print("Saved visualization to swarm_layout.png")


def main():
    demo_leapfrog_check()
    fleet = build_fleet()
    relay_ids, checkpoints, assignment = demo_relay_and_ring_sector(fleet)
    demo_cbba(fleet)
    demo_slam(fleet)
    visualize(fleet, checkpoints)


if __name__ == "__main__":
    main()
