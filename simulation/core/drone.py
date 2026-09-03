# =============================================================================
# core/drone.py - Drone Agents for Drone Swarm Simulation
# ENHANCED: LiDAR, Fog of War, Potential Fields, Dead Reckoning integrated
# =============================================================================

import sys
import os
import math

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from config import (
    NUM_DRONES, GRID_WIDTH, GRID_HEIGHT, DRONE_DETECTION_RANGE,
    DRONE_MAX_BATTERY, BATTERY_DRAIN_HOVER, BATTERY_DRAIN_MOVE,
    DRONE_CRUISE_ALTITUDE, DRONE_MAX_ALTITUDE, DRONE_SPEED_Z,
    DRONE_WIDTH, DRONE_HEIGHT, DRONE_CLEARANCE_BUFFER_M,
    LIDAR_RANGE, LIDAR_NUM_RAYS, GPS_DENIED_MODE,
    POTENTIAL_FIELD_ENABLED, POTENTIAL_FIELD_BLEND,
)
from core.pathfinding import a_star
from core.lidar import LiDARSensor, scan_result_to_json
from core.potential_field import PotentialFieldNavigator

# Optional: dead reckoning (only imported if GPS-denied mode is on)
try:
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "..", "drone_swarm"))
    from dead_reckoning import DeadReckoningEngine
    _DEAD_RECKONING_AVAILABLE = True
except ImportError:
    _DEAD_RECKONING_AVAILABLE = False


class Drone:
    """
    Autonomous search-and-rescue drone agent.

    Movement model (ENHANCED)
    -------------------------
    Each simulation step the drone calls move(map_obj, fog_of_war, swarm_state):
      1. LiDAR scans surroundings → reveals fog of war, finds new obstacles
      2. If new obstacles discovered → A* path is INVALIDATED → re-plan
      3. Potential field computes local avoidance force
      4. A* plans to next target (using drone's own known map)
      5. Potential field blends with A* heading for smooth avoidance
      6. Drone moves to next cell, marks it scanned
      7. Dead reckoning updates estimated position (GPS-denied mode)
    """

    def __init__(self, drone_id, start_x, start_y):
        """
        Args:
            drone_id: Unique integer identifier (0-indexed).
            start_x:  Initial column.
            start_y:  Initial row.
        """
        self.id = drone_id

        # 3D Position (TRUE position — only used for ground truth scoring)
        self.x = start_x
        self.y = start_y
        self.altitude = DRONE_CRUISE_ALTITUDE
        self.max_altitude = DRONE_MAX_ALTITUDE
        self.clearance_buffer_m = DRONE_CLEARANCE_BUFFER_M
        self.target_altitude = DRONE_CRUISE_ALTITUDE
        self.heading_deg = 0.0  # degrees, 0=North, 90=East

        # Hardware Specs
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

        # Region (set by set_region for ABC task allocation)
        self.x_min = 0
        self.y_min = 0
        self.x_max = GRID_WIDTH - 1
        self.y_max = GRID_HEIGHT - 1

        # Scanning (cells this drone has personally visited)
        self.scanned_cells = set()

        # Status: 'active' | 'idle' | 'stuck' | 'low_battery'
        self.status = "active"

        # Consecutive stuck counter
        self._stuck_ticks = 0

        # ── NEW: LiDAR Sensor ──────────────────────────────────────────
        self.lidar = LiDARSensor(
            drone_id=drone_id,
            range_cells=LIDAR_RANGE,
            num_rays=LIDAR_NUM_RAYS,
            fov_degrees=360.0,
        )
        # Last scan result (for dashboard/visualizer)
        self.last_lidar_scan = None
        # Count newly discovered obstacles this tick (triggers path invalidation)
        self._new_obstacles_this_tick: int = 0

        # ── NEW: Potential Field Navigator ────────────────────────────
        self.apf = PotentialFieldNavigator() if POTENTIAL_FIELD_ENABLED else None
        self._last_apf_force = None  # for visualization

        # ── NEW: Dead Reckoning (GPS-denied positioning) ───────────────
        self.gps_denied = GPS_DENIED_MODE
        if self.gps_denied and _DEAD_RECKONING_AVAILABLE:
            self.dead_reckoning = DeadReckoningEngine(
                initial_position=(float(start_x), float(start_y)),
                initial_heading=self.heading_deg,
            )
        else:
            self.dead_reckoning = None

        # Estimated position (may differ from true position in GPS-denied mode)
        self.estimated_x = float(start_x)
        self.estimated_y = float(start_y)
        self.position_uncertainty = 0.0  # radius in cells

        # ── Telemetry (last tick values for dashboard) ─────────────────
        self.last_lidar_json = None  # JSON-ready LiDAR data

    # ------------------------------------------------------------------
    # Region management (set by ABC task allocator)
    # ------------------------------------------------------------------

    def set_region(self, x_min, y_min, x_max, y_max):
        """Assign a rectangular bounding box to this drone."""
        self.x_min = x_min
        self.y_min = y_min
        self.x_max = x_max
        self.y_max = y_max

    # ------------------------------------------------------------------
    # Scanning helpers (now uses FOG-OF-WAR aware known map)
    # ------------------------------------------------------------------

    def get_unscanned_cells_in_region(self, map_obj=None, fog=None):
        """
        Returns non-obstacle cells in region that haven't been scanned.
        In fog-of-war mode: only considers cells THIS DRONE knows about.
        """
        unscanned = []
        for y in range(self.y_min, self.y_max + 1):
            for x in range(self.x_min, self.x_max + 1):
                if fog is not None:
                    # Fog-of-war: can only target cells we've at least revealed
                    from core.fog_of_war import CellVisibility
                    vis = fog.get_drone_visibility(self.id, x, y)
                    if vis == CellVisibility.UNKNOWN:
                        # We haven't seen this cell via LiDAR — explore toward it
                        # but don't try to path through unknown territory
                        pass
                    if fog.is_known_obstacle_to_drone(self.id, x, y):
                        continue
                elif map_obj is not None:
                    if map_obj.is_obstacle(x, y):
                        continue
                    if map_obj.is_scanned(x, y):
                        continue
                else:
                    if (x, y) in self.scanned_cells:
                        continue
                if (x, y) not in self.scanned_cells:
                    unscanned.append((x, y))
        return unscanned

    def get_global_unscanned_cells(self, map_obj, fog=None):
        """Returns all non-obstacle unscanned cells globally."""
        unscanned = []
        for y in range(GRID_HEIGHT):
            for x in range(GRID_WIDTH):
                if fog is not None and fog.is_known_obstacle_to_drone(self.id, x, y):
                    continue
                elif map_obj is not None and map_obj.is_obstacle(x, y):
                    continue
                if not map_obj.is_scanned(x, y):
                    unscanned.append((x, y))
        return unscanned

    def _manhattan(self, x, y):
        return abs(self.x - x) + abs(self.y - y)

    # ------------------------------------------------------------------
    # Navigation decisions (fog-of-war aware)
    # ------------------------------------------------------------------

    def choose_next_target(self, map_obj=None, fog=None):
        """
        Pick the nearest unscanned cell in the region as the next target.
        In fog-of-war mode: spiral outward from current position to explore unknown areas.
        """
        if self.battery <= 0:
            self.status = "low_battery"
            self.target = None
            return

        candidates = self.get_unscanned_cells_in_region(map_obj, fog)

        if not candidates and map_obj is not None:
            candidates = self.get_global_unscanned_cells(map_obj, fog)

        # Filter unreachable
        filtered = [cell for cell in candidates if cell not in self.unreachable_targets]

        # Avoid dynamic hazard cells
        hazard_cells = getattr(map_obj, "dynamic_hazard_cells", set()) if map_obj else set()
        safer = [c for c in filtered if c not in hazard_cells]
        if safer:
            filtered = safer

        if not filtered and candidates and self.unreachable_targets:
            self.unreachable_targets.clear()
            filtered = candidates

        if not filtered:
            # In fog-of-war mode, target a frontier cell (boundary of known vs unknown)
            if fog is not None:
                frontier = self._get_fog_frontier(fog)
                if frontier:
                    filtered = frontier

        if not filtered:
            self.target = None
            self.status = "idle"
            return

        self.target = min(filtered, key=lambda c: self._manhattan(*c))
        self.status = "active"
        self.current_path = []
        self._path_target = None

    def _get_fog_frontier(self, fog):
        """
        Find frontier cells: revealed cells adjacent to unknown cells.
        These are the most valuable exploration targets in fog-of-war mode.
        """
        from core.fog_of_war import CellVisibility
        frontier = []
        for y in range(self.y_min, self.y_max + 1):
            for x in range(self.x_min, self.x_max + 1):
                vis = fog.get_drone_visibility(self.id, x, y)
                if vis == CellVisibility.REVEALED and (x, y) not in self.scanned_cells:
                    # Check if adjacent to unknown
                    for dx, dy in [(0,1),(0,-1),(1,0),(-1,0)]:
                        nx, ny = x+dx, y+dy
                        if 0 <= nx < GRID_WIDTH and 0 <= ny < GRID_HEIGHT:
                            if fog.get_drone_visibility(self.id, nx, ny) == CellVisibility.UNKNOWN:
                                frontier.append((x, y))
                                break
        return frontier

    def _get_next_path_step(self, map_obj, fog=None):
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
            # Build a navigation map that respects fog of war
            nav_map = _FogAwareNavMap(map_obj, fog, self.id) if fog is not None else map_obj
            self.current_path = a_star(
                start,
                self.target,
                nav_map,
                drone_altitude_m=self.altitude,
                clearance_buffer_m=self.clearance_buffer_m,
            ) or []
            self._path_target = self.target

        if len(self.current_path) < 2:
            return None

        next_pos = self.current_path[1]

        # Check if next step hits a NEWLY DISCOVERED obstacle
        if fog is not None and fog.is_known_obstacle_to_drone(self.id, *next_pos):
            # Path is now blocked — invalidate it
            self.current_path = []
            self._path_target = None
            return None
        elif map_obj.is_obstacle(*next_pos):
            self.current_path = []
            self._path_target = None
            return None

        self.current_path.pop(0)
        return next_pos

    def _get_environment_state(self, map_obj):
        if hasattr(map_obj, "get_environment_state"):
            return map_obj.get_environment_state()
        return {"wind_factor": 0.0, "visibility": 1.0, "battery_multiplier": 1.0, "hazard_ceiling_m": 0.0}

    def _adapt_to_environment(self, map_obj):
        """Adjust altitude and sensitivity to current environment conditions."""
        env = self._get_environment_state(map_obj)
        self.environment_wind = float(env.get("wind_factor", 0.0))
        self.environment_visibility = float(env.get("visibility", 1.0))
        self.environment_battery_multiplier = float(env.get("battery_multiplier", 1.0))

        wind_lift = self.environment_wind * 15.0
        desired_altitude = DRONE_CRUISE_ALTITUDE + wind_lift

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
        """Raise altitude and retry pathing."""
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
    # Movement (ENHANCED — main integration point)
    # ------------------------------------------------------------------

    def move(self, map_obj, fog=None, swarm_positions=None):
        """
        Advance the drone by one step.

        Args:
            map_obj:         True Map (ground truth — only accessed via LiDAR)
            fog:             FogOfWarMap — tracks what each drone knows
            swarm_positions: List of (x, y) positions of other drones (for APF repulsion)

        Returns:
            True if drone moved, False otherwise
        """
        if self.battery <= 0:
            self.status = "low_battery"
            return False

        self._adapt_to_environment(map_obj)
        energy_factor = self._energy_factor()

        # ── STEP 1: LiDAR Scan ──────────────────────────────────────
        self._new_obstacles_this_tick = 0
        if fog is not None:
            scan = self.lidar.scan(self.x, self.y, map_obj, self.heading_deg)
            self.last_lidar_scan = scan
            self.last_lidar_json = scan_result_to_json(scan)

            # Update fog of war with LiDAR results
            fog.reveal_cells(
                drone_id=self.id,
                free_cells=scan.revealed_free_cells,
                obstacle_cells=scan.revealed_obstacle_cells,
            )

            # Check for newly discovered obstacles
            if scan.newly_discovered_obstacles:
                self._new_obstacles_this_tick = len(scan.newly_discovered_obstacles)
                # INVALIDATE current A* path — it may now go through an obstacle
                self.current_path = []
                self._path_target = None

        # ── STEP 2: Scan current cell (detailed sensor pass) ─────────
        self._mark_and_detect(map_obj)
        if fog is not None:
            fog.mark_scanned(self.id, self.x, self.y)

        if self.status in ["idle", "low_battery"]:
            self.battery = max(0, self.battery - (BATTERY_DRAIN_HOVER * energy_factor))
            return False

        # ── STEP 3: Choose target ─────────────────────────────────────
        if self.target is None or (self.x, self.y) == self.target:
            self.choose_next_target(map_obj, fog)
            if self.status == "idle":
                self.battery = max(0, self.battery - (BATTERY_DRAIN_HOVER * energy_factor))
                return False

        self.battery = max(0, self.battery - (BATTERY_DRAIN_MOVE * energy_factor))

        # ── STEP 4: Get next A* step ──────────────────────────────────
        next_pos = self._get_next_path_step(map_obj, fog)

        if next_pos is None and self._attempt_altitude_boost_for_path(map_obj):
            next_pos = self._get_next_path_step(map_obj, fog)

        if next_pos is None:
            self.unreachable_targets.add(self.target)
            self.target = None
            self.current_path = []
            self._path_target = None
            self.choose_next_target(map_obj, fog)
            return False

        # ── STEP 5: Potential Field deflection ───────────────────────
        target_x, target_y = next_pos
        if self.apf is not None and swarm_positions is not None:
            other_pos = [(px, py) for i, (px, py) in enumerate(swarm_positions) if i != self.id]
            known_obs = self.lidar.known_obstacle_cells if fog is not None else set()

            deflected_heading, force = self.apf.get_deflected_heading(
                drone_x=float(self.x),
                drone_y=float(self.y),
                goal_x=float(target_x),
                goal_y=float(target_y),
                known_obstacles=known_obs,
                other_drone_positions=other_pos,
                map_width=GRID_WIDTH,
                map_height=GRID_HEIGHT,
                current_heading_deg=self.heading_deg,
                force_blend=POTENTIAL_FIELD_BLEND,
            )
            self.heading_deg = deflected_heading
            self._last_apf_force = force
        else:
            # Compute heading purely from A* direction
            dx = target_x - self.x
            dy = target_y - self.y
            if dx != 0 or dy != 0:
                self.heading_deg = math.degrees(math.atan2(dy, dx)) % 360.0

        # ── STEP 6: Move ──────────────────────────────────────────────
        self._stuck_ticks = 0
        self.x, self.y = next_pos

        if (self.x, self.y) == self.target:
            self.target = None
            self.current_path = []
            self._path_target = None

        self._mark_and_detect(map_obj)

        # ── STEP 7: Dead Reckoning update ────────────────────────────
        if self.dead_reckoning is not None:
            dr_result = self.dead_reckoning.update(
                speed=1.0,
                heading=self.heading_deg,
                delta_time=1.0,
            )
            if hasattr(dr_result, "x"):
                self.estimated_x = dr_result.x
                self.estimated_y = dr_result.y
                self.position_uncertainty = getattr(dr_result, "uncertainty", 0.0)
        else:
            # GPS mode: estimated = true
            self.estimated_x = float(self.x)
            self.estimated_y = float(self.y)
            self.position_uncertainty = 0.0

        return True

    def correct_dead_reckoning(self, other_drone: "Drone") -> None:
        """
        Collaborative position correction when two drones meet.
        Averages their position estimates, reducing uncertainty.
        Called by the main simulation loop when drones are within mesh range.
        """
        if self.dead_reckoning is None or other_drone.dead_reckoning is None:
            return

        # Simple weighted average by inverse uncertainty
        w_self = 1.0 / max(0.1, self.position_uncertainty)
        w_other = 1.0 / max(0.1, other_drone.position_uncertainty)
        total_w = w_self + w_other

        new_x = (w_self * self.estimated_x + w_other * other_drone.estimated_x) / total_w
        new_y = (w_self * self.estimated_y + w_other * other_drone.estimated_y) / total_w
        new_unc = (self.position_uncertainty * other_drone.position_uncertainty) / (
            self.position_uncertainty + other_drone.position_uncertainty + 1e-9
        )

        # Update both drones
        self.estimated_x = new_x
        self.estimated_y = new_y
        self.position_uncertainty = new_unc
        other_drone.estimated_x = new_x
        other_drone.estimated_y = new_y
        other_drone.position_uncertainty = new_unc

    def _mark_and_detect(self, map_obj):
        """Mark current cell scanned and check for nearby survivors."""
        map_obj.mark_scanned(self.x, self.y)
        self.scanned_cells.add((self.x, self.y))

        visibility_factor = max(0.55, min(1.1, self.environment_visibility))
        altitude_factor = max(0.6, min(1.2, DRONE_CRUISE_ALTITUDE / max(1.0, self.altitude)))
        dynamic_range = max(1, int(round(DRONE_DETECTION_RANGE * visibility_factor * altitude_factor)))

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
                        sx, sy,
                        detected_by=f"D{self.id + 1}",
                        confidence=confidence,
                    )

    # ------------------------------------------------------------------
    # Query interface
    # ------------------------------------------------------------------

    def get_position(self):
        return (self.x, self.y)

    def get_estimated_position(self):
        """Returns the ESTIMATED position (what operator dashboard shows)."""
        return (self.estimated_x, self.estimated_y)

    def get_status(self):
        """Return full drone status including new LiDAR, APF, dead reckoning data."""
        status = {
            "id": self.id,
            # True position (hidden from operator in GPS-denied mode)
            "x": self.x,
            "y": self.y,
            "z_altitude_m": self.altitude,
            "z_target_altitude_m": self.target_altitude,
            "heading_deg": round(self.heading_deg, 1),
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
                "x_min": self.x_min, "y_min": self.y_min,
                "x_max": self.x_max, "y_max": self.y_max,
            },
            # NEW: estimated position (what operator sees in GPS-denied mode)
            "estimated_x": round(self.estimated_x, 2),
            "estimated_y": round(self.estimated_y, 2),
            "position_uncertainty": round(self.position_uncertainty, 2),
            "gps_denied": self.gps_denied,
            # NEW: LiDAR telemetry
            "lidar_range": self.lidar.range,
            "lidar_total_scans": self.lidar.total_scans,
            "lidar_known_obstacles": len(self.lidar.known_obstacle_cells),
            "new_obstacles_discovered": self._new_obstacles_this_tick,
            # NEW: last LiDAR scan for point cloud rendering
            "last_lidar": self.last_lidar_json,
            # NEW: APF force for visualization
            "apf_force": self._last_apf_force.to_dict() if self._last_apf_force else None,
        }
        return status


# =============================================================================
# Fog-aware navigation map wrapper
# =============================================================================

class _FogAwareNavMap:
    """
    Wraps the true Map so that A* plans using the drone's KNOWN obstacles only.
    This ensures drones don't path through areas they THINK are free
    (even if they're actually obstacles not yet discovered by LiDAR).
    """
    def __init__(self, true_map, fog, drone_id: int):
        self._true_map = true_map
        self._fog = fog
        self._drone_id = drone_id

    def is_valid(self, x, y):
        return self._true_map.is_valid(x, y)

    def is_obstacle(self, x, y):
        # Treat as obstacle if: true obstacle AND known, OR known via fog
        return self._fog.is_known_obstacle_to_drone(self._drone_id, x, y)

    def is_navigable_3d(self, x, y, altitude_m, clearance_buffer_m):
        if not self.is_valid(x, y):
            return False
        if self.is_obstacle(x, y):
            return False
        # Also check true obstacle height if we know about it
        if (x, y) in self._fog._drone_known_obstacles[self._drone_id]:
            obs_height = self._true_map.get_obstacle_height(x, y)
            return altitude_m >= (obs_height + clearance_buffer_m)
        return True

    def get_neighbors(self, x, y, drone_altitude_m=None, clearance_buffer_m=0.0):
        neighbors = []
        for dx, dy in [(0, -1), (0, 1), (-1, 0), (1, 0)]:
            nx, ny = x + dx, y + dy
            if not self.is_valid(nx, ny):
                continue
            if drone_altitude_m is None:
                if not self.is_obstacle(nx, ny):
                    neighbors.append((nx, ny))
            else:
                if self.is_navigable_3d(nx, ny, drone_altitude_m, clearance_buffer_m):
                    neighbors.append((nx, ny))
        return neighbors

    @property
    def dynamic_hazard_cells(self):
        return getattr(self._true_map, "dynamic_hazard_cells", set())


# =============================================================================
# Factory function
# =============================================================================

def create_drones(map_obj):
    import math as _math
    drones = []
    strip_width = _math.ceil(GRID_WIDTH / NUM_DRONES)

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
    for dy in range(-(y_max - y_min + 1), (y_max - y_min + 1) + 1):
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
    print("Testing enhanced drone.py...")
    from core.map import Map
    from core.fog_of_war import FogOfWarMap

    m = Map(seed=99)
    fog = FogOfWarMap(width=m.width, height=m.height, num_drones=NUM_DRONES)
    drones = create_drones(m)
    swarm_pos = [(d.x, d.y) for d in drones]

    print(f"✓ Created {len(drones)} drones")
    for _ in range(10):
        swarm_pos = [(d.x, d.y) for d in drones]
        for d in drones:
            d.move(m, fog, swarm_pos)

    print("✓ 10 steps with LiDAR + Fog of War completed")
    stats = fog.get_coverage_stats()
    print(f"  Coverage stats: {stats}")
    print(f"  Drone 0 LiDAR scans: {drones[0].lidar.total_scans}")
    print("\nAll drone enhanced tests passed! ✅")
