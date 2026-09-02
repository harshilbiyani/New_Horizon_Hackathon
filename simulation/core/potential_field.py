# =============================================================================
# core/potential_field.py - Potential Field Obstacle Avoidance
# Reactive local navigation layer (operates below A* strategic planning)
# =============================================================================

import math
from typing import List, Tuple, Set, Optional
from dataclasses import dataclass, field


@dataclass
class ForceVector:
    """A 2D force vector in grid space."""
    fx: float = 0.0
    fy: float = 0.0

    def magnitude(self) -> float:
        return math.sqrt(self.fx ** 2 + self.fy ** 2)

    def normalized(self) -> "ForceVector":
        m = self.magnitude()
        if m < 1e-9:
            return ForceVector(0.0, 0.0)
        return ForceVector(self.fx / m, self.fy / m)

    def __add__(self, other: "ForceVector") -> "ForceVector":
        return ForceVector(self.fx + other.fx, self.fy + other.fy)

    def to_dict(self) -> dict:
        return {"fx": round(self.fx, 4), "fy": round(self.fy, 4), "magnitude": round(self.magnitude(), 4)}


class PotentialFieldNavigator:
    """
    Artificial Potential Field (APF) navigation for reactive obstacle avoidance.

    Hybrid role in the algorithm stack:
    ┌─────────────────────────────────────────────────────────┐
    │ Strategic: ABC assigns zone targets to drones           │
    │ Tactical:  A* computes grid path to assigned zone       │
    │ Reactive:  APF deflects path locally when obstacle near │  ← This module
    └─────────────────────────────────────────────────────────┘

    Forces:
    - REPULSIVE: obstacles and other drones push away
    - ATTRACTIVE: next A* waypoint pulls toward it
    - BOUNDARY: map edges push inward

    When combined, the net force gives a smooth deflection heading that
    avoids local obstacles while still progressing toward the A* waypoint.
    """

    def __init__(
        self,
        # Repulsive constants
        obstacle_repulsion_gain: float = 2.5,
        obstacle_influence_radius: float = 4.0,   # cells
        drone_repulsion_gain: float = 1.5,
        drone_influence_radius: float = 3.0,       # cells
        # Attractive constants
        goal_attraction_gain: float = 1.0,
        # Boundary constants
        boundary_gain: float = 3.0,
        boundary_margin: int = 4,                  # cells from edge
    ):
        self.k_obs = obstacle_repulsion_gain
        self.r_obs = obstacle_influence_radius
        self.k_drone = drone_repulsion_gain
        self.r_drone = drone_influence_radius
        self.k_goal = goal_attraction_gain
        self.k_boundary = boundary_gain
        self.boundary_margin = boundary_margin

    # ------------------------------------------------------------------
    # Main API
    # ------------------------------------------------------------------

    def compute_net_force(
        self,
        drone_x: float,
        drone_y: float,
        goal_x: float,
        goal_y: float,
        known_obstacles: Set[Tuple[int, int]],
        other_drone_positions: List[Tuple[float, float]],
        map_width: int,
        map_height: int,
    ) -> ForceVector:
        """
        Compute the net potential field force at the drone's position.

        Args:
            drone_x, drone_y:        Current drone position
            goal_x, goal_y:          Next A* waypoint (attractive target)
            known_obstacles:         Obstacle cells this drone knows about (from LiDAR)
            other_drone_positions:   Positions of other drones (repulsive)
            map_width, map_height:   Map dimensions for boundary forces

        Returns:
            Net ForceVector — add to current heading to get deflected heading
        """
        f_attr = self._attractive_force(drone_x, drone_y, goal_x, goal_y)
        f_rep_obs = self._obstacle_repulsion(drone_x, drone_y, known_obstacles)
        f_rep_drones = self._drone_repulsion(drone_x, drone_y, other_drone_positions)
        f_boundary = self._boundary_force(drone_x, drone_y, map_width, map_height)

        net = f_attr + f_rep_obs + f_rep_drones + f_boundary
        return net

    def get_deflected_heading(
        self,
        drone_x: float,
        drone_y: float,
        goal_x: float,
        goal_y: float,
        known_obstacles: Set[Tuple[int, int]],
        other_drone_positions: List[Tuple[float, float]],
        map_width: int,
        map_height: int,
        current_heading_deg: float = 0.0,
        force_blend: float = 0.4,  # How much force deflects from pure A* heading
    ) -> Tuple[float, ForceVector]:
        """
        Return a deflected heading (in degrees) based on potential field forces.

        The heading blends:
        - Pure A* direction (1 - force_blend)
        - Force field direction (force_blend)

        This keeps strategic A* control while reactively avoiding obstacles.

        Returns:
            (deflected_heading_deg, net_force)
        """
        net_force = self.compute_net_force(
            drone_x, drone_y, goal_x, goal_y,
            known_obstacles, other_drone_positions,
            map_width, map_height,
        )

        if net_force.magnitude() < 1e-6:
            return current_heading_deg, net_force

        force_heading_deg = math.degrees(math.atan2(net_force.fy, net_force.fx)) % 360.0

        # Blend current heading with force heading
        delta = (force_heading_deg - current_heading_deg + 540.0) % 360.0 - 180.0
        deflected = (current_heading_deg + force_blend * delta) % 360.0

        return deflected, net_force

    def is_in_obstacle_field(
        self,
        drone_x: float,
        drone_y: float,
        known_obstacles: Set[Tuple[int, int]],
    ) -> bool:
        """Quick check: is the drone currently inside any obstacle's influence zone?"""
        for (ox, oy) in known_obstacles:
            dist = math.sqrt((drone_x - ox) ** 2 + (drone_y - oy) ** 2)
            if dist < self.r_obs:
                return True
        return False

    # ------------------------------------------------------------------
    # Force components
    # ------------------------------------------------------------------

    def _attractive_force(
        self, x: float, y: float, gx: float, gy: float
    ) -> ForceVector:
        """Pull toward goal (A* waypoint) — linear attraction."""
        dx = gx - x
        dy = gy - y
        dist = math.sqrt(dx ** 2 + dy ** 2)
        if dist < 1e-9:
            return ForceVector(0.0, 0.0)

        # Quadratic attractive potential (gets stronger as drone approaches goal)
        # Capped to prevent oscillation near goal
        strength = self.k_goal * min(dist, 5.0)
        return ForceVector(strength * dx / dist, strength * dy / dist)

    def _obstacle_repulsion(
        self,
        x: float,
        y: float,
        obstacles: Set[Tuple[int, int]],
    ) -> ForceVector:
        """
        Push away from known obstacles.
        Uses inverse-square repulsion within influence radius.
        Only considers obstacles within influence radius for efficiency.
        """
        total = ForceVector()

        for (ox, oy) in obstacles:
            dx = x - ox
            dy = y - oy
            dist = math.sqrt(dx ** 2 + dy ** 2)

            if dist >= self.r_obs or dist < 1e-9:
                continue

            # Conic repulsive potential
            factor = self.k_obs * (1.0 / dist - 1.0 / self.r_obs) * (1.0 / dist ** 2)
            total.fx += factor * dx / dist
            total.fy += factor * dy / dist

        return total

    def _drone_repulsion(
        self,
        x: float,
        y: float,
        other_positions: List[Tuple[float, float]],
    ) -> ForceVector:
        """
        Push away from other drones to maintain safe separation.
        Prevents drone clustering and collision.
        """
        total = ForceVector()

        for (ox, oy) in other_positions:
            dx = x - ox
            dy = y - oy
            dist = math.sqrt(dx ** 2 + dy ** 2)

            if dist >= self.r_drone or dist < 1e-9:
                continue

            factor = self.k_drone * (1.0 / dist - 1.0 / self.r_drone) * (1.0 / dist ** 2)
            total.fx += factor * dx / dist
            total.fy += factor * dy / dist

        return total

    def _boundary_force(
        self,
        x: float,
        y: float,
        width: int,
        height: int,
    ) -> ForceVector:
        """Push away from map edges."""
        total = ForceVector()
        m = float(self.boundary_margin)

        if x < m:
            total.fx += self.k_boundary * (m - x) / (m + 1)
        elif x > width - 1 - m:
            total.fx -= self.k_boundary * (x - (width - 1 - m)) / (m + 1)

        if y < m:
            total.fy += self.k_boundary * (m - y) / (m + 1)
        elif y > height - 1 - m:
            total.fy -= self.k_boundary * (y - (height - 1 - m)) / (m + 1)

        return total

    # ------------------------------------------------------------------
    # Visualization helpers
    # ------------------------------------------------------------------

    def get_field_visualization(
        self,
        width: int,
        height: int,
        known_obstacles: Set[Tuple[int, int]],
        step: int = 4,  # Sample every N cells for performance
    ) -> List[dict]:
        """
        Sample the potential field across the grid for visualization.
        Returns arrow vectors at sampled positions.
        Used by both tkinter visualizer and React dashboard.
        """
        arrows = []
        for y in range(0, height, step):
            for x in range(0, width, step):
                if (x, y) in known_obstacles:
                    continue
                force = self._obstacle_repulsion(x, y, known_obstacles)
                force = force + self._boundary_force(x, y, width, height)
                if force.magnitude() > 0.05:
                    arrows.append({
                        "x": x, "y": y,
                        **force.to_dict()
                    })
        return arrows


# =============================================================================
# Standalone Test
# =============================================================================
if __name__ == "__main__":
    print("Testing PotentialFieldNavigator...")

    nav = PotentialFieldNavigator()

    # Drone near obstacle, trying to reach a goal
    obstacles = {(5, 5), (6, 5), (7, 5)}
    others = [(2.0, 3.0)]

    force = nav.compute_net_force(
        drone_x=4.5, drone_y=5.0,
        goal_x=10.0, goal_y=5.0,
        known_obstacles=obstacles,
        other_drone_positions=others,
        map_width=50, map_height=50,
    )
    print(f"✓ Net force: fx={force.fx:.3f}, fy={force.fy:.3f}, |F|={force.magnitude():.3f}")
    assert force.magnitude() > 0, "Should have non-zero force near obstacle"

    heading, force = nav.get_deflected_heading(
        drone_x=4.5, drone_y=5.0,
        goal_x=10.0, goal_y=5.0,
        known_obstacles=obstacles,
        other_drone_positions=others,
        map_width=50, map_height=50,
        current_heading_deg=0.0,
    )
    print(f"✓ Deflected heading: {heading:.1f}° (was 0°)")

    in_field = nav.is_in_obstacle_field(4.5, 5.0, obstacles)
    assert in_field, "Should be in obstacle influence zone"
    print("✓ Obstacle field detection working")

    arrows = nav.get_field_visualization(50, 50, obstacles, step=10)
    assert len(arrows) > 0, "Should generate visualization arrows"
    print(f"✓ Field visualization: {len(arrows)} arrows generated")

    print("\nAll PotentialField tests passed! ✅")
