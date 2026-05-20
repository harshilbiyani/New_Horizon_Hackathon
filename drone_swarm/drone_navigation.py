"""
Drone Navigation Integration
Shows how to use A* path planner with drone movement and exploration
"""

from environment import Environment
from path_planner import AStarPlanner
from typing import List, Tuple, Dict, Optional


class NavigatingDrone:
    """
    A drone with autonomous path planning and navigation capabilities.
    """
    
    def __init__(self, drone_id: int, start_pos: Tuple[int, int], env: Environment):
        """
        Initialize a navigating drone.
        
        Args:
            drone_id: Unique drone identifier
            start_pos: Starting position (x, y)
            env: Environment reference
        """
        self.drone_id = drone_id
        self.position = start_pos
        self.env = env
        self.path_planner = AStarPlanner(env, allow_diagonal=True)
        
        # Navigation state
        self.current_path = []
        self.path_index = 0
        self.target = None
        self.exploration_count = 0
        self.battery = 100.0
        self.status = "IDLE"  # IDLE, NAVIGATING, EXPLORING, CHARGING
        
        # History
        self.visited_positions = [start_pos]
        self.detections = []
        self.mission_log = []
    
    def move_to_target(self, target: Tuple[int, int]) -> bool:
        """
        Plan and start moving to a target location.
        
        Args:
            target: Target position (x, y)
            
        Returns:
            True if path found, False otherwise
        """
        if not self.env.can_move_to(*target):
            self.mission_log.append(f"DRONE {self.drone_id}: Target {target} is invalid")
            return False
        
        # Plan path
        self.current_path = self.path_planner.find_path(self.position, target)
        
        if not self.current_path:
            self.mission_log.append(f"DRONE {self.drone_id}: No path to {target}")
            return False
        
        self.target = target
        self.path_index = 0
        self.status = "NAVIGATING"
        self.mission_log.append(f"DRONE {self.drone_id}: Path planned to {target} ({len(self.current_path)} steps)")
        
        return True
    
    def move_to_nearest_survivor(self) -> bool:
        """
        Find and move to nearest survivor.
        
        Returns:
            True if path found, False otherwise
        """
        goal = self.path_planner.find_nearest_target(self.position, 'S')
        
        if goal is None:
            self.mission_log.append(f"DRONE {self.drone_id}: No survivors found")
            return False
        
        return self.move_to_target(goal)
    
    def move_one_step(self) -> bool:
        """
        Execute one step along current path.
        
        Returns:
            True if moved, False if at goal or no path
        """
        if not self.current_path or self.path_index >= len(self.current_path) - 1:
            if self.target:
                self.status = "IDLE"
                self.mission_log.append(f"DRONE {self.drone_id}: Reached target {self.target}")
                self.target = None
            return False
        
        # Move to next waypoint
        self.path_index += 1
        self.position = self.current_path[self.path_index]
        self.visited_positions.append(self.position)
        self.battery -= 0.5  # Battery usage per step
        
        return True
    
    def explore_area(self, search_radius: int = 2) -> List[Dict]:
        """
        Scan area around current position for survivors and noise.
        
        Args:
            search_radius: Radius to scan from current position
            
        Returns:
            List of detections found
        """
        detections = []
        x, y = self.position
        
        for dx in range(-search_radius, search_radius + 1):
            for dy in range(-search_radius, search_radius + 1):
                nx, ny = x + dx, y + dy
                
                if 0 <= nx < self.env.size and 0 <= ny < self.env.size:
                    cell = self.env.grid[nx][ny]
                    
                    if cell == 'S':  # Survivor found
                        detections.append({
                            'type': 'SURVIVOR',
                            'position': (nx, ny),
                            'distance': abs(nx - x) + abs(ny - y),
                            'confidence': 0.95
                        })
                    elif cell == 'H':  # Noise detected
                        detections.append({
                            'type': 'NOISE',
                            'position': (nx, ny),
                            'distance': abs(nx - x) + abs(ny - y),
                            'confidence': 0.3
                        })
                    
                    # Mark as explored
                    self.env.mark_explored(nx, ny)
        
        self.detections.extend(detections)
        self.exploration_count += 1
        
        if detections:
            self.mission_log.append(
                f"DRONE {self.drone_id}: Found {len(detections)} at {self.position}"
            )
        
        return detections
    
    def get_status(self) -> Dict:
        """Get current drone status."""
        return {
            'drone_id': self.drone_id,
            'position': self.position,
            'status': self.status,
            'battery': self.battery,
            'target': self.target,
            'path_progress': f"{self.path_index}/{len(self.current_path)-1}" if self.current_path else "N/A",
            'visited_positions': len(self.visited_positions),
            'detections': len(self.detections),
            'exploration_count': self.exploration_count
        }
    
    def print_status(self):
        """Print formatted status."""
        status = self.get_status()
        print(f"\n🚁 Drone {status['drone_id']}")
        print(f"  Position: {status['position']}")
        print(f"  Status: {status['status']}")
        print(f"  Battery: {status['battery']:.1f}%")
        print(f"  Target: {status['target']}")
        print(f"  Path Progress: {status['path_progress']}")
        print(f"  Visited: {status['visited_positions']} positions")
        print(f"  Detections: {status['detections']}")
        print(f"  Explored: {status['exploration_count']} times")


class DroneSwarmNavigator:
    """
    Manages multiple navigating drones in environment.
    """
    
    def __init__(self, env: Environment, num_drones: int = 3):
        """
        Initialize drone swarm.
        
        Args:
            env: Environment reference
            num_drones: Number of drones to deploy
        """
        self.env = env
        self.drones: List[NavigatingDrone] = []
        
        # Deploy drones at corners
        corners = [(1, 1), (1, env.size - 2), (env.size - 2, 1), (env.size - 2, env.size - 2)]
        
        for i in range(min(num_drones, len(corners))):
            start = corners[i]
            if env.can_move_to(*start):
                drone = NavigatingDrone(i + 1, start, env)
                self.drones.append(drone)
    
    def step(self) -> bool:
        """
        Execute one simulation step for all drones.
        
        Returns:
            True if any drone moved, False otherwise
        """
        any_moved = False
        
        for drone in self.drones:
            if drone.status == "NAVIGATING":
                if drone.move_one_step():
                    any_moved = True
                    # Explore upon arrival at each position
                    drone.explore_area(search_radius=1)
            elif drone.status == "IDLE":
                # Find nearest survivor and move to it
                if drone.move_to_nearest_survivor():
                    any_moved = True
        
        return any_moved
    
    def simulate(self, max_steps: int = 100) -> Dict:
        """
        Run simulation for specified steps.
        
        Args:
            max_steps: Maximum simulation steps
            
        Returns:
            Simulation results
        """
        print(f"\n{'='*60}")
        print(f"🚁 DRONE SWARM NAVIGATION SIMULATION")
        print(f"{'='*60}")
        print(f"Drones: {len(self.drones)}")
        print(f"Environment: {self.env.size}x{self.env.size}")
        print(f"Survivors: {len(self.env.survivors)}")
        print(f"Obstacles: {self.env.get_statistics()['obstacles']}")
        print(f"{'='*60}\n")
        
        step = 0
        survivors_found = set()
        
        while step < max_steps:
            # Execute simulation step
            any_moved = self.step()
            
            if not any_moved:
                print(f"⏹️  Simulation complete at step {step}")
                break
            
            step += 1
            
            # Check for survivors found
            for drone in self.drones:
                for detection in drone.detections:
                    if detection['type'] == 'SURVIVOR':
                        survivors_found.add(detection['position'])
            
            # Print progress every 10 steps
            if step % 10 == 0:
                print(f"📊 Step {step}:")
                for drone in self.drones:
                    status = drone.get_status()
                    print(f"  Drone {status['drone_id']}: {status['position']} | "
                          f"Battery: {status['battery']:.1f}% | "
                          f"Detections: {status['detections']}")
                print(f"  Total survivors found: {len(survivors_found)}")
        
        # Final report
        print(f"\n{'='*60}")
        print(f"📋 SIMULATION COMPLETE")
        print(f"{'='*60}")
        
        total_visited = sum(len(d.visited_positions) for d in self.drones)
        total_detections = sum(len(d.detections) for d in self.drones)
        exploration_pct = self.env.get_explored_percentage()
        
        print(f"Steps executed: {step}")
        print(f"Survivors found: {len(survivors_found)}")
        print(f"Total detections: {total_detections}")
        print(f"Total positions visited: {total_visited}")
        print(f"Grid exploration: {exploration_pct:.1f}%")
        
        print(f"\n{'='*60}")
        print("DRONE STATUS SUMMARY")
        print(f"{'='*60}")
        
        for drone in self.drones:
            drone.print_status()
        
        print(f"\n{'='*60}\n")
        
        return {
            'steps': step,
            'survivors_found': len(survivors_found),
            'total_detections': total_detections,
            'total_visited': total_visited,
            'exploration_percentage': exploration_pct,
            'drones': len(self.drones)
        }


if __name__ == "__main__":
    # Create environment and deploy swarm
    env = Environment(size=20, obstacle_ratio=0.2, survivor_count=4, noise_ratio=0.12, seed=42)
    
    # Run navigation simulation
    swarm = DroneSwarmNavigator(env, num_drones=3)
    results = swarm.simulate(max_steps=150)
    
    print("✅ Navigation simulation complete!")
