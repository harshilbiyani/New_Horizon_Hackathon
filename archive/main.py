# =============================================================================
# main.py - Integration Controller for Drone Swarm Simulation
# ENHANCED: LiDAR + Fog of War + Potential Fields + Dead Reckoning + Scenarios
# =============================================================================

import sys
import os
import time

sys.path.insert(0, os.path.dirname(__file__))

from config import (
    SIMULATION_SPEED, MAX_STEPS, DEFAULT_ENVIRONMENT, ENVIRONMENT_PROFILES,
    NUM_DRONES, DR_CORRECTION_RADIUS, GPS_DENIED_MODE,
)
from core.map import Map
from core.drone import create_drones
from core.fog_of_war import FogOfWarMap


class DroneSwarmSimulation:
    """
    Main controller integrating the Map, Drones, LiDAR, Fog of War, and APF.

    Architecture:
    - Map:       Ground truth of terrain (only accessible via LiDAR)
    - Drones:    Agents with LiDAR sensors, A*+APF navigation, dead reckoning
    - FogOfWar:  Shared swarm knowledge — what cells have been discovered
    - Blackboard: Shared mission intelligence (survivor detections, warnings)
    """

    def __init__(self, seed=None, environment_name=DEFAULT_ENVIRONMENT, scenario=None):
        """Initialize the entire simulation, optionally with a pre-built scenario."""
        self.seed = seed
        self.scenario = scenario

        # Apply scenario settings if provided
        if scenario is not None:
            env_name = scenario.get("environment", environment_name)
            self.gps_denied = scenario.get("gps_denied", GPS_DENIED_MODE)
        else:
            env_name = environment_name
            self.gps_denied = GPS_DENIED_MODE

        self.environment_name = env_name if env_name in ENVIRONMENT_PROFILES else DEFAULT_ENVIRONMENT
        self.map_obj = Map(seed=seed, environment_name=self.environment_name)

        # Apply GPS-denied mode to config (affects drone initialization)
        import config as _cfg
        _cfg.GPS_DENIED_MODE = self.gps_denied

        self.drones = create_drones(self.map_obj)
        self.fog = FogOfWarMap(
            width=self.map_obj.width,
            height=self.map_obj.height,
            num_drones=len(self.drones),
        )

        self.step_counter = 0
        self.running = True
        self.last_step_detections = []

        # Scenario-specific state
        self._dynamic_events_pending = list(scenario.get("events", [])) if scenario else []
        self._triggered_events = []

        # Mesh network comms range for DR correction
        self._dr_correction_radius = DR_CORRECTION_RADIUS

        # LiDAR scan data for current step (for dashboard)
        self.last_lidar_scans = []

    def reset(self, seed=None, environment_name=None, scenario=None):
        """Reset simulation state with optional changes."""
        if seed is not None:
            self.seed = seed
        if scenario is not None:
            self.scenario = scenario

        env_name = environment_name or (
            scenario.get("environment") if scenario else None
        ) or self.environment_name

        self.__init__(seed=self.seed, environment_name=env_name, scenario=self.scenario)

    def set_environment(self, environment_name, seed=None):
        """Switch simulation environment and restart the mission."""
        self.reset(seed=seed, environment_name=environment_name)

    def set_gps_denied(self, enabled: bool) -> None:
        """Toggle GPS-denied mode mid-simulation (for demo toggle)."""
        self.gps_denied = enabled
        import config as _cfg
        _cfg.GPS_DENIED_MODE = enabled
        for drone in self.drones:
            drone.gps_denied = enabled
            if not enabled:
                # Snap estimated position to true position when GPS comes back
                drone.estimated_x = float(drone.x)
                drone.estimated_y = float(drone.y)
                drone.position_uncertainty = 0.0

    @staticmethod
    def get_environment_options():
        return list(ENVIRONMENT_PROFILES.keys())

    # ------------------------------------------------------------------
    # Core Logic
    # ------------------------------------------------------------------

    def step_simulation(self):
        """
        Advance the entire swarm by one simulation tick.

        Enhanced pipeline:
        1. Process any scheduled scenario events (aftershocks, jamming, etc.)
        2. Advance map environment state (wind, visibility, dynamic hazards)
        3. Collect swarm positions for APF inter-drone repulsion
        4. Move each drone (LiDAR scan → path plan → move → dead reckon)
        5. Collaborative DR correction between nearby drones
        6. Sync fog-of-war between drones in mesh range
        7. Check if mission is complete

        Returns:
            Current step number
        """
        if not self.running:
            return self.step_counter

        self.step_counter += 1
        self.map_obj.start_new_step(self.step_counter)

        # ── Process scenario events ───────────────────────────────────
        self._process_scenario_events()

        # ── Collect swarm positions for APF ──────────────────────────
        swarm_positions = [(d.x, d.y) for d in self.drones]

        # ── Move all drones ───────────────────────────────────────────
        moved_any = False
        self.last_lidar_scans = []

        for drone in self.drones:
            moved = drone.move(self.map_obj, self.fog, swarm_positions)
            if moved:
                moved_any = True
            if drone.last_lidar_json:
                self.last_lidar_scans.append(drone.last_lidar_json)

        # ── Collaborative corrections (when drones are close) ─────────
        self._do_collaborative_corrections()

        # ── Fog of war: sync knowledge between nearby drones ─────────
        self._sync_fog_between_nearby_drones()

        # ── Check completion ─────────────────────────────────────────
        if not moved_any:
            self.running = False

        self.last_step_detections = self.map_obj.get_recent_detections()
        return self.step_counter

    def _process_scenario_events(self):
        """Trigger pre-scheduled scenario events at the right step."""
        still_pending = []
        for event in self._dynamic_events_pending:
            if self.step_counter >= event.get("at_step", 0):
                self._trigger_event(event)
                self._triggered_events.append({**event, "triggered_at": self.step_counter})
            else:
                still_pending.append(event)
        self._dynamic_events_pending = still_pending

    def _trigger_event(self, event: dict):
        """Apply a scenario event to the simulation state."""
        kind = event.get("type", "")

        if kind == "new_obstacle":
            # Inject a new obstacle into the map (e.g., aftershock causes building collapse)
            cells = event.get("cells", [])
            for (x, y) in cells:
                if self.map_obj.is_valid(x, y) and not self.map_obj.is_obstacle(x, y):
                    self.map_obj.grid[y][x] = 1  # CELL_OBSTACLE
                    self.map_obj.obstacle_set.add((x, y))
                    self.map_obj.obstacle_locations.append((x, y))
                    # Invalidate any drone paths passing through these cells
                    for drone in self.drones:
                        if drone.current_path and (x, y) in drone.current_path:
                            drone.current_path = []
                            drone._path_target = None

        elif kind == "gps_denied":
            self.set_gps_denied(True)

        elif kind == "gps_restored":
            self.set_gps_denied(False)

        elif kind == "comm_jamming":
            # Reduce mesh range (simulate jamming)
            self._dr_correction_radius = max(1, self._dr_correction_radius // 2)

        elif kind == "flood_rise":
            # Make a set of cells impassable (rising water)
            cells = event.get("cells", [])
            for (x, y) in cells:
                if self.map_obj.is_valid(x, y) and not self.map_obj.is_obstacle(x, y):
                    self.map_obj.grid[y][x] = 1
                    self.map_obj.obstacle_set.add((x, y))
                    self.map_obj.obstacle_locations.append((x, y))
                    for drone in self.drones:
                        if drone.current_path and (x, y) in drone.current_path:
                            drone.current_path = []
                            drone._path_target = None

        elif kind == "visibility_drop":
            # Reduce environment visibility (night / smoke)
            for drone in self.drones:
                drone.environment_visibility = max(0.2, drone.environment_visibility * 0.5)

    def _do_collaborative_corrections(self):
        """
        When two drones are within DR_CORRECTION_RADIUS cells, they share
        position estimates to reduce accumulated dead reckoning drift.
        """
        if not self.gps_denied:
            return
        for i, d_a in enumerate(self.drones):
            for j, d_b in enumerate(self.drones):
                if j <= i:
                    continue
                dist = ((d_a.x - d_b.x) ** 2 + (d_a.y - d_b.y) ** 2) ** 0.5
                if dist <= self._dr_correction_radius:
                    d_a.correct_dead_reckoning(d_b)

    def _sync_fog_between_nearby_drones(self):
        """
        When two drones are close enough, share their LiDAR knowledge.
        Simulates the mesh network knowledge-sharing protocol.
        """
        mesh_range = 15  # cells — wider than DR correction
        for i, d_a in enumerate(self.drones):
            for j, d_b in enumerate(self.drones):
                if j <= i:
                    continue
                dist = ((d_a.x - d_b.x) ** 2 + (d_a.y - d_b.y) ** 2) ** 0.5
                if dist <= mesh_range:
                    self.fog.sync_drone_knowledge(d_a.id, d_b.id)

    # ------------------------------------------------------------------
    # Interface Contract for Dashboard
    # ------------------------------------------------------------------

    def get_map_state(self):
        return self.map_obj.get_map_state()

    def get_drone_positions(self):
        return [drone.get_status() for drone in self.drones]

    def get_fog_state(self):
        """Return fog-of-war data for frontend rendering."""
        return {
            "grid": self.fog.get_shared_grid_for_viz(),
            "stats": self.fog.get_coverage_stats(),
            "shared_obstacles": self.fog.get_shared_known_obstacles(),
        }

    def get_lidar_point_cloud(self):
        """Return latest LiDAR scan results for frontend point cloud."""
        return self.last_lidar_scans

    def get_swarm_positions_for_apf(self):
        """Return positions for APF visualization."""
        from core.potential_field import PotentialFieldNavigator
        nav = PotentialFieldNavigator()
        all_obs = self.fog._shared_obstacles
        arrows = nav.get_field_visualization(
            width=self.map_obj.width,
            height=self.map_obj.height,
            known_obstacles=all_obs,
            step=5,
        )
        return arrows

    def get_full_state(self):
        """Combined snapshot for the Node.js server and dashboard."""
        map_state = self.get_map_state()
        drones_state = self.get_drone_positions()
        fog_state = self.get_fog_state()

        return {
            "step": self.step_counter,
            "running": self.running,
            "coverage_percentage": self.map_obj.get_coverage_percentage(),
            "fog_coverage": fog_state["stats"],
            "map": map_state,
            "drones": drones_state,
            "mission_board": self.map_obj.get_mission_board(drones_state),
            "new_detections": list(self.last_step_detections),
            "environment": self.map_obj.get_environment_state(),
            "fog": fog_state,
            "lidar_cloud": self.last_lidar_scans,
            "gps_denied": self.gps_denied,
            "scenario": self.scenario.get("name") if self.scenario else None,
            "triggered_events": self._triggered_events[-5:],  # Last 5 events
        }

    # ------------------------------------------------------------------
    # Demo runner
    # ------------------------------------------------------------------

    def run_demo(self, num_steps=100):
        """Run a CLI text-based demo showing system progression."""
        print("=" * 60)
        print("DRONE SWARM SIMULATION — ENHANCED DEMO")
        print("=" * 60)
        print(f"Environment: {self.environment_name}")
        print(f"GPS Mode: {'DENIED (Dead Reckoning)' if self.gps_denied else 'Active'}")
        print(f"LiDAR Range: {self.drones[0].lidar.range} cells")
        print(f"Potential Fields: {'ENABLED' if self.drones[0].apf else 'DISABLED'}")

        survivor_count = len(self.map_obj.survivor_locations)
        drone_count = len(self.drones)

        print(f"✓ Placed {survivor_count} survivors (hidden — discovered by LiDAR)")
        print(f"✓ Simulation ready with {drone_count} drones")
        print(f"\nRunning {num_steps} step demo...")

        for step in range(1, num_steps + 1):
            if not self.running:
                print("\nAll drones idle! Map completely swept.")
                break

            self.step_simulation()

            if step == 1 or step % 10 == 0 or step == num_steps:
                self._print_stats()

        print("\n" + "=" * 50)
        print("Demo complete!")
        print("\nFinal Statistics:")
        print(f"  Total steps: {self.step_counter}")
        stats = self.fog.get_coverage_stats()
        print(f"  Fog Coverage: {stats['explored_pct']:.1f}% revealed")
        print(f"  Detailed Scan: {stats['scanned_pct']:.1f}% scanned")
        found = len(self.map_obj.found_survivors)
        print(f"  Survivors found: {found} / {survivor_count}")
        print(f"  Triggered events: {len(self._triggered_events)}")
        print("\n✅ Enhanced simulation complete!")

    def _print_stats(self):
        print("-" * 50)
        print(f"Step {self.step_counter}:")
        active = sum(1 for d in self.drones if d.status == 'active')
        stats = self.fog.get_coverage_stats()
        print(f"  Fog revealed:  {stats['explored_pct']:.1f}%")
        print(f"  Cells scanned: {len(self.map_obj.scanned_cells)}")
        print(f"  Active drones: {active}")
        print(f"  Survivors found: {len(self.map_obj.found_survivors)}")
        if self.gps_denied:
            avg_unc = sum(d.position_uncertainty for d in self.drones) / len(self.drones)
            print(f"  Avg DR uncertainty: {avg_unc:.2f} cells")
        if self.last_step_detections:
            latest = self.last_step_detections[-1]
            print(
                f"  Latest detection: {latest['survivor_id']} by {latest['detected_by']} "
                f"(confidence {latest['confidence']:.1%})"
            )


# =============================================================================
# Direct Execution Entry Point
# =============================================================================
if __name__ == "__main__":
    sim = DroneSwarmSimulation(seed=123)
    sim.run_demo(num_steps=200)
