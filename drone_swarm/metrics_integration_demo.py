"""
Performance Metrics Integration Demo
Shows metrics engine integrated with drone swarm navigation and detection
"""

from typing import Dict
from environment import Environment
from drone_navigation import NavigatingDrone
from metrics import Metrics


class InstrumentedDroneNavigator:
    """
    Drone swarm with integrated metrics tracking.
    """
    
    def __init__(self, env: Environment, num_drones: int = 3):
        """
        Initialize instrumented navigator.
        
        Args:
            env: Environment object
            num_drones: Number of drones
        """
        self.env = env
        self.metrics = Metrics()
        self.metrics.load_environment(env)
        
        # Initialize drones
        self.drones = []
        corners = [(1, 1), (1, env.size - 2), (env.size - 2, 1), (env.size - 2, env.size - 2)]
        
        for i in range(min(num_drones, len(corners))):
            start = corners[i]
            if env.can_move_to(*start):
                drone = NavigatingDrone(i + 1, start, env)
                self.drones.append(drone)
                self.metrics.register_drone(i + 1)
    
    def step(self) -> bool:
        """
        Execute one simulation step with metrics tracking.
        
        Returns:
            True if any drone moved
        """
        any_moved = False
        
        for drone in self.drones:
            if drone.status == "NAVIGATING":
                if drone.move_one_step():
                    any_moved = True
                    
                    # Track movement
                    self.metrics.log_drone_movement(drone.drone_id, distance=1.0)
                    
                    # Explore area and log detections
                    detections = drone.explore_area(search_radius=1)
                    for det in detections:
                        is_true = det['type'] == 'SURVIVOR'
                        confidence = det['confidence']
                        
                        # Log detection
                        self.metrics.log_detection(
                            drone.drone_id,
                            det['position'],
                            is_true=is_true,
                            confidence=confidence
                        )
                        
                        # Track exploration cells
                        self.metrics.log_exploration(
                            drone.drone_id,
                            cells_explored=1
                        )
            
            elif drone.status == "IDLE":
                # Find next target
                if drone.move_to_nearest_survivor():
                    any_moved = True
                    
                    # Log path
                    if drone.current_path:
                        path_len = len(drone.current_path)
                        # Estimate optimal path (Manhattan distance)
                        optimal = abs(drone.target[0] - drone.position[0]) + \
                                 abs(drone.target[1] - drone.position[1])
                        
                        self.metrics.log_path(
                            actual_length=path_len,
                            optimal_length=optimal,
                            drone_id=drone.drone_id
                        )
        
        return any_moved
    
    def simulate(self, max_steps: int = 200) -> Dict:
        """
        Run complete simulation with metrics tracking.
        
        Args:
            max_steps: Maximum simulation steps
            
        Returns:
            Final metrics report
        """
        print(f"\n{'='*80}")
        print(f"[DEMO] INSTRUMENTED DRONE SWARM SIMULATION")
        print(f"{'='*80}")
        print(f"Environment: {self.env.size}x{self.env.size}")
        print(f"Drones: {len(self.drones)}")
        print(f"Survivors: {len(self.env.survivors)}")
        print(f"Obstacles: {self.env.get_statistics()['obstacles']}")
        print(f"{'='*80}\n")
        
        step = 0
        
        while step < max_steps:
            # Execute step
            self.metrics.next_step()
            any_moved = self.step()
            
            if not any_moved:
                break
            
            step += 1
            
            # Update exploration metrics
            self.metrics.update_exploration(self.env)
            
            # Print progress every 20 steps
            if step % 20 == 0:
                metrics_snap = self.metrics.compute()
                print(f"[*] Step {step:3d}:")
                print(f"  Accuracy:         {metrics_snap['Detection Accuracy (%)']:>6.2f}%")
                print(f"  Detection Rate:   {metrics_snap['Detection Rate (%)']:>6.2f}%")
                print(f"  Coverage:         {metrics_snap['Coverage (%)']:>6.2f}%")
                print(f"  Path Efficiency:  {metrics_snap['Path Efficiency (%)']:>6.2f}%")
                print(f"  Swarm Efficiency: {metrics_snap['Swarm Efficiency (%)']:>6.2f}%")
        
        # Finalize
        self.metrics.finalize()
        
        # Print full report
        print("\n" + self.metrics.get_detailed_report())
        
        # Extract key metrics
        final_metrics = self.metrics.compute()
        
        return {
            'steps': step,
            'survivors_found': final_metrics['Survivors Detected'],
            'detection_accuracy': final_metrics['Detection Accuracy (%)'],
            'detection_rate': final_metrics['Detection Rate (%)'],
            'coverage': final_metrics['Coverage (%)'],
            'path_efficiency': final_metrics['Path Efficiency (%)'],
            'swarm_efficiency': final_metrics['Swarm Efficiency (%)'],
            'false_positives': final_metrics['False Positives']
        }
    
    def print_key_metrics_summary(self):
        """Print judiciary-friendly summary."""
        metrics = self.metrics.compute()
        
        print("\n" + "=" * 80)
        print("[REPORT] KEY METRICS SUMMARY")
        print("=" * 80)
        
        # Generate compelling summary
        judge_summary = (
            f"Our autonomous drone swarm achieves "
            f"{metrics['Detection Accuracy (%)']:.1f}% detection accuracy, "
            f"discovering {metrics['Survivors Detected']}/{metrics['Total Survivors']} survivors, "
            f"with {metrics['Path Efficiency (%)']:.1f}% path planning efficiency "
            f"and {metrics['Coverage (%)']:.1f}% grid coverage."
        )
        
        print(f"\n[SUMMARY] {judge_summary}\n")
        print("=" * 80 + "\n")


def run_standard_demo():
    """Run standard performance evaluation."""
    print("\n" + "="*80)
    print("[EVAL] STANDARD PERFORMANCE EVALUATION")
    print("="*80)
    
    env = Environment(size=20, obstacle_ratio=0.2, survivor_count=5, noise_ratio=0.12, seed=42)
    sim = InstrumentedDroneNavigator(env, num_drones=3)
    
    results = sim.simulate(max_steps=300)
    sim.print_key_metrics_summary()
    
    return results


if __name__ == "__main__":
    # Run standard performance evaluation
    results = run_standard_demo()
    
    print("\n" + "="*80)
    print("[OK] METRICS INTEGRATION DEMO COMPLETE")
    print("="*80 + "\n")
