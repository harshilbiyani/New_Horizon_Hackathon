"""
Drone state model used across every layer of the swarm simulation.
"""
from dataclasses import dataclass, field
from typing import Tuple, Optional
import time


@dataclass
class Drone:
    drone_id: int
    position: Tuple[float, float]          # (x, y) meters, relative to launch point
    battery_pct: float = 100.0
    battery_capacity_min: float = 20.0     # minutes of flight at 100% battery
    avg_speed_mps: float = 12.0            # cruise speed, m/s
    comm_range_m: float = 1500.0           # radio range, meters
    role: str = "searcher"                 # searcher | relay | returning | idle
    assigned_zone: Optional[int] = None
    last_seen: float = field(default_factory=time.time)
    is_alive: bool = True

    def battery_minutes_remaining(self) -> float:
        return self.battery_capacity_min * (self.battery_pct / 100.0)

    def time_to_return_min(self, launch_point: Tuple[float, float]) -> float:
        dx = self.position[0] - launch_point[0]
        dy = self.position[1] - launch_point[1]
        dist = (dx ** 2 + dy ** 2) ** 0.5
        return dist / (self.avg_speed_mps * 60.0)

    def distance_to(self, other: "Drone") -> float:
        dx = self.position[0] - other.position[0]
        dy = self.position[1] - other.position[1]
        return (dx ** 2 + dy ** 2) ** 0.5
