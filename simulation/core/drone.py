# =============================================================================
# core/drone.py - Drone Agents for Drone Swarm Simulation
# Team A - Person A2
# =============================================================================

import sys
import os

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from config import (
    NUM_DRONES, GRID_WIDTH, GRID_HEIGHT, DRONE_DETECTION_RANGE,
    DRONE_MAX_BATTERY, BATTERY_DRAIN_HOVER, BATTERY_DRAIN_MOVE,
    DRONE_CRUISE_ALTITUDE, DRONE_MAX_ALTITUDE, DRONE_SPEED_Z,
    DRONE_WIDTH, DRONE_HEIGHT, DRONE_CLEARANCE_BUFFER_M,
)
from core.pathfinding import a_star


class Drone:
    """
    Autonomous search-and-rescue drone agent.

    Movement model
    --------------
    Each simulation step the drone calls move(map_obj):
      1. If it has no target, it calls choose_next_target().
      2. It asks A* for the next cell toward its target.
      3. It updates its position and marks the new cell as scanned.
      4. If it reaches target it immediately picks the next one.
    """

    def __init__(self, drone_id, start_x, start_y):
        """
        Args:
            drone_id: Unique integer identifier (0-indexed).
            start_x:  Initial column.
            start_y:  Initial row.
        """
        self.id = drone_id
        
        # 3D Position
        self.x = start_x
        self.y = start_y
        self.altitude = DRONE_CRUISE_ALTITUDE
        self.max_altitude = DRONE_MAX_ALTITUDE
        self.clearance_buffer_m = DRONE_CLEARANCE_BUFFER_M
        self.target_altitude = DRONE_CRUISE_ALTITUDE
        
        # Hardware Specs (3D / Physical)
        self.battery = DRONE_MAX_BATTERY
        self.width_m = DRONE_WIDTH
        self.height_m = DRONE_HEIGHT

        # Navigation
        self.target = None
        self.current_path = []
        self._path_target = None
        self.unreachable_targets = set()

        # Environment adaptation state
        self.environment_wind = 0.0
        self.environment_visibility = 1.0
        self.environment_battery_multiplier = 1.0

        # Region (set by set_region)
        self.x_min = 0
        self.y_min = 0
        self.x_max = GRID_WIDTH - 1
        self.y_max = GRID_HEIGHT - 1

        # Scanning
        self.scanned_cells = set()

        # Status: 'active' | 'idle' | 'stuck' | 'low_battery'
        self.status = "active"

        # Consecutive stuck counter (to detect permanent blockage)
        self._stuck_ticks = 0

    # ------------------------------------------------------------------
    # Region management
    # ------------------------------------------------------------------

    def set_region(self, x_min, y_min, x_max, y_max):
        """Assign a rectangular bounding box to this drone."""
        self.x_min = x_min
        self.y_min = y_min
        self.x_max = x_max
        self.y_max = y_max

    # ------------------------------------------------------------------
    # Scanning helpers
    # ------------------------------------------------------------------

    def get_unscanned_cells_in_region(self, map_obj=None):
        """Returns non-obstacle cells in region that haven't been scanned."""
        unscanned = []
        for y in range(self.y_min, self.y_max + 1):
            for x in range(self.x_min, self.x_max + 1):
                if map_obj is not None:
                    if map_obj.is_obstacle(x, y):
                        continue
                    if map_obj.is_scanned(x, y):
                        continue
                else:
                    if (x, y) in self.scanned_cells:
                        continue
                unscanned.append((x, y))
        return unscanned

    def get_global_unscanned_cells(self, map_obj):
        """Returns ALL non-obstacle unscanned cells across the entire map.
        Used as a fallback to ensure 100% coverage when region is empty."""
        unscanned = []
        for y in range(GRID_HEIGHT):
            for x in range(GRID_WIDTH):
                if not map_obj.is_obstacle(x, y) and not map_obj.is_scanned(x, y):
                    unscanned.append((x, y))
        return unscanned

    def _manhattan(self, x, y):
        return abs(self.x - x) + abs(self.y - y)

    # ------------------------------------------------------------------
    # Navigation decisions
    # ------------------------------------------------------------------

    def choose_next_target(self, map_obj=None):
        """
        Pick the nearest unscanned cell in the region as the next target.
        If region is fully clear, falls back to sweeping the entire map 
        to guarantee 100% full area coverage.
        """
        if self.battery <= 0:
            self.status = "low_battery"
            self.target = None
            return

        # 1. Search locally in assigned region
        candidates = self.get_unscanned_cells_in_region(map_obj)
        
        # 2. Fallback globally to assist other drones and hit 100%
        if not candidates and map_obj is not None:
            candidates = self.get_global_unscanned_cells(map_obj)

        # Skip targets proven unreachable from recent positions.
        filtered = [cell for cell in candidates if cell not in self.unreachable_targets]

        # Dynamic environments: avoid temporary hazard cells when possible.
        hazard_cells = getattr(map_obj, "dynamic_hazard_cells", set()) if map_obj is not None else set()
        safer_targets = [cell for cell in filtered if cell not in hazard_cells]
        if safer_targets:
            filtered = safer_targets

        if not filtered and candidates and self.unreachable_targets:
            # Allow retries later because map traversal context may have changed.
            self.unreachable_targets.clear()
            filtered = candidates

        if not filtered:
            self.target = None
            self.status = "idle"
            return

        # Nearest by Manhattan distance (fast)
        self.target = min(filtered, key=lambda c: self._manhattan(*c))
        self.status = "active"
        self.current_path = []  # invalidate cached path
        self._path_target = None

    def _get_next_path_step(self, map_obj):
        """Return next waypoint using cached A* path when possible."""
        if self.target is None:
            return None

        start = (self.x, self.y)
        needs_new_path = (
            self._path_target != self.target
            or not self.current_path
            or self.current_path[0] != start
            or self.current_path[-1] != self.target
        )

        if needs_new_path:
            self.current_path = a_star(
                start,
                self.target,
                map_obj,
                drone_altitude_m=self.altitude,
                clearance_buffer_m=self.clearance_buffer_m,
            ) or []
            self._path_target = self.target

        if len(self.current_path) < 2:
            return None

        next_pos = self.current_path[1]
        if map_obj.is_obstacle(*next_pos):
            self.current_path = []
            self._path_target = None
            return None

        # Advance path head to keep cache aligned with movement.
        self.current_path.pop(0)
        return next_pos

    def _get_environment_state(self, map_obj):
        if hasattr(map_obj, "get_environment_state"):
            return map_obj.get_environment_state()
        return {
            "wind_factor": 0.0,
            "visibility": 1.0,
            "battery_multiplier": 1.0,
            "hazard_ceiling_m": 0.0,
        }

    def _adapt_to_environment(self, map_obj):
        """Adjust altitude and sensitivity to current environment conditions."""
        env = self._get_environment_state(map_obj)
        self.environment_wind = float(env.get("wind_factor", 0.0))
        self.environment_visibility = float(env.get("visibility", 1.0))
        self.environment_battery_multiplier = float(env.get("battery_multiplier", 1.0))

        # Base response: stronger wind means safer, slightly higher cruise altitude.
        wind_lift = self.environment_wind * 15.0
        desired_altitude = DRONE_CRUISE_ALTITUDE + wind_lift

        # Dynamic hazard zones can require temporary higher altitude.
        hazard_cells = getattr(map_obj, "dynamic_hazard_cells", set())
        if (self.x, self.y) in hazard_cells:
            hazard_ceiling = float(env.get("hazard_ceiling_m", DRONE_CRUISE_ALTITUDE))
            desired_altitude = max(desired_altitude, hazard_ceiling + self.clearance_buffer_m)

        self.target_altitude = min(self.max_altitude, max(8.0, desired_altitude))

        if self.altitude < self.target_altitude:
            self.altitude = min(self.target_altitude, self.altitude + DRONE_SPEED_Z)
        elif self.altitude > self.target_altitude:
            self.altitude = max(self.target_altitude, self.altitude - DRONE_SPEED_Z)

    def _attempt_altitude_boost_for_path(self, map_obj):
        """Raise altitude and retry pathing before declaring a target unreachable."""
        boosted = min(self.max_altitude, self.altitude + (DRONE_SPEED_Z * 6))
        if boosted <= self.altitude:
            return False
        self.altitude = boosted
        self.current_path = []
        self._path_target = None
        return True

    def _energy_factor(self):
        wind_penalty = 1.0 + (self.environment_wind * 0.4)
        return max(0.75, self.environment_battery_multiplier * wind_penalty)

    # ------------------------------------------------------------------
    # Movement
    # ------------------------------------------------------------------

    def move(self, map_obj):
        """Advance the drone by one step."""
        if self.battery <= 0:
            self.status = "low_battery"
            return False

        self._adapt_to_environment(map_obj)
        energy_factor = self._energy_factor()

        # Mark starting cell (handles first step)
        self._mark_and_detect(map_obj)

        if self.status in ["idle", "low_battery"]:
            self.battery = max(0, self.battery - (BATTERY_DRAIN_HOVER * energy_factor))
            return False

        # Ensure we have a target
        if self.target is None or (self.x, self.y) == self.target:
            self.choose_next_target(map_obj)
            if self.status == "idle":
                self.battery = max(0, self.battery - (BATTERY_DRAIN_HOVER * energy_factor))
                return False

        # Drain battery for movement
        self.battery = max(0, self.battery - (BATTERY_DRAIN_MOVE * energy_factor))

        # Use cached A* path to avoid recomputing whole routes every tick.
        next_pos = self._get_next_path_step(map_obj)

        if next_pos is None and self._attempt_altitude_boost_for_path(map_obj):
            next_pos = self._get_next_path_step(map_obj)

        if next_pos is None:
            # Keep unreachable targets out of candidate lists instead of mutating the map.
            self.unreachable_targets.add(self.target)
            self.target = None
            self.current_path = []
            self._path_target = None
            self.choose_next_target(map_obj)
            return False

        self._stuck_ticks = 0
        self.x, self.y = next_pos
        
        # Reached target — clear it so we find the next nearest
        if (self.x, self.y) == self.target:
            self.target = None
            self.current_path = []
            self._path_target = None
            
        self._mark_and_detect(map_obj)
        return True

    def _mark_and_detect(self, map_obj):
        """Mark current cell scanned and check for nearby survivors.
        Detection range can be dynamic based on altitude."""
        map_obj.mark_scanned(self.x, self.y)
        self.scanned_cells.add((self.x, self.y))

        visibility_factor = max(0.55, min(1.1, self.environment_visibility))
        altitude_factor = max(0.6, min(1.2, DRONE_CRUISE_ALTITUDE / max(1.0, self.altitude)))
        dynamic_range = int(round(DRONE_DETECTION_RANGE * visibility_factor * altitude_factor))
        dynamic_range = max(1, dynamic_range)

        for dy in range(-dynamic_range, dynamic_range + 1):
            for dx in range(-dynamic_range, dynamic_range + 1):
                sx, sy = self.x + dx, self.y + dy
                if map_obj.is_valid(sx, sy) and map_obj.get_survivor_at(sx, sy):
                    distance = abs(dx) + abs(dy)
                    battery_ratio = self.battery / DRONE_MAX_BATTERY if DRONE_MAX_BATTERY else 0
                    confidence = (
                        0.67
                        + (0.20 * battery_ratio)
                        + (0.12 * self.environment_visibility)
                        - (0.08 * self.environment_wind)
                        - (0.04 * distance)
                    )
                    confidence = round(max(0.45, min(0.99, confidence)), 3)
                    map_obj.mark_survivor_found(
                        sx,
                        sy,
                        detected_by=f"D{self.id + 1}",
                        confidence=confidence,
                    )

    # ------------------------------------------------------------------
    # Query interface
    # ------------------------------------------------------------------

    def get_position(self):
        """Return current (x, y) position."""
        return (self.x, self.y)

    def get_status(self):
        """Return full drone config, including new hardware specs."""
        return {
            "id": self.id,
            "x": self.x,
            "y": self.y,
            "z_altitude_m": self.altitude,
            "z_target_altitude_m": self.target_altitude,
            "battery": self.battery,
            "hw_width_m": self.width_m,
            "hw_height_m": self.height_m,
            "clearance_buffer_m": self.clearance_buffer_m,
            "environment_wind": round(self.environment_wind, 3),
            "environment_visibility": round(self.environment_visibility, 3),
            "status": self.status,
            "target": self.target,
            "scanned_count": len(self.scanned_cells),
            "region": {
                "x_min": self.x_min,
                "y_min": self.y_min,
                "x_max": self.x_max,
                "y_max": self.y_max,
            },
        }


# =============================================================================
# Factory function
# =============================================================================

def create_drones(map_obj):
    import math
    drones = []
    strip_width = math.ceil(GRID_WIDTH / NUM_DRONES)

    for d_id in range(NUM_DRONES):
        x_min = d_id * strip_width
        x_max = min(x_min + strip_width - 1, GRID_WIDTH - 1)
        y_min = 0
        y_max = GRID_HEIGHT - 1

        cx = (x_min + x_max) // 2
        cy = GRID_HEIGHT // 2

        start_x, start_y = _find_valid_start(cx, cy, x_min, x_max, y_min, y_max, map_obj)

        drone = Drone(d_id, start_x, start_y)
        drone.set_region(x_min, y_min, x_max, y_max)
        drone.choose_next_target(map_obj)
        drones.append(drone)

    return drones

def _find_valid_start(cx, cy, x_min, x_max, y_min, y_max, map_obj):
    from collections import deque
    if not map_obj.is_obstacle(cx, cy):
        return (cx, cy)
    visited = {(cx, cy)}
    queue = deque()
    for dy in range(max(cy - y_max, -(y_max - y_min + 1)), (y_max - y_min + 1) + 1):
        for dx in range(-(x_max - x_min + 1), (x_max - x_min + 1) + 1):
            nx, ny = cx + dx, cy + dy
            if x_min <= nx <= x_max and y_min <= ny <= y_max:
                if (nx, ny) not in visited:
                    visited.add((nx, ny))
                    queue.append((nx, ny))
    for (nx, ny) in queue:
        if not map_obj.is_obstacle(nx, ny):
            return (nx, ny)
    return (x_min, y_min)

if __name__ == "__main__":
    print("Testing drone.py...")
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from core.map import Map
    m = Map(seed=99)
    drones = create_drones(m)
    print(f"✓ Created {len(drones)} drones")
    for _ in range(10):
        for d in drones:
            d.move(m)
    print("✓ 10 steps completed without crash")
    print(f"  Scanned cells: {len(m.scanned_cells)}")
    print("\nAll drone tests passed! ✅")
