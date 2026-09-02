# =============================================================================
# core/fog_of_war.py - Fog of War Map Layer for Drone Swarm Simulation
# Tracks per-cell visibility state for each drone and the swarm collectively
# =============================================================================

from enum import IntEnum
from typing import Set, Tuple, Dict, List, Optional
import numpy as np


class CellVisibility(IntEnum):
    """
    Visibility states for a map cell from the swarm's perspective.

    UNKNOWN  → Never seen by any drone sensor
    REVEALED → Detected by LiDAR scan (obstacle or free, but not deeply scanned)
    SCANNED  → Drone flew directly over and performed detailed sensor scan
    """
    UNKNOWN  = 0
    REVEALED = 1   # Seen by LiDAR
    SCANNED  = 2   # Drone visited in detail


class FogOfWarMap:
    """
    Wraps the true Map with a visibility layer so that drones can only act
    on information they've actually gathered through LiDAR/scanning.

    Key design decisions:
    - Each drone has its OWN private visibility grid
    - The SWARM SHARED grid is the union of all drone grids (via mesh network)
    - The frontend renders the SHARED grid (what the operator can see)
    - Pathfinding uses the PRIVATE grid per drone (each drone plans on what IT knows)

    This enforces the information-limited reality of GPS-denied, isolated swarms.
    """

    def __init__(self, width: int, height: int, num_drones: int = 5):
        self.width = width
        self.height = height
        self.num_drones = num_drones

        # Per-drone visibility grids (private knowledge)
        # Shape: (num_drones, height, width)
        self._drone_grids: np.ndarray = np.zeros(
            (num_drones, height, width), dtype=np.uint8
        )

        # Shared swarm grid (union of all drone grids)
        self._shared_grid: np.ndarray = np.zeros(
            (height, width), dtype=np.uint8
        )

        # Known obstacle cells per drone (from LiDAR)
        self._drone_known_obstacles: List[Set[Tuple[int, int]]] = [
            set() for _ in range(num_drones)
        ]

        # Shared obstacle knowledge (swarm union)
        self._shared_obstacles: Set[Tuple[int, int]] = set()

        # Track when shared grid was last updated
        self._last_sync_step: Dict[int, int] = {}

    # ------------------------------------------------------------------
    # Reveal cells (called after LiDAR scan)
    # ------------------------------------------------------------------

    def reveal_cells(
        self,
        drone_id: int,
        free_cells: Set[Tuple[int, int]],
        obstacle_cells: Set[Tuple[int, int]],
    ) -> None:
        """
        Called after a drone's LiDAR scan to update its private visibility grid.

        Args:
            drone_id:      Which drone is updating
            free_cells:    Cells revealed as passable by LiDAR rays
            obstacle_cells: Cells revealed as obstacles by LiDAR rays
        """
        if drone_id >= self.num_drones:
            return

        for (x, y) in free_cells:
            if self._is_valid(x, y):
                if self._drone_grids[drone_id, y, x] < CellVisibility.REVEALED:
                    self._drone_grids[drone_id, y, x] = CellVisibility.REVEALED

        for (x, y) in obstacle_cells:
            if self._is_valid(x, y):
                self._drone_grids[drone_id, y, x] = CellVisibility.REVEALED
                self._drone_known_obstacles[drone_id].add((x, y))

        # Immediately update shared grid (in real system this would be via mesh)
        self._sync_to_shared(drone_id)

    def mark_scanned(self, drone_id: int, x: int, y: int) -> None:
        """
        Mark a cell as SCANNED (drone flew over it, not just LiDAR-revealed).
        SCANNED is the highest visibility state.
        """
        if not self._is_valid(x, y) or drone_id >= self.num_drones:
            return
        self._drone_grids[drone_id, y, x] = CellVisibility.SCANNED
        if self._shared_grid[y, x] < CellVisibility.SCANNED:
            self._shared_grid[y, x] = CellVisibility.SCANNED

    # ------------------------------------------------------------------
    # Shared knowledge synchronization (simulates mesh network sync)
    # ------------------------------------------------------------------

    def _sync_to_shared(self, drone_id: int) -> None:
        """Update the shared grid with this drone's knowledge (element-wise max)."""
        np.maximum(
            self._shared_grid,
            self._drone_grids[drone_id],
            out=self._shared_grid,
        )
        self._shared_obstacles.update(self._drone_known_obstacles[drone_id])

    def sync_drone_knowledge(self, drone_id_a: int, drone_id_b: int) -> None:
        """
        Simulate two drones sharing knowledge over mesh network.
        Each drone gets the union of both their private grids.
        Called when two drones are within mesh communication range.
        """
        if drone_id_a >= self.num_drones or drone_id_b >= self.num_drones:
            return

        # Union of both grids
        merged = np.maximum(
            self._drone_grids[drone_id_a],
            self._drone_grids[drone_id_b],
        )
        self._drone_grids[drone_id_a] = merged.copy()
        self._drone_grids[drone_id_b] = merged.copy()

        # Obstacle knowledge merge
        merged_obs = (
            self._drone_known_obstacles[drone_id_a]
            | self._drone_known_obstacles[drone_id_b]
        )
        self._drone_known_obstacles[drone_id_a] = set(merged_obs)
        self._drone_known_obstacles[drone_id_b] = set(merged_obs)

        # Update shared
        self._sync_to_shared(drone_id_a)

    # ------------------------------------------------------------------
    # Query methods for pathfinding and detection
    # ------------------------------------------------------------------

    def is_visible_to_drone(self, drone_id: int, x: int, y: int) -> bool:
        """Return True if drone can see this cell (revealed or scanned)."""
        if not self._is_valid(x, y) or drone_id >= self.num_drones:
            return False
        return self._drone_grids[drone_id, y, x] >= CellVisibility.REVEALED

    def is_known_obstacle_to_drone(self, drone_id: int, x: int, y: int) -> bool:
        """Return True if this drone knows (x, y) is an obstacle."""
        if drone_id >= self.num_drones:
            return False
        return (x, y) in self._drone_known_obstacles[drone_id]

    def is_known_obstacle_shared(self, x: int, y: int) -> bool:
        """Return True if ANY drone in the swarm has identified this as obstacle."""
        return (x, y) in self._shared_obstacles

    def get_visibility(self, x: int, y: int) -> CellVisibility:
        """Return the shared swarm visibility for cell (x, y)."""
        if not self._is_valid(x, y):
            return CellVisibility.UNKNOWN
        return CellVisibility(int(self._shared_grid[y, x]))

    def get_drone_visibility(self, drone_id: int, x: int, y: int) -> CellVisibility:
        """Return a specific drone's visibility for cell (x, y)."""
        if not self._is_valid(x, y) or drone_id >= self.num_drones:
            return CellVisibility.UNKNOWN
        return CellVisibility(int(self._drone_grids[drone_id, y, x]))

    def get_unexplored_cells(self) -> List[Tuple[int, int]]:
        """Return all cells still unknown to the swarm (for coverage calculation)."""
        result = []
        for y in range(self.height):
            for x in range(self.width):
                if self._shared_grid[y, x] == CellVisibility.UNKNOWN:
                    result.append((x, y))
        return result

    def get_coverage_stats(self) -> dict:
        """Return fog-of-war coverage statistics."""
        total = self.width * self.height
        unknown = int(np.sum(self._shared_grid == CellVisibility.UNKNOWN))
        revealed = int(np.sum(self._shared_grid == CellVisibility.REVEALED))
        scanned = int(np.sum(self._shared_grid == CellVisibility.SCANNED))
        return {
            "total_cells": total,
            "unknown": unknown,
            "revealed": revealed,
            "scanned": scanned,
            "explored_pct": round((total - unknown) / total * 100, 2),
            "scanned_pct": round(scanned / total * 100, 2),
        }

    # ------------------------------------------------------------------
    # Export for visualization
    # ------------------------------------------------------------------

    def get_shared_grid_for_viz(self) -> List[List[int]]:
        """Return shared visibility grid as nested list (for JSON serialization)."""
        return self._shared_grid.tolist()

    def get_drone_known_obstacles(self, drone_id: int) -> List[dict]:
        """Return this drone's known obstacles as a list of {x, y} dicts."""
        if drone_id >= self.num_drones:
            return []
        return [{"x": x, "y": y} for (x, y) in self._drone_known_obstacles[drone_id]]

    def get_shared_known_obstacles(self) -> List[dict]:
        """Return all shared obstacle knowledge as {x, y} dicts."""
        return [{"x": x, "y": y} for (x, y) in self._shared_obstacles]

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    def _is_valid(self, x: int, y: int) -> bool:
        return 0 <= x < self.width and 0 <= y < self.height

    def reset(self) -> None:
        """Reset all visibility to UNKNOWN (start of new mission)."""
        self._drone_grids.fill(0)
        self._shared_grid.fill(0)
        for s in self._drone_known_obstacles:
            s.clear()
        self._shared_obstacles.clear()


# =============================================================================
# Standalone Test
# =============================================================================
if __name__ == "__main__":
    print("Testing FogOfWarMap...")

    fow = FogOfWarMap(width=50, height=50, num_drones=3)

    # Drone 0 reveals some cells
    free = {(5, 5), (6, 5), (7, 5), (8, 5)}
    obs = {(9, 5)}
    fow.reveal_cells(drone_id=0, free_cells=free, obstacle_cells=obs)

    assert fow.is_visible_to_drone(0, 5, 5), "Drone 0 should see (5,5)"
    assert not fow.is_visible_to_drone(1, 5, 5), "Drone 1 should NOT see (5,5)"
    assert fow.is_known_obstacle_to_drone(0, 9, 5), "Drone 0 should know (9,5) is obstacle"
    print("✓ Per-drone visibility working")

    # Sync drones 0 and 1
    fow.sync_drone_knowledge(0, 1)
    assert fow.is_visible_to_drone(1, 5, 5), "After sync, Drone 1 should see (5,5)"
    print("✓ Drone knowledge sync working")

    # Mark scanned
    fow.mark_scanned(0, 5, 5)
    assert fow.get_visibility(5, 5) == CellVisibility.SCANNED, "Should be SCANNED"
    print("✓ Mark scanned working")

    # Stats
    stats = fow.get_coverage_stats()
    print(f"✓ Coverage stats: {stats}")
    assert stats["explored_pct"] > 0

    print("\nAll FogOfWar tests passed! ✅")
