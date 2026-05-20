"""
A* Path Planner for Autonomous Drone Navigation
Provides intelligent path planning with obstacle avoidance
"""

import heapq
import math
from typing import List, Tuple, Dict, Optional
from dataclasses import dataclass


@dataclass
class PathNode:
    """Represents a node in the path planning search."""
    position: Tuple[int, int]
    g_score: float = float('inf')  # Cost from start
    h_score: float = 0.0           # Heuristic cost to goal
    
    @property
    def f_score(self) -> float:
        """Total estimated cost (g + h)."""
        return self.g_score + self.h_score
    
    def __lt__(self, other):
        """Enable priority queue comparison."""
        return self.f_score < other.f_score
    
    def __eq__(self, other):
        """Check equality based on position."""
        return self.position == other.position
    
    def __hash__(self):
        """Enable use in sets and dicts."""
        return hash(self.position)


class AStarPlanner:
    """
    A* Path Planner for drone navigation with obstacle avoidance.
    
    Features:
    - Manhattan and Euclidean distance heuristics
    - 4-directional (cardinal) or 8-directional (diagonal) movement
    - Path smoothing for smoother trajectories
    - Detailed diagnostics and metrics
    """
    
    def __init__(self, env, allow_diagonal=False, use_euclidean=False):
        """
        Initialize A* planner.
        
        Args:
            env: Environment object with grid and obstacle data
            allow_diagonal: If True, allow 8-directional movement (diagonal)
            use_euclidean: If True, use Euclidean distance; else Manhattan
        """
        self.env = env
        self.allow_diagonal = allow_diagonal
        self.use_euclidean = use_euclidean
        
        # Movement directions
        self.cardinal_moves = [(0, 1), (1, 0), (-1, 0), (0, -1)]
        self.diagonal_moves = [(1, 1), (1, -1), (-1, 1), (-1, -1)]
        
        # Statistics
        self.last_path_length = 0
        self.last_nodes_explored = 0
        self.last_planning_time = 0.0
    
    def heuristic(self, pos: Tuple[int, int], goal: Tuple[int, int]) -> float:
        """
        Calculate heuristic distance to goal.
        
        Args:
            pos: Current position (x, y)
            goal: Goal position (x, y)
            
        Returns:
            Estimated distance to goal
        """
        x1, y1 = pos
        x2, y2 = goal
        
        if self.use_euclidean:
            # Euclidean distance (straight line)
            return math.sqrt((x2 - x1)**2 + (y2 - y1)**2)
        else:
            # Manhattan distance (grid-based)
            return abs(x2 - x1) + abs(y2 - y1)
    
    def get_neighbors(self, node: Tuple[int, int]) -> List[Tuple[int, int]]:
        """
        Get valid neighboring cells that can be moved to.
        
        Args:
            node: Current position (x, y)
            
        Returns:
            List of valid neighbor positions
        """
        x, y = node
        neighbors = []
        
        # Cardinal directions (always checked)
        moves = self.cardinal_moves.copy()
        
        # Add diagonal directions if enabled
        if self.allow_diagonal:
            moves.extend(self.diagonal_moves)
        
        # Check each potential move
        for dx, dy in moves:
            nx, ny = x + dx, y + dy
            
            # Verify in bounds
            if not (0 <= nx < self.env.size and 0 <= ny < self.env.size):
                continue
            
            # Verify not an obstacle
            if not self.env.can_move_to(nx, ny):
                continue
            
            # Additional diagonal constraint: don't cut corners
            if self.allow_diagonal and abs(dx) == 1 and abs(dy) == 1:
                # Check if adjacent cells are passable (prevent corner cutting)
                if not (self.env.can_move_to(x + dx, y) and 
                        self.env.can_move_to(x, y + dy)):
                    continue
            
            neighbors.append((nx, ny))
        
        return neighbors
    
    def find_path(self, start: Tuple[int, int], goal: Tuple[int, int]) -> List[Tuple[int, int]]:
        """
        Find optimal path from start to goal using A* algorithm.
        
        Args:
            start: Starting position (x, y)
            goal: Goal position (x, y)
            
        Returns:
            List of positions from start to goal (inclusive), or empty list if no path
        """
        import time
        start_time = time.time()
        
        # Validate start and goal
        if not self.env.can_move_to(*start):
            return []
        if not self.env.can_move_to(*goal):
            return []
        
        if start == goal:
            return [start]
        
        # Initialize open set with start node
        open_set = []
        start_node = PathNode(start, g_score=0.0)
        start_node.h_score = self.heuristic(start, goal)
        heapq.heappush(open_set, start_node)
        
        # Track visited nodes for reconstruction
        came_from = {start: None}
        g_scores = {start: 0.0}
        
        # Exploration counter
        nodes_explored = 0
        
        # A* main loop
        while open_set:
            current_node = heapq.heappop(open_set)
            current = current_node.position
            nodes_explored += 1
            
            # Goal reached
            if current == goal:
                path = self._reconstruct_path(came_from, current)
                
                # Store statistics
                self.last_path_length = len(path)
                self.last_nodes_explored = nodes_explored
                self.last_planning_time = time.time() - start_time
                
                return path
            
            # Explore neighbors
            for neighbor in self.get_neighbors(current):
                # Calculate movement cost (1.0 for cardinal, 1.414 for diagonal)
                move_cost = 1.414 if self.allow_diagonal and abs(neighbor[0] - current[0]) == 1 and abs(neighbor[1] - current[1]) == 1 else 1.0
                tentative_g = g_scores[current] + move_cost
                
                # If we found a better path to neighbor
                if neighbor not in g_scores or tentative_g < g_scores[neighbor]:
                    came_from[neighbor] = current
                    g_scores[neighbor] = tentative_g
                    
                    # Create node for priority queue
                    h_score = self.heuristic(neighbor, goal)
                    neighbor_node = PathNode(neighbor, tentative_g, h_score)
                    
                    heapq.heappush(open_set, neighbor_node)
        
        # No path found
        self.last_nodes_explored = nodes_explored
        self.last_planning_time = time.time() - start_time
        return []
    
    def _reconstruct_path(self, came_from: Dict, current: Tuple[int, int]) -> List[Tuple[int, int]]:
        """
        Reconstruct path from start to current by following came_from links.
        
        Args:
            came_from: Dictionary mapping positions to their predecessors
            current: Current position
            
        Returns:
            List of positions from start to current
        """
        path = [current]
        while came_from[current] is not None:
            current = came_from[current]
            path.append(current)
        path.reverse()
        return path
    
    def smooth_path(self, path: List[Tuple[int, int]]) -> List[Tuple[int, int]]:
        """
        Smooth path by removing unnecessary waypoints (line-of-sight optimization).
        
        Args:
            path: Original path from A*
            
        Returns:
            Smoothed path with fewer waypoints
        """
        if len(path) <= 2:
            return path
        
        smoothed = [path[0]]
        
        for i in range(2, len(path)):
            # Check if we can go directly from last smoothed point to path[i]
            if not self._has_line_of_sight(smoothed[-1], path[i]):
                # Can't skip path[i-1], add it
                smoothed.append(path[i - 1])
        
        # Always add goal
        if smoothed[-1] != path[-1]:
            smoothed.append(path[-1])
        
        return smoothed
    
    def _has_line_of_sight(self, start: Tuple[int, int], end: Tuple[int, int]) -> bool:
        """
        Check if there's a direct line of sight between two points (Bresenham's line).
        
        Args:
            start: Starting position
            end: Ending position
            
        Returns:
            True if line is clear, False if blocked
        """
        x0, y0 = start
        x1, y1 = end
        
        dx = abs(x1 - x0)
        dy = abs(y1 - y0)
        sx = 1 if x0 < x1 else -1
        sy = 1 if y0 < y1 else -1
        err = dx - dy
        
        x, y = x0, y0
        
        while True:
            # Check if cell is passable
            if not self.env.can_move_to(x, y):
                return False
            
            if x == x1 and y == y1:
                return True
            
            e2 = 2 * err
            if e2 > -dy:
                err -= dy
                x += sx
            if e2 < dx:
                err += dx
                y += sy
    
    def get_diagnostics(self) -> Dict:
        """
        Get diagnostics from last planning operation.
        
        Returns:
            Dictionary with planning metrics
        """
        return {
            "path_length": self.last_path_length,
            "nodes_explored": self.last_nodes_explored,
            "planning_time_ms": self.last_planning_time * 1000,
            "allow_diagonal": self.allow_diagonal,
            "use_euclidean": self.use_euclidean
        }
    
    def find_nearest_target(self, start: Tuple[int, int], target_type: str) -> Optional[Tuple[int, int]]:
        """
        Find nearest target of a given type (survivor, noise, etc).
        
        Args:
            start: Starting position
            target_type: Type to search for ('S' = survivor, 'H' = noise, etc)
            
        Returns:
            Position of nearest target, or None if not found
        """
        nearest = None
        nearest_dist = float('inf')
        
        for x in range(self.env.size):
            for y in range(self.env.size):
                if self.env.grid[x][y] == target_type:
                    dist = abs(x - start[0]) + abs(y - start[1])
                    if dist < nearest_dist:
                        nearest = (x, y)
                        nearest_dist = dist
        
        return nearest
    
    def plan_route(self, start: Tuple[int, int], target_type: str, smooth: bool = True) -> List[Tuple[int, int]]:
        """
        Plan route from start to nearest target of given type.
        
        Args:
            start: Starting position
            target_type: Type to search for
            smooth: Whether to smooth the path
            
        Returns:
            Path to nearest target
        """
        goal = self.find_nearest_target(start, target_type)
        if goal is None:
            return []
        
        path = self.find_path(start, goal)
        
        if smooth and len(path) > 2:
            path = self.smooth_path(path)
        
        return path


if __name__ == "__main__":
    # Quick test
    from environment import Environment
    
    env = Environment(size=15, obstacle_ratio=0.2, survivor_count=3, noise_ratio=0.1)
    planner = AStarPlanner(env, allow_diagonal=True, use_euclidean=False)
    
    # Find a valid start position
    start = (1, 1)
    while not env.can_move_to(*start):
        start = (start[0] + 1, start[1] + 1)
    
    # Find a survivor
    goal = planner.find_nearest_target(start, 'S')
    
    if goal:
        print(f"Planning path from {start} to {goal}...")
        path = planner.find_path(start, goal)
        print(f"Path found: {len(path)} steps")
        print(f"Diagnostics: {planner.get_diagnostics()}")
    else:
        print("No survivors found")
