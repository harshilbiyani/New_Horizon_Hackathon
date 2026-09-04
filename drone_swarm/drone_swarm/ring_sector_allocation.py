"""
Ring + sector search-area division: concentric rings around the entry
point, each ring split into angular sectors, one cell per drone. This
avoids the corner blind-spots of a square grid and lines up naturally
with the relay-checkpoint distances (2 km / 4 km rings), matching how
real search-and-rescue grid planning divides an area around a point of
origin.
"""
import math
from typing import Dict, List
from .drone import Drone


class RingSectorAllocator:
    def __init__(self, ring_width_m: float):
        self.ring_width_m = ring_width_m

    def build_cells(self, n_drones: int, max_radius_m: float) -> List[dict]:
        n_rings = max(1, math.ceil(max_radius_m / self.ring_width_m))
        cells = []
        remaining = n_drones
        for ring_idx in range(n_rings):
            r_inner = ring_idx * self.ring_width_m
            r_outer = min((ring_idx + 1) * self.ring_width_m, max_radius_m)
            rings_left = n_rings - ring_idx
            share = max(1, round(remaining / rings_left))
            n_sectors = remaining if ring_idx == n_rings - 1 else min(share, remaining)
            n_sectors = max(1, n_sectors)
            sector_angle = 2 * math.pi / n_sectors
            for s in range(n_sectors):
                cells.append({
                    "ring": ring_idx,
                    "r_inner": r_inner,
                    "r_outer": r_outer,
                    "theta_start": s * sector_angle,
                    "theta_end": (s + 1) * sector_angle,
                })
            remaining -= n_sectors
            if remaining <= 0:
                break
        return cells[:n_drones]

    def assign(self, drones: List[Drone], max_radius_m: float) -> Dict[int, dict]:
        cells = self.build_cells(len(drones), max_radius_m)
        assignment = {}
        for idx, (drone, cell) in enumerate(zip(drones, cells)):
            drone.assigned_zone = idx
            assignment[drone.drone_id] = cell
        return assignment
