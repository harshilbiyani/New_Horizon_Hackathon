"""
Answers the judges' question directly: "human/site is 60 min away, battery
is 45 min -- how do you handle that?"

A relay chain alone (see relay_chain.py) only extends *communication*, not
a drone's own flight envelope -- no amount of clever networking lets a
45-minute-battery drone physically fly 60 minutes out and back. That
requires pre-positioned charging/battery-swap stations along the route.
This module is the planning check that makes that constraint explicit and
tells you where those stations would need to sit.
"""
import math
from typing import List, Tuple


class LeapfrogChargingPlanner:
    def __init__(self, avg_speed_mps: float):
        self.avg_speed_mps = avg_speed_mps

    def max_one_way_range_m(self, battery_minutes: float) -> float:
        """Reserve half the battery for the return leg by default."""
        return (battery_minutes / 2.0) * 60.0 * self.avg_speed_mps

    def is_feasible(self, distance_m: float, battery_minutes: float) -> bool:
        return distance_m <= self.max_one_way_range_m(battery_minutes)

    def station_positions(
        self, launch_point: Tuple[float, float], target_point: Tuple[float, float],
        battery_minutes: float,
    ) -> List[Tuple[float, float]]:
        """
        If a single hop is infeasible, return the (x, y) points along the
        route where a battery-swap/charging station must sit so no drone
        ever flies further than its round-trip range before recharging.
        """
        dx = target_point[0] - launch_point[0]
        dy = target_point[1] - launch_point[1]
        total = math.hypot(dx, dy)
        leg = self.max_one_way_range_m(battery_minutes)
        if leg <= 0:
            raise ValueError("battery_minutes must be positive")
        n_stations = max(0, math.ceil(total / leg) - 1)
        stations = []
        for i in range(1, n_stations + 1):
            frac = (i * leg) / total
            stations.append((launch_point[0] + dx * frac, launch_point[1] + dy * frac))
        return stations
