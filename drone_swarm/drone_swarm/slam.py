"""
Simplified LIDAR-based occupancy-grid mapping (log-odds update) -- the
"M" half of SLAM, which is what actually gets fused into the shared
multi-drone map for the demo.

Honest scope note: full SLAM also needs the "L" half -- estimating the
drone's own pose when GPS is unreliable -- which normally requires
scan-matching (ICP) or a particle filter (e.g. Hector SLAM, LOAM/LIO-SAM).
That is a substantial module in its own right and is not implemented
here; this class assumes a pose estimate is supplied (from GPS, or from a
separate localization module) and focuses on mapping, which is genuinely
real, well-understood, and is what merge_maps() below combines into one
shared rescue map.
"""
import math
from typing import List, Tuple
import numpy as np


class OccupancyGridMapper:
    def __init__(self, width_m: float, height_m: float, resolution_m: float = 0.5):
        self.resolution = resolution_m
        self.width_cells = int(width_m / resolution_m)
        self.height_cells = int(height_m / resolution_m)
        self.origin = (-width_m / 2, -height_m / 2)
        self.log_odds = np.zeros((self.height_cells, self.width_cells), dtype=np.float32)
        self.l_occ = 0.85    # log-odds increment on a hit
        self.l_free = -0.4   # log-odds decrement for free space along the ray

    def _world_to_cell(self, x: float, y: float) -> Tuple[int, int]:
        cx = int((x - self.origin[0]) / self.resolution)
        cy = int((y - self.origin[1]) / self.resolution)
        return cx, cy

    def update(self, pose: Tuple[float, float, float], lidar_hits: List[Tuple[float, float]],
               max_range_m: float = 40.0):
        """
        pose: (x, y, theta) of the drone in the shared world frame.
        lidar_hits: (angle_rad, distance_m) pairs relative to heading.
        """
        px, py, theta = pose
        for angle, dist in lidar_hits:
            dist = min(dist, max_range_m)
            ray_angle = theta + angle
            n_steps = max(1, int(dist / self.resolution))
            for step in range(n_steps):
                r = step * self.resolution
                x, y = px + r * math.cos(ray_angle), py + r * math.sin(ray_angle)
                cx, cy = self._world_to_cell(x, y)
                if 0 <= cx < self.width_cells and 0 <= cy < self.height_cells:
                    self.log_odds[cy, cx] += self.l_free
            hx, hy = px + dist * math.cos(ray_angle), py + dist * math.sin(ray_angle)
            hcx, hcy = self._world_to_cell(hx, hy)
            if 0 <= hcx < self.width_cells and 0 <= hcy < self.height_cells:
                self.log_odds[hcy, hcx] += self.l_occ

    def probability_map(self) -> np.ndarray:
        return 1.0 / (1.0 + np.exp(-self.log_odds))


def merge_maps(mappers: List[OccupancyGridMapper]) -> np.ndarray:
    """
    The simplest real form of collaborative/multi-robot SLAM: sum each
    drone's independent occupancy grid's log-odds (valid once all drones
    share a common world frame and resolution, e.g. by GPS-tagging their
    origin before entering a GPS-denied zone) into one shared map.
    """
    merged = np.zeros_like(mappers[0].log_odds)
    for m in mappers:
        merged += m.log_odds
    return 1.0 / (1.0 + np.exp(-merged))
