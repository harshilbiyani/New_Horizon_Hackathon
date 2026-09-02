# =============================================================================
# core/map.py - Grid Map for Drone Swarm Simulation
# Team A - Person A1
# =============================================================================

import sys
import os
import numpy as np
import random

# Allow running standalone for testing
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
from config import (
    GRID_WIDTH, GRID_HEIGHT,
    CELL_EMPTY, CELL_OBSTACLE, CELL_SURVIVOR, CELL_SCANNED,
    OBSTACLE_DENSITY, NUM_SURVIVORS,
    MIN_OBSTACLE_SIZE, MAX_OBSTACLE_SIZE,
    DEFAULT_ENVIRONMENT, ENVIRONMENT_PROFILES,
)


class Map:
    """
    Represents the 50x50 grid world.

    Cell types (stored in self.grid):
        CELL_EMPTY    (0) – passable, not yet scanned
        CELL_OBSTACLE (1) – impassable
        CELL_SURVIVOR (2) – hidden survivor (looks EMPTY to drones)
        CELL_SCANNED  (3) – passable cell already visited

    The visible_grid property exposes a drone-eye-view where survivors
    appear as CELL_EMPTY until found/detected.
    """

    def __init__(self, seed=None, environment_name=DEFAULT_ENVIRONMENT):
        """
        Initialize the map.

        Args:
            seed: Optional random seed for reproducibility.
        """
        if seed is not None:
            np.random.seed(seed)
            random.seed(seed)

        # Environment profile (5 selectable modes)
        self.environment_name = environment_name if environment_name in ENVIRONMENT_PROFILES else DEFAULT_ENVIRONMENT
        self.environment_profile = self._resolve_environment_profile(self.environment_name)

        # Profile-driven generation settings
        self.obstacle_density = float(self.environment_profile.get("obstacle_density", OBSTACLE_DENSITY))
        self.min_obstacle_size = int(self.environment_profile.get("min_obstacle_size", MIN_OBSTACLE_SIZE))
        self.max_obstacle_size = int(self.environment_profile.get("max_obstacle_size", MAX_OBSTACLE_SIZE))
        self.num_survivors = int(self.environment_profile.get("num_survivors", NUM_SURVIVORS))

        min_h, max_h = self.environment_profile.get("obstacle_height_m", (8.0, 22.0))
        if min_h > max_h:
            min_h, max_h = max_h, min_h
        self.obstacle_height_range = (float(min_h), float(max_h))

        # Internal grid (full truth – includes hidden survivors)
        self.width = GRID_WIDTH
        self.height = GRID_HEIGHT
        self.grid = np.zeros((self.height, self.width), dtype=np.int8)
        self.obstacle_height_map = np.zeros((self.height, self.width), dtype=np.float32)

        # Fast lookup structures
        self.scanned_cells = set()
        self.obstacle_locations = []
        self.obstacle_set = set()
        self.survivor_locations = []
        self.found_survivors = set()

        # Mission telemetry inspired by the extra simulation engine.
        self.current_step = 0
        self._detection_counter = 0
        self._recent_detections = []
        self.detection_history = []

        # Dynamic environment state (for dynamic profiles)
        self.dynamic_hazard_cells = set()
        self._last_dynamic_refresh_step = -1
        self.environment_step_state = {
            "environment_name": self.environment_name,
            "environment_label": self.environment_profile.get("label", self.environment_name),
            "dynamic": bool(self.environment_profile.get("dynamic", False)),
            "wind_factor": float(self.environment_profile.get("wind_base", 0.0)),
            "visibility": float(self.environment_profile.get("visibility_base", 1.0)),
            "battery_multiplier": float(self.environment_profile.get("battery_multiplier", 1.0)),
            "active_hazard_cells": 0,
            "hazard_ceiling_m": float(self.environment_profile.get("hazard_ceiling_m", 0.0)),
        }

        # Build world
        self._place_obstacles()
        self._place_survivors()

    def _resolve_environment_profile(self, environment_name):
        """Return a safe copy of the selected environment profile."""
        base = ENVIRONMENT_PROFILES.get(DEFAULT_ENVIRONMENT, {})
        selected = ENVIRONMENT_PROFILES.get(environment_name, base)
        merged = dict(base)
        merged.update(selected)
        return merged

    def _sample_obstacle_height(self):
        """Sample obstacle top height in meters for 3D navigation checks."""
        min_h, max_h = self.obstacle_height_range
        return round(random.uniform(min_h, max_h), 2)

    # ------------------------------------------------------------------
    # World generation
    # ------------------------------------------------------------------

    def _place_obstacles(self):
        """
        Place obstacle clusters covering ~OBSTACLE_DENSITY of the grid.

        Uses a cluster approach: pick a random seed cell, then expand
        it 1-MAX_OBSTACLE_SIZE times in random directions. Repeat until
        the target obstacle count is reached.
        """
        target_obstacles = int(self.width * self.height * self.obstacle_density)
        placed = 0
        max_attempts = target_obstacles * 20  # safety cap
        attempts = 0

        while placed < target_obstacles and attempts < max_attempts:
            attempts += 1
            # Random cluster origin
            ox = random.randint(0, self.width - 1)
            oy = random.randint(0, self.height - 1)
            cluster_size = random.randint(self.min_obstacle_size, self.max_obstacle_size)

            # Expand cluster from seed
            cluster_cells = {(ox, oy)}
            frontier = [(ox, oy)]
            for _ in range(cluster_size - 1):
                if not frontier:
                    break
                cx, cy = random.choice(frontier)
                for dx, dy in [(0, 1), (0, -1), (1, 0), (-1, 0)]:
                    nx, ny = cx + dx, cy + dy
                    if (self.is_valid(nx, ny)
                            and (nx, ny) not in cluster_cells
                            and self.grid[ny][nx] == CELL_EMPTY):
                        cluster_cells.add((nx, ny))
                        frontier.append((nx, ny))
                        break

            for (cx, cy) in cluster_cells:
                if self.grid[cy][cx] == CELL_EMPTY:
                    self.grid[cy][cx] = CELL_OBSTACLE
                    self.obstacle_height_map[cy][cx] = self._sample_obstacle_height()
                    self.obstacle_locations.append((cx, cy))
                    self.obstacle_set.add((cx, cy))
                    placed += 1
                    if placed >= target_obstacles:
                        break

    def _place_survivors(self):
        """
        Place NUM_SURVIVORS in random, non-obstacle cells.
        Survivors are marked internally but appear as CELL_EMPTY to drones.
        """
        placed = 0
        max_attempts = self.num_survivors * 100
        attempts = 0

        while placed < self.num_survivors and attempts < max_attempts:
            attempts += 1
            x = random.randint(0, self.width - 1)
            y = random.randint(0, self.height - 1)

            if self.grid[y][x] == CELL_EMPTY:
                self.grid[y][x] = CELL_SURVIVOR
                self.survivor_locations.append((x, y))
                placed += 1

        if placed < self.num_survivors:
            print(f"Could only place {placed}/{self.num_survivors} survivors (grid too crowded).")

    # ------------------------------------------------------------------
    # Cell queries
    # ------------------------------------------------------------------

    def is_valid(self, x, y):
        """Return True if (x, y) is within grid bounds."""
        return 0 <= x < self.width and 0 <= y < self.height

    def is_obstacle(self, x, y):
        """Return True if cell is an obstacle OR out of bounds."""
        if not self.is_valid(x, y):
            return True
        return (x, y) in self.obstacle_set

    def get_obstacle_height(self, x, y):
        """Return obstacle height at cell in meters (0 for non-obstacle cells)."""
        if not self.is_valid(x, y):
            return float("inf")
        if (x, y) not in self.obstacle_set:
            return 0.0
        return float(self.obstacle_height_map[y][x])

    def is_navigable_3d(self, x, y, altitude_m, clearance_buffer_m):
        """Return True if a drone at altitude_m can pass over/through cell."""
        if not self.is_valid(x, y):
            return False
        if (x, y) not in self.obstacle_set:
            return True
        obstacle_top = self.get_obstacle_height(x, y)
        return altitude_m >= (obstacle_top + clearance_buffer_m)

    def get_survivor_at(self, x, y):
        """
        Called by Team C (Detection) to check for a survivor at (x, y).
        Returns True if an undiscovered survivor is present.
        """
        if not self.is_valid(x, y):
            return False
        if (x, y) in self.found_survivors:
            return False
        return self.grid[y][x] == CELL_SURVIVOR

    def mark_survivor_found(self, x, y, detected_by=None, confidence=None):
        """Mark survivor at (x, y) as found/rescued and log detection metadata."""
        if self.get_survivor_at(x, y):
            self.found_survivors.add((x, y))
            self._detection_counter += 1
            detection = {
                "survivor_id": f"S{self._detection_counter}",
                "x": x,
                "y": y,
                "detected_by": detected_by,
                "confidence": confidence,
                "step": self.current_step,
            }
            self._recent_detections.append(detection)
            self.detection_history.append(detection)
            return True
        return False

    def start_new_step(self, step_number):
        """Reset per-step event buffers before drones move."""
        self.current_step = step_number
        self._recent_detections = []
        self.update_environment_step(step_number)

    def update_environment_step(self, step_number):
        """Advance profile-driven environment state for the current step."""
        self._refresh_dynamic_hazards(step_number)
        self.environment_step_state = self._compute_environment_state(step_number)

    def _refresh_dynamic_hazards(self, step_number):
        """Rebuild temporary hazard cells for dynamic environments."""
        is_dynamic = bool(self.environment_profile.get("dynamic", False))
        target_count = int(self.environment_profile.get("dynamic_hazard_cells", 0))
        refresh_steps = int(self.environment_profile.get("hazard_refresh_steps", 1))

        if not is_dynamic or target_count <= 0:
            self.dynamic_hazard_cells = set()
            self._last_dynamic_refresh_step = step_number
            return

        should_refresh = (
            self._last_dynamic_refresh_step < 0
            or (step_number - self._last_dynamic_refresh_step) >= max(1, refresh_steps)
        )
        if not should_refresh:
            return

        candidates = [
            (x, y)
            for y in range(self.height)
            for x in range(self.width)
            if not self.is_obstacle(x, y)
        ]
        random.shuffle(candidates)
        chosen = candidates[:min(len(candidates), target_count)]
        self.dynamic_hazard_cells = set(chosen)
        self._last_dynamic_refresh_step = step_number

    def _compute_environment_state(self, step_number):
        """Compute dynamic scalar state used by drones and visualization."""
        wind_base = float(self.environment_profile.get("wind_base", 0.0))
        wind_var = float(self.environment_profile.get("wind_variation", 0.0))
        vis_base = float(self.environment_profile.get("visibility_base", 1.0))
        vis_var = float(self.environment_profile.get("visibility_variation", 0.0))

        wind_factor = max(0.0, wind_base + random.uniform(-wind_var, wind_var))
        visibility = min(1.0, max(0.15, vis_base + random.uniform(-vis_var, vis_var)))

        return {
            "step": step_number,
            "environment_name": self.environment_name,
            "environment_label": self.environment_profile.get("label", self.environment_name),
            "dynamic": bool(self.environment_profile.get("dynamic", False)),
            "wind_factor": round(wind_factor, 3),
            "visibility": round(visibility, 3),
            "battery_multiplier": float(self.environment_profile.get("battery_multiplier", 1.0)),
            "active_hazard_cells": len(self.dynamic_hazard_cells),
            "hazard_ceiling_m": float(self.environment_profile.get("hazard_ceiling_m", 0.0)),
            "hazard_refresh_steps": int(self.environment_profile.get("hazard_refresh_steps", 0)),
        }

    def get_environment_state(self):
        """Return current environment state values for controllers and UI."""
        state = dict(self.environment_step_state)
        state["dynamic_hazard_cells"] = list(self.dynamic_hazard_cells)
        return state

    def get_recent_detections(self):
        """Return survivor detections from the latest completed step."""
        return list(self._recent_detections)

    def get_mission_board(self, drone_states=None):
        """Build mission metrics similar to the richer extra-folder engine output."""
        total_passable = self.width * self.height - len(self.obstacle_locations)
        coverage = 100.0 if total_passable == 0 else (len(self.scanned_cells) / total_passable * 100.0)
        env_state = self.get_environment_state()

        active = idle = stuck = low_battery = 0
        if drone_states is not None:
            for drone in drone_states:
                status = drone.get("status")
                if status == "active":
                    active += 1
                elif status == "idle":
                    idle += 1
                elif status == "stuck":
                    stuck += 1
                elif status == "low_battery":
                    low_battery += 1

        return {
            "step": self.current_step,
            "coverage_percent": round(coverage, 2),
            "scanned_cell_count": len(self.scanned_cells),
            "total_passable_cells": total_passable,
            "survivors_found": len(self.found_survivors),
            "total_survivors": len(self.survivor_locations),
            "active_drones": active,
            "idle_drones": idle,
            "stuck_drones": stuck,
            "low_battery_drones": low_battery,
            "total_detections": len(self.detection_history),
            "environment_name": env_state.get("environment_name", self.environment_name),
            "environment_label": env_state.get("environment_label", self.environment_name),
            "wind_factor": env_state.get("wind_factor", 0.0),
            "visibility": env_state.get("visibility", 1.0),
            "active_hazard_cells": env_state.get("active_hazard_cells", 0),
        }

    # ------------------------------------------------------------------
    # Scanning
    # ------------------------------------------------------------------

    def mark_scanned(self, x, y):
        """Record that a drone has visited cell (x, y)."""
        if self.is_valid(x, y):
            self.scanned_cells.add((x, y))

    def is_scanned(self, x, y):
        """Return True if cell has been visited by any drone."""
        return (x, y) in self.scanned_cells

    # ------------------------------------------------------------------
    # Pathfinding support
    # ------------------------------------------------------------------

    def get_neighbors(self, x, y, drone_altitude_m=None, clearance_buffer_m=0.0):
        """
        Return list of passable 4-directional neighbors of (x, y).
        Excludes out-of-bounds and obstacle cells.
        """
        neighbors = []
        for dx, dy in [(0, -1), (0, 1), (-1, 0), (1, 0)]:
            nx, ny = x + dx, y + dy
            if not self.is_valid(nx, ny):
                continue
            if drone_altitude_m is None:
                if not self.is_obstacle(nx, ny):
                    neighbors.append((nx, ny))
                continue
            if self.is_navigable_3d(nx, ny, drone_altitude_m, clearance_buffer_m):
                neighbors.append((nx, ny))
        return neighbors

    # ------------------------------------------------------------------
    # State export (for Teams B & C)
    # ------------------------------------------------------------------

    def get_map_state(self):
        """
        Return complete map snapshot.

        Format expected by Team B (Visualization):
        {
            'grid':             np.ndarray (height x width, int8),
            'width':            int,
            'height':           int,
            'obstacles':        list of (x, y),
            'scanned_cells':    list of (x, y),
            'survivor_locations': list of (x, y),   # ALL survivors (for display)
            'found_survivors':  list of (x, y),
        }
        """
        return {
            "grid": self.grid.tolist() if hasattr(self.grid, 'tolist') else self.grid,
            "width": self.width,
            "height": self.height,
            "obstacles": list(self.obstacle_locations),
            "obstacle_heights": self.obstacle_height_map.tolist() if hasattr(self.obstacle_height_map, 'tolist') else self.obstacle_height_map,
            "scanned_cells": list(self.scanned_cells),
            "survivor_locations": list(self.survivor_locations),
            "found_survivors": list(self.found_survivors),
            "recent_detections": self.get_recent_detections(),
            "dynamic_hazard_cells": list(self.dynamic_hazard_cells),
            "environment": self.get_environment_state(),
            "environment_name": self.environment_name,
            "environment_label": self.environment_profile.get("label", self.environment_name),
        }

    def get_coverage_percentage(self):
        """Return percentage of non-obstacle cells that have been scanned."""
        total_passable = self.width * self.height - len(self.obstacle_locations)
        if total_passable == 0:
            return 100.0
        return len(self.scanned_cells) / total_passable * 100.0


# =============================================================================
# Standalone test
# =============================================================================
if __name__ == "__main__":
    print("Testing map.py...")
    m = Map(seed=42)

    total_cells = m.width * m.height
    obstacle_count = len(m.obstacle_locations)
    survivor_count = len(m.survivor_locations)

    print(f"✓ Grid created: {m.width}x{m.height}")
    print(f"✓ Obstacles placed: {obstacle_count} cells "
          f"({obstacle_count / total_cells * 100:.1f}%)")
    print(f"✓ Placed {survivor_count} survivors")

    # Test neighbor lookup
    neighbors = m.get_neighbors(5, 5)
    print(f"✓ get_neighbors(5,5) returned {len(neighbors)} neighbors")

    # Test scanning
    m.mark_scanned(5, 5)
    assert m.is_scanned(5, 5), "mark_scanned failed"
    print("✓ mark_scanned / is_scanned working")

    # Test map state format
    state = m.get_map_state()
    assert "grid" in state and "obstacles" in state
    print("✓ get_map_state() returns correct keys")

    print("\nAll map tests passed! ✅")
