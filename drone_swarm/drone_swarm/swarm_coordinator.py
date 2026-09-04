"""
Top-level coordinator: wires the communication, allocation, and battery
layers together and reacts to swarm events (battery-low, comm-lost) by
triggering a partial reallocation over only the affected zones -- the
event-bus design discussed for the mission.
"""
from typing import List, Dict
from .drone import Drone
from .battery_manager import BatteryManager
from .mesh_network import SimulatedMeshNetwork
from .task_allocation import CBBAAgent, Task, run_cbba, reallocate_subset


class SwarmCoordinator:
    def __init__(self, drones: List[Drone], launch_point, comm_range_m: float):
        self.drones = drones
        self.launch_point = launch_point
        self.battery_mgr = BatteryManager()
        self.mesh = SimulatedMeshNetwork(drones, comm_range_m)
        self.agents = {d.drone_id: CBBAAgent(d.drone_id, d.position) for d in drones}
        self.tasks: Dict[int, Task] = {}
        self.assignment: Dict[int, List[int]] = {}
        self.event_log: List[str] = []

    def set_zones(self, zone_positions: Dict[int, tuple]):
        self.tasks = {tid: Task(tid, pos) for tid, pos in zone_positions.items()}
        self.assignment = run_cbba(list(self.agents.values()), self.tasks)
        for did, bundle in self.assignment.items():
            if bundle:
                self._get_drone(did).assigned_zone = bundle[0]
        self._log(f"Initial allocation: {self.assignment}")

    def tick(self):
        """One coordination cycle."""
        affected: List[int] = []

        for did in self.battery_mgr.evaluate_fleet(self.drones, self.launch_point):
            drone = self._get_drone(did)
            drone.role = "returning"
            self._log(f"Drone {did} battery-low -> RTL")
            if drone.assigned_zone is not None:
                affected.append(drone.assigned_zone)
                drone.assigned_zone = None

        relay_ids = [d.drone_id for d in self.drones if d.role == "relay"]
        if relay_ids:
            for drone in self.drones:
                if drone.is_alive and drone.role == "searcher" \
                        and not self.mesh.is_connected_to_base(drone.drone_id, relay_ids):
                    self._log(f"Drone {drone.drone_id} lost comms")
                    if drone.assigned_zone is not None:
                        affected.append(drone.assigned_zone)

        if affected:
            eligible_agents = [
                agent for agent in self.agents.values()
                if self._get_drone(agent.drone_id).role not in ("returning", "relay")
            ]
            partial = reallocate_subset(eligible_agents, self.tasks, affected)
            for did, bundle in partial.items():
                if bundle:
                    self._get_drone(did).assigned_zone = bundle[0]
            self._log(f"Reallocated zones {affected} -> {partial}")

    def _get_drone(self, drone_id: int) -> Drone:
        return next(d for d in self.drones if d.drone_id == drone_id)

    def _log(self, msg: str):
        self.event_log.append(msg)
