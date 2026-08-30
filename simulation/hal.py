"""
simulation/hal.py — Hardware Abstraction Layer
================================================
Separates swarm intelligence logic from drone hardware specifics.

HOW TO USE
----------
Default (simulation only, no hardware):
    from simulation.hal import SimulatedDroneHAL
    hal = SimulatedDroneHAL(sim)
    sim = DroneSwarmSimulation(hal=hal)

Real hardware (implement a subclass):
    from simulation.hal import DroneHAL
    class MyFlightController(DroneHAL):
        def send_waypoint(self, drone_id, x, y, z): ...
        def get_position(self, drone_id): ...
        # ... implement all abstract methods
    hal = MyFlightController(...)
    sim = DroneSwarmSimulation(hal=hal)

See hal_mavlink_template.py and hal_tello_template.py for starter implementations.
"""

from __future__ import annotations
import abc
import logging
from typing import Optional, Tuple

import numpy as np

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Base class — defines the full contract every HAL must satisfy
# ---------------------------------------------------------------------------

class DroneHAL(abc.ABC):
    """
    Abstract Hardware Abstraction Layer.

    All swarm logic calls ONLY these methods — never hardware APIs directly.
    Implement a subclass to support a new drone platform.

    Coordinate system convention (used throughout):
        x, y  : horizontal position in meters, origin = launch point
        z     : altitude in meters above launch point (positive = up)
        heading : compass bearing in degrees [0, 360), 0 = North
    """

    # -- Connection & Lifecycle -----------------------------------------------

    @abc.abstractmethod
    def connect(self, drone_id: int) -> bool:
        """
        Establish connection to drone.
        Returns True if connection succeeded.
        """

    @abc.abstractmethod
    def disconnect(self, drone_id: int) -> None:
        """Cleanly disconnect from drone (called on shutdown)."""

    @abc.abstractmethod
    def is_connected(self, drone_id: int) -> bool:
        """Return True if drone is reachable and responding."""

    @abc.abstractmethod
    def arm_drone(self, drone_id: int) -> bool:
        """Arm motors. Must be called before takeoff. Returns True if armed."""

    @abc.abstractmethod
    def disarm_drone(self, drone_id: int) -> bool:
        """Disarm motors. Safe to call when drone is landed."""

    # -- Motion Commands -------------------------------------------------------

    @abc.abstractmethod
    def send_waypoint(self, drone_id: int, x: float, y: float, z: float) -> bool:
        """
        Command drone to fly to absolute waypoint.
        x, y: horizontal position in meters (origin = launch point).
        z: target altitude in meters above launch.
        Returns True if command accepted by flight controller.
        """

    @abc.abstractmethod
    def send_velocity(self, drone_id: int, vx: float, vy: float, vz: float) -> bool:
        """
        Command velocity in world frame (m/s).
        vz positive = up. Returns True if command accepted.
        """

    @abc.abstractmethod
    def return_to_launch(self, drone_id: int) -> bool:
        """Command drone to return to home point and land."""

    @abc.abstractmethod
    def takeoff(self, drone_id: int, altitude_m: float = 10.0) -> bool:
        """Command takeoff to specified altitude. Returns True if accepted."""

    @abc.abstractmethod
    def land(self, drone_id: int) -> bool:
        """Command drone to land at current position."""

    # -- Telemetry (read-only) -------------------------------------------------

    @abc.abstractmethod
    def get_position(self, drone_id: int) -> Tuple[float, float, float]:
        """
        Get current position as (x, y, z) in meters.
        Returns (0, 0, 0) if unknown.
        """

    @abc.abstractmethod
    def get_heading(self, drone_id: int) -> float:
        """Get compass heading in degrees [0, 360). Returns 0.0 if unknown."""

    @abc.abstractmethod
    def get_speed(self, drone_id: int) -> float:
        """Get current ground speed in m/s. Returns 0.0 if unknown."""

    @abc.abstractmethod
    def get_battery(self, drone_id: int) -> float:
        """Get battery percentage [0.0, 100.0]. Returns 0.0 if unknown."""

    @abc.abstractmethod
    def get_signal_strength(self, drone_id: int) -> float:
        """Get comms link quality [0.0, 100.0]. Returns 100.0 if unmeasurable."""

    @abc.abstractmethod
    def get_status(self, drone_id: int) -> str:
        """
        Get drone operational status.
        Returns one of: 'active', 'idle', 'failed', 'returning', 'landed'
        """

    # -- Sensing ---------------------------------------------------------------

    @abc.abstractmethod
    def get_camera_frame(self, drone_id: int) -> Optional[np.ndarray]:
        """
        Capture a camera frame as BGR numpy array (H, W, 3).
        Return None to use simulation-based detection instead.
        """

    def get_thermal_reading(self, drone_id: int) -> Optional[float]:
        """
        Optional: thermal intensity [0.0-1.0].
        Return None to use simulation-based thermal (default).
        Override in subclass if IR camera is available.
        """
        return None

    def get_motion_reading(self, drone_id: int) -> Optional[float]:
        """
        Optional: motion sensor intensity [0.0-1.0].
        Return None to use simulation-based motion (default).
        """
        return None


# ---------------------------------------------------------------------------
# SimulatedDroneHAL — wraps simulation/core/drone.py (default, no hardware)
# ---------------------------------------------------------------------------

class SimulatedDroneHAL(DroneHAL):
    """
    Default HAL: all operations go to the Python simulation.
    No hardware required. Used for software-only runs and CI testing.
    """

    def __init__(self, simulation):
        """
        Args:
            simulation: A DroneSwarmSimulation instance from simulation/main.py
        """
        self.sim = simulation
        self._connected: dict[int, bool] = {}

    def _get_drone(self, drone_id: int):
        drones = self.sim.drones
        if 0 <= drone_id < len(drones):
            return drones[drone_id]
        return None

    def connect(self, drone_id: int) -> bool:
        self._connected[drone_id] = True
        logger.info(f"[SIM HAL] Drone {drone_id} connected (simulation)")
        return True

    def disconnect(self, drone_id: int) -> None:
        self._connected.pop(drone_id, None)

    def is_connected(self, drone_id: int) -> bool:
        return self._connected.get(drone_id, False)

    def arm_drone(self, drone_id: int) -> bool:
        logger.info(f"[SIM HAL] Drone {drone_id} armed (simulated)")
        return True

    def disarm_drone(self, drone_id: int) -> bool:
        logger.info(f"[SIM HAL] Drone {drone_id} disarmed (simulated)")
        return True

    def takeoff(self, drone_id: int, altitude_m: float = 10.0) -> bool:
        drone = self._get_drone(drone_id)
        if drone:
            drone.altitude = altitude_m
        return True

    def land(self, drone_id: int) -> bool:
        drone = self._get_drone(drone_id)
        if drone:
            drone.altitude = 0.0
        return True

    def send_waypoint(self, drone_id: int, x: float, y: float, z: float) -> bool:
        drone = self._get_drone(drone_id)
        if drone:
            drone.target = (int(x), int(y))
            drone.altitude = z
        return drone is not None

    def send_velocity(self, drone_id: int, vx: float, vy: float, vz: float) -> bool:
        import math
        drone = self._get_drone(drone_id)
        if drone:
            drone.heading = math.degrees(math.atan2(vy, vx)) % 360
        return drone is not None

    def return_to_launch(self, drone_id: int) -> bool:
        drone = self._get_drone(drone_id)
        if drone:
            drone.target = (self.sim.map.size // 2, self.sim.map.size // 2)
            drone.task = 'returning'
        return drone is not None

    def get_position(self, drone_id: int) -> Tuple[float, float, float]:
        drone = self._get_drone(drone_id)
        if drone:
            return (float(drone.x), float(drone.y), float(getattr(drone, 'altitude', 10.0)))
        return (0.0, 0.0, 0.0)

    def get_heading(self, drone_id: int) -> float:
        drone = self._get_drone(drone_id)
        return float(getattr(drone, 'heading', 0.0)) if drone else 0.0

    def get_speed(self, drone_id: int) -> float:
        drone = self._get_drone(drone_id)
        return float(getattr(drone, 'speed', 12.0)) if drone else 0.0

    def get_battery(self, drone_id: int) -> float:
        drone = self._get_drone(drone_id)
        return float(drone.battery) if drone else 0.0

    def get_signal_strength(self, drone_id: int) -> float:
        drone = self._get_drone(drone_id)
        if drone:
            dist = (drone.x ** 2 + drone.y ** 2) ** 0.5
            return max(28.0, min(99.0, 95.0 - dist / 3.0))
        return 0.0

    def get_status(self, drone_id: int) -> str:
        drone = self._get_drone(drone_id)
        if not drone:
            return 'failed'
        if drone.battery <= 1:
            return 'failed'
        if getattr(drone, 'task', '') == 'returning':
            return 'returning'
        return 'active'

    def get_camera_frame(self, drone_id: int) -> Optional[np.ndarray]:
        # Simulation has no camera; return None to trigger sim-based detection
        return None
