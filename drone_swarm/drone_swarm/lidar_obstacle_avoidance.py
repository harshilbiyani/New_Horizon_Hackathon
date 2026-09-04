"""
Reactive local obstacle avoidance from LIDAR range readings, using the
artificial potential field method (Khatib, 1986) -- a standard, real
technique for reactive avoidance layered under a global planner: A*
handles the macro route, this handles micro-scale dodging in real time
without needing a full replan.
"""
import math
from typing import List, Tuple


class PotentialFieldAvoider:
    def __init__(self, safe_distance_m: float = 3.0, repulsive_gain: float = 2.0):
        self.safe_distance_m = safe_distance_m
        self.repulsive_gain = repulsive_gain

    def repulsive_force(self, lidar_hits: List[Tuple[float, float]]) -> Tuple[float, float]:
        """
        lidar_hits: (angle_rad, distance_m) pairs from a 2D LIDAR scan,
        angle relative to the drone's current heading.
        Returns (fx, fy): a repulsion vector in the drone's local frame.
        """
        fx, fy = 0.0, 0.0
        for angle, dist in lidar_hits:
            if dist <= 0 or dist >= self.safe_distance_m:
                continue
            magnitude = self.repulsive_gain * (1.0 / dist - 1.0 / self.safe_distance_m) / (dist ** 2)
            fx -= magnitude * math.cos(angle)
            fy -= magnitude * math.sin(angle)
        return fx, fy

    def blended_velocity(
        self, planned_vx: float, planned_vy: float,
        lidar_hits: List[Tuple[float, float]], blend_weight: float = 1.0,
    ) -> Tuple[float, float]:
        """Overrides the global-planner velocity command locally when an
        obstacle is close, without touching the macro route."""
        fx, fy = self.repulsive_force(lidar_hits)
        return planned_vx + blend_weight * fx, planned_vy + blend_weight * fy
