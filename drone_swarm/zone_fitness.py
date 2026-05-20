# zone_fitness.py

import math
from config import GRID_SIZE


class ZoneDivider:
    """Divide the grid into zones for efficient coordination."""
    
    def __init__(self, grid_size=GRID_SIZE, zone_size=10):
        """
        Divide grid into square zones.
        
        Args:
            grid_size : int — total grid dimension (50x50)
            zone_size : int — side length of each zone (10x10 = 5 zones per row)
        """
        self.grid_size = grid_size
        self.zone_size = zone_size
        self.zones_per_row = math.ceil(grid_size / zone_size)
        self.total_zones = self.zones_per_row ** 2
    
    def get_zone(self, position):
        """
        Get zone ID for a position (x, y).
        Returns zone_id in range [0, total_zones).
        """
        x, y = position
        zone_x = x // self.zone_size
        zone_y = y // self.zone_size
        return zone_y * self.zones_per_row + zone_x
    
    def get_zone_center(self, zone_id):
        """Get approximate center (x, y) of a zone."""
        zone_y = zone_id // self.zones_per_row
        zone_x = zone_id % self.zones_per_row
        center_x = zone_x * self.zone_size + self.zone_size // 2
        center_y = zone_y * self.zone_size + self.zone_size // 2
        return (center_x, center_y)
    
    def get_zone_bounds(self, zone_id):
        """Get (x_min, y_min, x_max, y_max) bounds of a zone."""
        zone_y = zone_id // self.zones_per_row
        zone_x = zone_id % self.zones_per_row
        x_min = zone_x * self.zone_size
        y_min = zone_y * self.zone_size
        x_max = min(x_min + self.zone_size - 1, self.grid_size - 1)
        y_max = min(y_min + self.zone_size - 1, self.grid_size - 1)
        return (x_min, y_min, x_max, y_max)


def compute_zone_fitness(zone_id, zone_divider, mission_data, drone_positions, threat_map=None):
    """
    Compute fitness score for a zone (0.0 to 1.0).
    Higher score = more attractive to explore next.
    
    Weighted factors:
    - exploration    (0.35): How much has been explored (low = good)
    - survivor_density (0.25): Likelihood of finding survivors here
    - distance       (0.20): How far from nearest drone (closer = good)
    - threat         (0.15): Estimated threat level (low = good)
    - connectivity   (0.05): Can reach other drones from here
    
    Args:
        zone_id          : int     — which zone to score
        zone_divider     : ZoneDivider — grid divider instance
        mission_data     : dict    — aggregated mission snapshots/detections
        drone_positions  : list    — (drone_id, (x, y)) tuples
        threat_map       : dict    — optional zone_id → threat_level mapping
    
    Returns:
        Dict with fitness score and component breakdown
    """
    
    # Component 1: Exploration (0 = fully explored, 1 = unexplored)
    coverage = mission_data.get("coverage_cells", set()) if isinstance(mission_data.get("coverage_cells"), set) else set()
    zone_bounds = zone_divider.get_zone_bounds(zone_id)
    zone_cells = _get_zone_cells(zone_bounds)
    explored_in_zone = len(zone_cells.intersection(coverage))
    total_zone_cells = len(zone_cells)
    exploration_score = 1.0 - (explored_in_zone / total_zone_cells if total_zone_cells > 0 else 1.0)
    exploration_score = round(max(0, min(1, exploration_score)), 3)
    
    # Component 2: Survivor density (prior from past detections)
    unique_survivors = mission_data.get("unique_survivors", {})
    survivors_in_zone = sum(1 for sid, data in unique_survivors.items() 
                           if _is_in_zone(data["location"], zone_bounds))
    max_survivors_per_zone = 3  # normalized expectation
    survivor_density = min(1.0, survivors_in_zone / max(1, max_survivors_per_zone))
    survivor_density = round(survivor_density, 3)
    
    # Component 3: Distance to nearest drone
    zone_center = zone_divider.get_zone_center(zone_id)
    min_dist = float('inf')
    for drone_id, pos in drone_positions:
        dist = math.sqrt((zone_center[0] - pos[0])**2 + (zone_center[1] - pos[1])**2)
        min_dist = min(min_dist, dist)
    
    # Normalize distance: 0 = at drone, 1 = at farthest corner
    max_possible_dist = math.sqrt(2) * (GRID_SIZE / 2)
    distance_score = min(1.0, min_dist / max(1, max_possible_dist))
    distance_score = round(distance_score, 3)
    
    # Component 4: Threat level
    if threat_map and zone_id in threat_map:
        threat_level = threat_map[zone_id]
    else:
        threat_level = 0.1  # baseline low threat
    threat_score = 1.0 - threat_level  # invert: high threat = low score
    threat_score = round(max(0, min(1, threat_score)), 3)
    
    # Component 5: Connectivity (can reach other drones)
    connectivity_range = 15  # units
    drones_in_range = sum(1 for drone_id, pos in drone_positions
                         if math.sqrt((zone_center[0] - pos[0])**2 + 
                                     (zone_center[1] - pos[1])**2) <= connectivity_range)
    connectivity_score = min(1.0, drones_in_range / 3.0)  # expect ~3 drones nearby
    connectivity_score = round(connectivity_score, 3)
    
    # Weighted combination
    final_score = (
        0.35 * exploration_score +
        0.25 * survivor_density +
        0.20 * distance_score +
        0.15 * threat_score +
        0.05 * connectivity_score
    )
    final_score = round(min(1.0, final_score), 4)
    
    # Fitness label
    if final_score >= 0.70:
        label = "EXCELLENT"
    elif final_score >= 0.50:
        label = "GOOD"
    elif final_score >= 0.30:
        label = "FAIR"
    else:
        label = "POOR"
    
    return {
        "zone_id": zone_id,
        "final_score": final_score,
        "label": label,
        "components": {
            "exploration": exploration_score,
            "survivor_density": survivor_density,
            "distance": distance_score,
            "threat": threat_score,
            "connectivity": connectivity_score
        },
        "zone_center": zone_center,
        "cells_explored": explored_in_zone,
        "cells_total": total_zone_cells
    }


def rank_zones(zone_fitness_list):
    """
    Sort zones by fitness score (descending).
    Returns ranked list with position labels.
    """
    ranked = sorted(zone_fitness_list, key=lambda z: z["final_score"], reverse=True)
    for idx, zone_data in enumerate(ranked):
        zone_data["rank"] = idx + 1
    return ranked


# ─── Helper functions ───────────────────────────────────────────

def _get_zone_cells(zone_bounds):
    """Get all cell positions within zone bounds as a set."""
    x_min, y_min, x_max, y_max = zone_bounds
    cells = set()
    for x in range(x_min, x_max + 1):
        for y in range(y_min, y_max + 1):
            cells.add((x, y))
    return cells


def _is_in_zone(position, zone_bounds):
    """Check if position is within zone bounds."""
    x, y = position
    x_min, y_min, x_max, y_max = zone_bounds
    return x_min <= x <= x_max and y_min <= y <= y_max
