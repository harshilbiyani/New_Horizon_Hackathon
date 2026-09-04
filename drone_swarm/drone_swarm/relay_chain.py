"""
Store-and-forward relay chain -- formally, Delay-Tolerant Networking (DTN)
via a "bucket brigade" of relay drones. This is the named, documented
version of the idea from the discussion (drones parking at 2 km / 4 km
intervals to bridge signal back to base), used in real disaster-response
and subterranean robotics (e.g. DARPA SubT) when a single radio hop can't
span the full mission distance.

This module only plans *communication* checkpoints. It does not, by
itself, get a drone further than its own battery allows -- pair it with
leapfrog_charging.py for the flight-range side of the problem.
"""
import math
from typing import List, Tuple
from .drone import Drone


class RelayPlanner:
    def __init__(self, comm_range_m: float, safety_margin_m: float = 200.0):
        self.hop_distance = max(comm_range_m - safety_margin_m, 100.0)

    def plan_checkpoints(
        self, launch_point: Tuple[float, float], target_point: Tuple[float, float]
    ) -> List[Tuple[float, float]]:
        dx = target_point[0] - launch_point[0]
        dy = target_point[1] - launch_point[1]
        total_dist = math.hypot(dx, dy)
        n_hops = max(1, math.ceil(total_dist / self.hop_distance))
        checkpoints = []
        for i in range(1, n_hops + 1):
            frac = min(i * self.hop_distance / total_dist, 1.0)
            checkpoints.append((launch_point[0] + dx * frac, launch_point[1] + dy * frac))
        return checkpoints

    def assign_roles(
        self, drones: List[Drone], launch_point: Tuple[float, float],
        target_point: Tuple[float, float],
    ):
        """Dedicate the nearest N drones to relay duty (parked at
        checkpoints); the rest stay free to search."""
        checkpoints = self.plan_checkpoints(launch_point, target_point)
        n_relays = len(checkpoints)
        if n_relays >= len(drones):
            raise ValueError(
                "Not enough drones to both relay and search -- "
                "this fleet size needs charging/battery-swap stations instead "
                "(see leapfrog_charging.LeapfrogChargingPlanner)."
            )
        relay_ids = [d.drone_id for d in drones[:n_relays]]
        for d, cp in zip(drones[:n_relays], checkpoints):
            d.role = "relay"
            d.position = cp
        for d in drones[n_relays:]:
            d.role = "searcher"
        return relay_ids, checkpoints
