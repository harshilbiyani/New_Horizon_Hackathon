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
    DRONE_CRUISE_ALTITUDE, DRONE_WIDTH, DRONE_HEIGHT
)
from core.pathfinding import get_next_step


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
        
        # Hardware Specs (3D / Physical)
        self.battery = DRONE_MAX_BATTERY
        self.width_m = DRONE_WIDTH
        self.height_m = DRONE_HEIGHT

        # Navigation
        self.target = None
        self.current_path = []

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

        if not candidates:
            self.target = None
            self.status = "idle"
            return

        # Nearest by Manhattan distance (fast)
        self.target = min(candidates, key=lambda c: self._manhattan(*c))
        self.status = "active"
        self.current_path = []  # invalidate cached path

    # ------------------------------------------------------------------
    # Movement
    # ------------------------------------------------------------------

    def move(self, map_obj):
        """Advance the drone by one step."""
        if self.battery <= 0:
            self.status = "low_battery"
            return False

        # Mark starting cell (handles first step)
        self._mark_and_detect(map_obj)

        if self.status in ["idle", "low_battery"]:
            self.battery -= BATTERY_DRAIN_HOVER
            return False

        # Ensure we have a target
        if self.target is None or (self.x, self.y) == self.target:
            self.choose_next_target(map_obj)
            if self.status == "idle":
                self.battery -= BATTERY_DRAIN_HOVER
                return False

        # Drain battery for movement
        self.battery -= BATTERY_DRAIN_MOVE

        # Ask pathfinding for next step
        next_pos = get_next_step((self.x, self.y), self.target, map_obj)

        if next_pos is None:
            # Pathfinding failed completely — target is enclosed by obstacles!
            # We must permanently blacklist this target otherwise all drones 
            # will continually try and fail to reach it.
            if map_obj is not None:
                # Mark as obstacle globally so no drone wastes time on it
                map_obj.grid[self.target[1]][self.target[0]] = 1 # CELL_OBSTACLE
                if self.target not in map_obj.obstacle_locations:
                    map_obj.obstacle_locations.append(self.target)
                    
            self.target = None
            self._stuck_ticks = 0
            self.choose_next_target(map_obj)
            return False

        self._stuck_ticks = 0
        self.x, self.y = next_pos
        
        # Reached target — clear it so we find the next nearest
        if (self.x, self.y) == self.target:
            self.target = None
            
        self._mark_and_detect(map_obj)
        return True

    def _mark_and_detect(self, map_obj):
        """Mark current cell scanned and check for nearby survivors.
        Detection range can be dynamic based on altitude."""
        map_obj.mark_scanned(self.x, self.y)
        self.scanned_cells.add((self.x, self.y))

        # Optionally scale detection with altitude:
        # dynamic_range = int(DRONE_DETECTION_RANGE * (self.altitude / DRONE_CRUISE_ALTITUDE))
        dynamic_range = DRONE_DETECTION_RANGE

        for dy in range(-dynamic_range, dynamic_range + 1):
            for dx in range(-dynamic_range, dynamic_range + 1):
                sx, sy = self.x + dx, self.y + dy
                if map_obj.is_valid(sx, sy) and map_obj.get_survivor_at(sx, sy):
                    map_obj.mark_survivor_found(sx, sy)

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
            "battery": self.battery,
            "hw_width_m": self.width_m,
            "hw_height_m": self.height_m,
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
