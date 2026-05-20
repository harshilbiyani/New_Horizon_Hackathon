"""
Realistic Environment Simulation for Drone Swarm
Includes obstacles, survivors, noise, and exploration tracking
"""

import numpy as np
import random
from typing import Tuple, Dict, List


class Environment:
    """
    Grid-based disaster environment simulation.
    
    Cell types:
    - '.' = empty space
    - '#' = obstacle (building, debris)
    - 'S' = survivor (hidden)
    - 'H' = heat noise (false signal)
    - 'D' = drone (visualization only)
    """
    
    def __init__(self, size=20, obstacle_ratio=0.2, survivor_count=5, noise_ratio=0.1, seed=42):
        """
        Initialize environment.
        
        Args:
            size: Grid dimension (size x size)
            obstacle_ratio: Fraction of cells that are obstacles (0.0-1.0)
            survivor_count: Number of survivors to place
            noise_ratio: Fraction of cells with false heat signals (0.0-1.0)
            seed: Random seed for reproducibility
        """
        random.seed(seed)
        np.random.seed(seed)
        
        self.size = size
        self.grid = np.full((size, size), '.', dtype=str)
        self.explored = np.full((size, size), False, dtype=bool)
        self.drone_positions = []  # List of (x, y) drone positions
        
        # Place environment features
        self.place_obstacles(obstacle_ratio)
        self.survivors = self.place_survivors(survivor_count)
        self.noise_sources = self.place_noise(noise_ratio)
        
        print(f"[+] Environment initialized ({size}x{size})")
        print(f"  - Obstacles: {int(size * size * obstacle_ratio)}")
        print(f"  - Survivors: {len(self.survivors)}")
        print(f"  - Noise sources: {len(self.noise_sources)}")
    
    def place_obstacles(self, ratio: float) -> int:
        """
        Place random obstacles on grid.
        
        Args:
            ratio: Fraction of cells to fill with obstacles
            
        Returns:
            Number of obstacles placed
        """
        num_obstacles = int(self.size * self.size * ratio)
        placed = 0
        
        for _ in range(num_obstacles * 2):  # Try 2x to account for failures
            x, y = self.random_empty_cell()
            if x is not None and self.grid[x][y] == '.':
                self.grid[x][y] = '#'
                placed += 1
                if placed >= num_obstacles:
                    break
        
        return placed
    
    def place_survivors(self, count: int) -> List[Tuple[int, int]]:
        """
        Place survivors randomly on grid.
        
        Args:
            count: Number of survivors to place
            
        Returns:
            List of survivor positions (x, y)
        """
        survivors = []
        
        for _ in range(count * 2):  # Try 2x to account for failures
            x, y = self.random_empty_cell()
            if x is not None and self.grid[x][y] == '.':
                self.grid[x][y] = 'S'
                survivors.append((x, y))
                if len(survivors) >= count:
                    break
        
        return survivors
    
    def place_noise(self, ratio: float) -> List[Tuple[int, int]]:
        """
        Place false heat signal sources on grid.
        
        Args:
            ratio: Fraction of cells to fill with noise
            
        Returns:
            List of noise source positions (x, y)
        """
        num_noise = int(self.size * self.size * ratio)
        noise_sources = []
        
        for _ in range(num_noise * 2):  # Try 2x to account for failures
            x, y = self.random_empty_cell()
            if x is not None and self.grid[x][y] == '.':
                self.grid[x][y] = 'H'
                noise_sources.append((x, y))
                if len(noise_sources) >= num_noise:
                    break
        
        return noise_sources
    
    def random_empty_cell(self) -> Tuple[int, int]:
        """
        Find a random empty cell on grid.
        
        Returns:
            (x, y) coordinates of empty cell, or (None, None) if no empty cells
        """
        for _ in range(self.size * self.size):  # Max attempts
            x = random.randint(0, self.size - 1)
            y = random.randint(0, self.size - 1)
            if self.grid[x][y] == '.':
                return x, y
        return None, None
    
    def display(self, show_explored=False):
        """
        Display grid in console.
        
        Args:
            show_explored: If True, show explored cells with different marker
        """
        print("\n" + "=" * (self.size * 2 + 2))
        for i, row in enumerate(self.grid):
            row_str = " ".join(row)
            if show_explored:
                # Add exploration status on right
                explored_count = np.sum(self.explored[i, :])
                row_str += f" | {explored_count}/{self.size}"
            print(row_str)
        print("=" * (self.size * 2 + 2))
        print("Legend: . = empty | # = obstacle | S = survivor | H = heat noise\n")
    
    def mark_explored(self, x: int, y: int, radius: int = 1):
        """
        Mark cells as explored (simulates drone scanning).
        
        Args:
            x, y: Center of explored area
            radius: Scan radius from center
        """
        for dx in range(-radius, radius + 1):
            for dy in range(-radius, radius + 1):
                nx, ny = x + dx, y + dy
                if 0 <= nx < self.size and 0 <= ny < self.size:
                    self.explored[nx][ny] = True
    
    def get_explored_percentage(self) -> float:
        """Get percentage of grid that has been explored."""
        return np.sum(self.explored) / (self.size * self.size) * 100
    
    def is_obstacle(self, x: int, y: int) -> bool:
        """Check if cell is an obstacle."""
        if 0 <= x < self.size and 0 <= y < self.size:
            return self.grid[x][y] == '#'
        return True  # Out of bounds treated as obstacle
    
    def get_signal(self, x: int, y: int, detection_radius: float = 3.0) -> Dict[str, float]:
        """
        Get sensor signals from a position (simulates drone sensor readings).
        
        Args:
            x, y: Drone position
            detection_radius: How far drone can detect from this position
            
        Returns:
            Dictionary with signal strengths for different sensors
        """
        signals = {
            "thermal": 0.1,
            "visual": 0.1,
            "motion": 0.2,
            "audio": 0.05
        }
        
        # Scan nearby cells for survivors and noise
        for sx in range(max(0, x - int(detection_radius)), min(self.size, x + int(detection_radius) + 1)):
            for sy in range(max(0, y - int(detection_radius)), min(self.size, y + int(detection_radius) + 1)):
                distance = np.sqrt((sx - x)**2 + (sy - y)**2)
                
                if distance <= detection_radius and distance > 0:
                    # Attenuation based on distance
                    attenuation = 1.0 - (distance / detection_radius)
                    
                    cell = self.grid[sx][sy]
                    
                    if cell == 'S':  # Real survivor
                        signals["thermal"] = max(signals["thermal"], 0.9 * attenuation)
                        signals["visual"] = max(signals["visual"], 0.8 * attenuation)
                        signals["motion"] = max(signals["motion"], 0.7 * attenuation)  # Movement
                        signals["audio"] = max(signals["audio"], 0.6 * attenuation)  # Calls
                    
                    elif cell == 'H':  # Noise/false signal
                        signals["thermal"] = max(signals["thermal"], 0.6 * attenuation)
                        signals["visual"] = max(signals["visual"], 0.2 * attenuation)
                        signals["motion"] = max(signals["motion"], 0.1 * attenuation)
                        signals["audio"] = max(signals["audio"], 0.05 * attenuation)
        
        return signals
    
    def get_nearby_obstacles(self, x: int, y: int, search_radius: int = 2) -> List[Tuple[int, int]]:
        """
        Get list of nearby obstacles for path planning.
        
        Args:
            x, y: Center position
            search_radius: Search radius
            
        Returns:
            List of obstacle positions
        """
        obstacles = []
        for dx in range(-search_radius, search_radius + 1):
            for dy in range(-search_radius, search_radius + 1):
                nx, ny = x + dx, y + dy
                if 0 <= nx < self.size and 0 <= ny < self.size:
                    if self.grid[nx][ny] == '#':
                        obstacles.append((nx, ny))
        return obstacles
    
    def can_move_to(self, x: int, y: int) -> bool:
        """
        Check if a position is valid for movement (not obstacle, in bounds).
        
        Args:
            x, y: Target position
            
        Returns:
            True if position is valid, False otherwise
        """
        if not (0 <= x < self.size and 0 <= y < self.size):
            return False
        return self.grid[x][y] != '#'
    
    def get_statistics(self) -> Dict:
        """
        Get environment statistics.
        
        Returns:
            Dictionary with environment metrics
        """
        obstacle_count = np.sum(self.grid == '#')
        survivor_count = len(self.survivors)
        noise_count = len(self.noise_sources)
        explored_count = np.sum(self.explored)
        
        return {
            "grid_size": self.size,
            "total_cells": self.size * self.size,
            "obstacles": obstacle_count,
            "survivors": survivor_count,
            "noise_sources": noise_count,
            "explored_cells": explored_count,
            "explored_percentage": self.get_explored_percentage(),
            "empty_cells": np.sum(self.grid == '.')
        }
    
    def print_statistics(self):
        """Print environment statistics."""
        stats = self.get_statistics()
        print("\n📊 ENVIRONMENT STATISTICS")
        print(f"  Grid Size: {stats['grid_size']}x{stats['grid_size']} ({stats['total_cells']} cells)")
        print(f"  Obstacles: {stats['obstacles']} ({stats['obstacles']/stats['total_cells']*100:.1f}%)")
        print(f"  Survivors: {stats['survivors']}")
        print(f"  Noise Sources: {stats['noise_sources']}")
        print(f"  Explored: {stats['explored_cells']}/{stats['total_cells']} ({stats['explored_percentage']:.1f}%)")
        print(f"  Empty Space: {stats['empty_cells']}")
        print()


if __name__ == "__main__":
    # Quick test
    env = Environment(size=15, obstacle_ratio=0.2, survivor_count=3, noise_ratio=0.1)
    env.display()
    env.print_statistics()
