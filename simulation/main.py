# =============================================================================
# main.py - Integration Controller for Drone Swarm Simulation
# Team A
# =============================================================================

import sys
import os
import time

# Add the package root to the path so we can run directly
sys.path.insert(0, os.path.dirname(__file__))

from config import SIMULATION_SPEED, MAX_STEPS
from core.map import Map
from core.drone import create_drones


class DroneSwarmSimulation:
    """
    Main controller integrating the Map and Drones.
    Provides the required interfaces for Teams B (Visualization) and C (Detection).
    """

    def __init__(self, seed=None):
        """Initialize the entire simulation."""
        self.map_obj = Map(seed=seed)
        self.drones = create_drones(self.map_obj)
        self.step_counter = 0
        self.running = True

    # ------------------------------------------------------------------
    # Core Logic
    # ------------------------------------------------------------------

    def step_simulation(self):
        """
        Advance the entire swarm by one simulation tick.
        Called by Team B (Visualization) every frame or at a fixed tick rate.

        Returns:
            The current step number.
        """
        if not self.running:
            return self.step_counter

        self.step_counter += 1
        moved_any = False

        for drone in self.drones:
            moved = drone.move(self.map_obj)
            if moved:
                moved_any = True

        # If no drones moved, the simulation is finished (all areas scanned)
        if not moved_any:
            self.running = False

        return self.step_counter

    # ------------------------------------------------------------------
    # Interface Contract for Team B (Visualization) & Dashboard
    # ------------------------------------------------------------------

    def get_map_state(self):
        """
        Return the exact map format expected by Team B.
        """
        return self.map_obj.get_map_state()

    def get_drone_positions(self):
        """
        Return the exact drone status list expected by Team B.
        """
        return [drone.get_status() for drone in self.drones]

    def get_full_state(self):
        """
        Combined snapshot for debugging or full-state dashboards.
        """
        return {
            "step": self.step_counter,
            "running": self.running,
            "coverage_percentage": self.map_obj.get_coverage_percentage(),
            "map": self.get_map_state(),
            "drones": self.get_drone_positions(),
        }

    # ------------------------------------------------------------------
    # Testing & Demo 
    # ------------------------------------------------------------------

    def run_demo(self, num_steps=100):
        """
        Run a CLI text-based demo showing system progression.
        """
        print("=" * 60)
        print("DRONE SWARM SIMULATION - TEAM A DEMO")
        print("=" * 60)
        print("Initializing Drone Swarm Simulation...")
        
        survivor_count = len(self.map_obj.survivor_locations)
        drone_count = len(self.drones)
        
        print(f"✓ Placed {survivor_count} survivors (hidden)")
        print(f"✓ Simulation ready with {drone_count} drones")
        print(f"\nRunning {num_steps} step demo...")

        for step in range(1, num_steps + 1):
            if not self.running:
                print("\nAll drones idle! Map completely swept.")
                break

            self.step_simulation()

            # Periodically print stats
            if step == 1 or step % 10 == 0 or step == num_steps:
                self._print_stats()

            # Optional artificial delay for visualization could go here
            # time.sleep(SIMULATION_SPEED)

        print("\n" + "=" * 50)
        print("Demo complete!")
        print("\nFinal Statistics:")
        print(f"  Total steps: {self.step_counter}")
        print(f"  Cells scanned: {len(self.map_obj.scanned_cells)}")
        print(f"  Coverage: {self.map_obj.get_coverage_percentage():.1f}%")
        found = len(self.map_obj.found_survivors)
        print(f"  Survivors found: {found} / {survivor_count}")
        print("\n✅ Team A core simulation working!")
        print("   Ready for integration with Teams B & C")

    def _print_stats(self):
        print("-" * 50)
        print(f"Step {self.step_counter}:")
        active = sum(1 for d in self.drones if d.status == 'active')
        print(f"  Scanned cells: {len(self.map_obj.scanned_cells)}")
        print(f"  Active drones: {active}")
        print(f"  Survivors found: {len(self.map_obj.found_survivors)}")


# =============================================================================
# Direct Execution Entry Point
# =============================================================================
if __name__ == "__main__":
    # If standard execution run the 100 step demo
    sim = DroneSwarmSimulation(seed=123)
    sim.run_demo(num_steps=1000)
