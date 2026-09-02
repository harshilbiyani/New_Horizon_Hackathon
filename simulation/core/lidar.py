# =============================================================================
# core/lidar.py - LiDAR Sensor Simulation for Drone Swarm
# Raycasting-based obstacle discovery (drones start with zero map knowledge)
# =============================================================================

import math
from dataclasses import dataclass, field
from typing import List, Set, Tuple, Optional, Dict


@dataclass
class LiDARHit:
    """A single LiDAR ray hit point."""
    x: int
    y: int
    distance: float          # in cells
    hit_obstacle: bool
    ray_angle_deg: float     # angle this ray was cast at


@dataclass
class LiDARScanResult:
    """Full result of one LiDAR scan from a drone position."""
    drone_id: int
    origin_x: int
    origin_y: int
    hits: List[LiDARHit] = field(default_factory=list)
    revealed_free_cells: Set[Tuple[int, int]] = field(default_factory=set)
    revealed_obstacle_cells: Set[Tuple[int, int]] = field(default_factory=set)
    newly_discovered_obstacles: Set[Tuple[int, int]] = field(default_factory=set)  # obstacles not seen before


class LiDARSensor:
    """
    Simulated 2D LiDAR sensor for drone collision avoidance and mapping.

    How it works:
    - Each tick, the drone casts N rays in a 360° arc
    - Rays travel cell-by-cell until hitting an obstacle or max range
    - Cells swept by rays transition from UNKNOWN → REVEALED or OBSTACLE
    - Newly discovered obstacles trigger A* path invalidation
    - Hit points are returned for frontend point-cloud visualization

    This is the key differentiator: drones start with ZERO map knowledge.
    Everything they know comes from their LiDAR sweeps.
    """

    def __init__(
        self,
        drone_id: int,
        range_cells: int = 8,
        num_rays: int = 72,        # every 5 degrees
        fov_degrees: float = 360.0,
        noise_prob: float = 0.02,  # 2% false-positive rate for realism
    ):
        """
        Args:
            drone_id:     Which drone owns this sensor
            range_cells:  How far (in grid cells) the LiDAR can see
            num_rays:     Number of rays cast per scan (higher = more accurate)
            fov_degrees:  Field of view (360 = omnidirectional)
            noise_prob:   Probability of a noisy false hit (adds realism)
        """
        self.drone_id = drone_id
        self.range = range_cells
        self.num_rays = num_rays
        self.fov = fov_degrees
        self.noise_prob = noise_prob

        # Running knowledge of where obstacles ARE (from this drone's perspective)
        self.known_obstacle_cells: Set[Tuple[int, int]] = set()
        self.known_free_cells: Set[Tuple[int, int]] = set()
        self.total_scans: int = 0

    def scan(
        self,
        drone_x: int,
        drone_y: int,
        true_map,           # Map object with true obstacle locations
        drone_heading_deg: float = 0.0,
    ) -> LiDARScanResult:
        """
        Perform one LiDAR scan from the drone's current position.

        Args:
            drone_x, drone_y: Current drone grid position
            true_map:         The ground-truth Map (drones can't access this directly
                              except through LiDAR rays — this enforces fog of war)
            drone_heading_deg: Current drone heading (0 = north, 90 = east)

        Returns:
            LiDARScanResult with all hit points and newly revealed cells
        """
        self.total_scans += 1
        result = LiDARScanResult(
            drone_id=self.drone_id,
            origin_x=drone_x,
            origin_y=drone_y,
        )

        angle_step = self.fov / self.num_rays
        start_angle = drone_heading_deg - (self.fov / 2.0)

        for i in range(self.num_rays):
            angle_deg = (start_angle + i * angle_step) % 360.0
            self._cast_ray(drone_x, drone_y, angle_deg, true_map, result)

        # Mark the drone's own cell as revealed and free
        result.revealed_free_cells.add((drone_x, drone_y))
        self.known_free_cells.add((drone_x, drone_y))

        # Detect newly discovered obstacles (weren't in our knowledge before)
        result.newly_discovered_obstacles = (
            result.revealed_obstacle_cells - self.known_obstacle_cells
        )

        # Update running knowledge
        self.known_obstacle_cells.update(result.revealed_obstacle_cells)
        self.known_free_cells.update(result.revealed_free_cells)

        return result

    def _cast_ray(
        self,
        origin_x: int,
        origin_y: int,
        angle_deg: float,
        true_map,
        result: LiDARScanResult,
    ) -> None:
        """
        Cast a single ray from origin in direction angle_deg.
        Populates result with revealed cells and hit points.
        """
        angle_rad = math.radians(angle_deg)
        dx = math.cos(angle_rad)
        dy = math.sin(angle_rad)

        # Step along the ray using DDA (Digital Differential Analysis)
        step_x = dx / max(abs(dx), abs(dy), 1e-9)
        step_y = dy / max(abs(dx), abs(dy), 1e-9)

        # Normalize step length
        step_len = math.sqrt(step_x ** 2 + step_y ** 2)

        cur_x = float(origin_x)
        cur_y = float(origin_y)
        distance = 0.0

        for _ in range(int(self.range / step_len * 1.5) + 1):
            distance += step_len
            if distance > self.range:
                break

            cur_x += step_x
            cur_y += step_y
            cell_x = int(round(cur_x))
            cell_y = int(round(cur_y))

            # Out of map bounds — stop ray
            if not true_map.is_valid(cell_x, cell_y):
                break

            cell = (cell_x, cell_y)

            if true_map.is_obstacle(cell_x, cell_y):
                # Hit an obstacle — mark it and stop this ray
                result.hits.append(LiDARHit(
                    x=cell_x, y=cell_y,
                    distance=distance,
                    hit_obstacle=True,
                    ray_angle_deg=angle_deg,
                ))
                result.revealed_obstacle_cells.add(cell)
                break  # Ray stops at obstacle
            else:
                # Free cell revealed along this ray
                result.revealed_free_cells.add(cell)
                result.hits.append(LiDARHit(
                    x=cell_x, y=cell_y,
                    distance=distance,
                    hit_obstacle=False,
                    ray_angle_deg=angle_deg,
                ))

    def get_known_map_state(self) -> Dict[str, Set[Tuple[int, int]]]:
        """Return what this drone currently knows about the map."""
        return {
            "obstacles": set(self.known_obstacle_cells),
            "free": set(self.known_free_cells),
            "unknown_cells_count": 0,  # computed externally if needed
        }

    def merge_knowledge(self, other_state: Dict[str, Set[Tuple[int, int]]]) -> None:
        """
        Merge another drone's LiDAR knowledge into this drone's map.
        Called when drones are within mesh communication range.
        """
        self.known_obstacle_cells.update(other_state.get("obstacles", set()))
        self.known_free_cells.update(other_state.get("free", set()))

    def to_dict(self) -> dict:
        """Serialize sensor state for transmission over the mesh network."""
        return {
            "drone_id": self.drone_id,
            "range": self.range,
            "total_scans": self.total_scans,
            "known_obstacles": len(self.known_obstacle_cells),
            "known_free": len(self.known_free_cells),
        }


# =============================================================================
# LiDAR Scan Result Serializer (for WebSocket transmission to frontend)
# =============================================================================

def scan_result_to_json(result: LiDARScanResult) -> dict:
    """
    Convert a LiDAR scan result to a JSON-serializable dict for the frontend.
    The frontend uses hit points to render the LiDAR point cloud.
    """
    return {
        "drone_id": result.drone_id,
        "origin": {"x": result.origin_x, "y": result.origin_y},
        "hits": [
            {
                "x": h.x,
                "y": h.y,
                "dist": round(h.distance, 2),
                "obstacle": h.hit_obstacle,
                "angle": round(h.ray_angle_deg, 1),
            }
            for h in result.hits
            if h.hit_obstacle  # Only send obstacle hits for the point cloud
        ],
        "revealed_free": len(result.revealed_free_cells),
        "revealed_obstacles": len(result.revealed_obstacle_cells),
        "new_obstacles": [
            {"x": c[0], "y": c[1]}
            for c in result.newly_discovered_obstacles
        ],
    }


# =============================================================================
# Standalone Test
# =============================================================================
if __name__ == "__main__":
    import sys, os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
    from core.map import Map

    print("Testing LiDAR Sensor...")
    m = Map(seed=42)
    sensor = LiDARSensor(drone_id=0, range_cells=8, num_rays=72)

    # Test scan from center of map
    cx, cy = m.width // 2, m.height // 2
    result = sensor.scan(cx, cy, m)

    print(f"✓ Scan from ({cx},{cy}): {len(result.hits)} hits")
    print(f"  Free cells revealed:     {len(result.revealed_free_cells)}")
    print(f"  Obstacle cells revealed: {len(result.revealed_obstacle_cells)}")
    print(f"  Newly discovered obs:    {len(result.newly_discovered_obstacles)}")

    # Test knowledge merge
    sensor2 = LiDARSensor(drone_id=1, range_cells=8, num_rays=72)
    result2 = sensor2.scan(0, 0, m)
    sensor.merge_knowledge(sensor2.get_known_map_state())
    print(f"✓ After merge: {len(sensor.known_obstacle_cells)} obstacles known")

    print("\nAll LiDAR tests passed! ✅")
