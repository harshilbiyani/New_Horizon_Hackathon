import json
import sys
import os

# Add drone_swarm to python path
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
AI_DIR = os.path.join(ROOT_DIR, "drone_swarm")
if AI_DIR not in sys.path:
    sys.path.insert(0, AI_DIR)

from drone_swarm.drone import Drone
from drone_swarm.relay_chain import RelayPlanner
from drone_swarm.ring_sector_allocation import RingSectorAllocator

def main():
    try:
        raw_input = sys.stdin.read()
        payload = json.loads(raw_input) if raw_input.strip() else {}
    except Exception as e:
        print(json.dumps({"error": str(e)}))
        return

    # Extract inputs
    drones_data = payload.get("drones", [])
    comm_range = payload.get("commRange", 90.0)
    world_boundary = payload.get("worldBoundary", 350.0)
    launch_point = (0.0, 0.0)
    target_point = (world_boundary, 0.0)

    # Build python fleet
    fleet = []
    for d in drones_data:
        # Create drone instance (we just need id to run the planning)
        drone = Drone(drone_id=d.get("id"), position=launch_point, battery_capacity_min=100, avg_speed_mps=15, comm_range_m=comm_range)
        fleet.append(drone)
    
    if not fleet:
        print(json.dumps({"assignments": {}}))
        return

    try:
        # 1. Relay Planner
        relay_planner = RelayPlanner(comm_range_m=comm_range, safety_margin_m=20.0)
        # We need at least one searcher, so if fleet size is small, relay_planner might raise an error if it needs more relays than drones.
        # Let's catch it if it fails.
        try:
            relay_ids, checkpoints = relay_planner.assign_roles(fleet, launch_point, target_point)
        except ValueError as ve:
            # Fallback: just assign everyone as searchers if not enough drones
            for d in fleet:
                d.role = "searcher"
            relay_ids = []
            checkpoints = []

        # 2. Ring Sector Allocator
        searchers = [d for d in fleet if d.role == "searcher"]
        ring_allocator = RingSectorAllocator(ring_width_m=world_boundary / 3.0)
        ring_assignment = ring_allocator.assign(searchers, max_radius_m=world_boundary)

        # 3. Format output
        assignments = {}
        for d in fleet:
            if d.role == "relay":
                assignments[d.drone_id] = {
                    "role": "relay",
                    "checkpoint": {"x": d.position[0], "y": d.position[1]}
                }
            elif d.role == "searcher":
                cell = ring_assignment.get(d.drone_id, {})
                assignments[d.drone_id] = {
                    "role": "searcher",
                    "sector": {
                        "r_inner": cell.get("r_inner", 0),
                        "r_outer": cell.get("r_outer", world_boundary),
                        "theta_start": cell.get("theta_start", 0),
                        "theta_end": cell.get("theta_end", 3.14 * 2),
                        "ring": cell.get("ring", 0)
                    }
                }
            else:
                assignments[d.drone_id] = {"role": "idle"}

        print(json.dumps({"ok": True, "assignments": assignments}))

    except Exception as e:
        print(json.dumps({"ok": False, "error": str(e)}))

if __name__ == "__main__":
    main()
