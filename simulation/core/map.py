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

    def __init__(self, seed=None):
        """
        Initialize the map.

        Args:
            seed: Optional random seed for reproducibility.
        """
        if seed is not None:
            np.random.seed(seed)
            random.seed(seed)

        # Internal grid (full truth – includes hidden survivors)
        self.width = GRID_WIDTH
        self.height = GRID_HEIGHT
        self.grid = np.zeros((self.height, self.width), dtype=np.int8)

        # Fast lookup structures
        self.scanned_cells = set()
        self.obstacle_locations = []
        self.survivor_locations = []
        self.found_survivors = set()

        # Build world
        self._place_obstacles()
        self._place_survivors()

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
        target_obstacles = int(self.width * self.height * OBSTACLE_DENSITY)
        placed = 0
        max_attempts = target_obstacles * 20  # safety cap
        attempts = 0

        while placed < target_obstacles and attempts < max_attempts:
            attempts += 1
            # Random cluster origin
            ox = random.randint(0, self.width - 1)
            oy = random.randint(0, self.height - 1)
            cluster_size = random.randint(MIN_OBSTACLE_SIZE, MAX_OBSTACLE_SIZE)

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
                    self.obstacle_locations.append((cx, cy))
                    placed += 1
                    if placed >= target_obstacles:
                        break

    def _place_survivors(self):
        """
        Place NUM_SURVIVORS in random, non-obstacle cells.
        Survivors are marked internally but appear as CELL_EMPTY to drones.
        """
        placed = 0
        max_attempts = NUM_SURVIVORS * 100
        attempts = 0

        while placed < NUM_SURVIVORS and attempts < max_attempts:
            attempts += 1
            x = random.randint(0, self.width - 1)
            y = random.randint(0, self.height - 1)

            if self.grid[y][x] == CELL_EMPTY:
                self.grid[y][x] = CELL_SURVIVOR
                self.survivor_locations.append((x, y))
                placed += 1

        if placed < NUM_SURVIVORS:
            print(f"⚠ Could only place {placed}/{NUM_SURVIVORS} survivors (grid too crowded).")

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
        return self.grid[y][x] == CELL_OBSTACLE

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

    def mark_survivor_found(self, x, y):
        """Mark survivor at (x, y) as found/rescued."""
        if self.get_survivor_at(x, y):
            self.found_survivors.add((x, y))

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

    def get_neighbors(self, x, y):
        """
        Return list of passable 4-directional neighbors of (x, y).
        Excludes out-of-bounds and obstacle cells.
        """
        neighbors = []
        for dx, dy in [(0, -1), (0, 1), (-1, 0), (1, 0)]:
            nx, ny = x + dx, y + dy
            if self.is_valid(nx, ny) and not self.is_obstacle(nx, ny):
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
            "grid": self.grid.copy(),
            "width": self.width,
            "height": self.height,
            "obstacles": list(self.obstacle_locations),
            "scanned_cells": list(self.scanned_cells),
            "survivor_locations": list(self.survivor_locations),
            "found_survivors": list(self.found_survivors),
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
