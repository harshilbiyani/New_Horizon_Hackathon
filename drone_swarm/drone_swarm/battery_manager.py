"""
Battery-aware return-to-launch (RTL) logic.

A drone is flagged to RTL as soon as its remaining battery drops to the
time it needs to fly straight home, plus a safety margin -- exactly the
threshold rule discussed for the mission (battery_needed_to_return =
distance_to_launch / avg_speed x consumption_rate + safety_margin).
"""
from typing import List
from .drone import Drone


class BatteryManager:
    def __init__(self, safety_margin_min: float = 3.0):
        self.safety_margin_min = safety_margin_min

    def needs_rtl(self, drone: Drone, launch_point) -> bool:
        remaining = drone.battery_minutes_remaining()
        time_home = drone.time_to_return_min(launch_point)
        return remaining <= (time_home + self.safety_margin_min)

    def evaluate_fleet(self, drones: List[Drone], launch_point) -> List[int]:
        """Return drone_ids that must RTL right now."""
        return [
            d.drone_id for d in drones
            if d.is_alive and d.role != "returning" and self.needs_rtl(d, launch_point)
        ]
