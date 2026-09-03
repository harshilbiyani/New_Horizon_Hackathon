"""
simulation/hal_tello_template.py — DJI Tello SDK Integration Template
=======================================================================
Use this as the starting point for DJI Tello / Tello EDU drones.
Tello is common for hackathon demos because it's cheap, safe, and
has a well-documented Python SDK.

INSTALL
-------
    pip install djitellopy

QUICK START
-----------
    from simulation.hal_tello_template import TelloDroneHAL

    hal = TelloDroneHAL(
        ip_addresses=["192.168.10.1"],  # default Tello IP (connect via WiFi first)
    )
    hal.connect(0)

LIMITATIONS
-----------
- Tello does NOT support MAVLink
- Tello does NOT have a GPS (uses optical flow + barometer only)
- Tello has no heading lock without EDU mission pad
- Position tracking is approximate via dead reckoning
- Communication is UDP over WiFi (can drop packets)
- Max range ~10m indoors, ~30m outdoors

COORDINATE SYSTEM
-----------------
Tello forward = +x in HAL convention (when facing North).
All distances in centimeters in Tello SDK; we convert to meters here.
"""

from __future__ import annotations
import logging
import time
from typing import Optional, Tuple

import numpy as np

from simulation.hal import DroneHAL

logger = logging.getLogger(__name__)

try:
    from djitellopy import Tello
    TELLO_AVAILABLE = True
except ImportError:
    TELLO_AVAILABLE = False
    logger.warning(
        "djitellopy not installed. Install with: pip install djitellopy\n"
        "TelloDroneHAL will raise NotImplementedError until installed."
    )


class TelloDroneHAL(DroneHAL):
    """
    DJI Tello / Tello EDU hardware integration.

    Args:
        ip_addresses: Tello IP address for each drone.
                      Connect laptop to each Tello's WiFi network first.
                      Default Tello IP: 192.168.10.1
        vs_port: Video stream port (default: 11111)
    """

    def __init__(
        self,
        ip_addresses: list[str] | None = None,
        vs_port: int = 11111,
    ):
        if not TELLO_AVAILABLE:
            raise ImportError("Install djitellopy: pip install djitellopy")

        self.ip_addresses = ip_addresses or ["192.168.10.1"]
        self.vs_port = vs_port

        # Active Tello connections: drone_id -> Tello instance
        self._tellos: dict[int, "Tello"] = {}

        # Dead reckoning position (Tello has no GPS)
        self._positions: dict[int, list[float]] = {}  # drone_id -> [x, y, z]
        self._headings: dict[int, float] = {}          # drone_id -> degrees

    # ── Connection ------------------------------------------------------------

    def connect(self, drone_id: int) -> bool:
        if drone_id >= len(self.ip_addresses):
            logger.error(f"No IP address defined for drone {drone_id}")
            return False

        ip = self.ip_addresses[drone_id]
        logger.info(f"[Tello] Connecting to drone {drone_id} at {ip}")

        # === IMPLEMENT ===
        # tello = Tello(host=ip)
        # tello.connect()
        # logger.info(f"[Tello] Drone {drone_id} battery: {tello.get_battery()}%")
        # self._tellos[drone_id] = tello
        # self._positions[drone_id] = [0.0, 0.0, 0.0]
        # self._headings[drone_id] = 0.0
        # return True

        raise NotImplementedError(
            "Implement: Tello(host=ip).connect()\n"
            "See djitellopy docs: https://djitellopy.readthedocs.io"
        )

    def disconnect(self, drone_id: int) -> None:
        tello = self._tellos.pop(drone_id, None)
        if tello:
            try:
                tello.end()
            except Exception:
                pass

    def is_connected(self, drone_id: int) -> bool:
        return drone_id in self._tellos

    def arm_drone(self, drone_id: int) -> bool:
        # Tello arms automatically on takeoff — no explicit arm needed
        return self.is_connected(drone_id)

    def disarm_drone(self, drone_id: int) -> bool:
        # Tello disarms automatically when landed
        return True

    def takeoff(self, drone_id: int, altitude_m: float = 1.0) -> bool:
        """
        Tello SDK: tello.takeoff()
        Flies to ~1m by default. For specific altitude:
            tello.move_up(int((altitude_m - 1.0) * 100))  # in cm above takeoff
        """
        tello = self._tellos.get(drone_id)
        if not tello:
            return False

        # === IMPLEMENT ===
        # tello.takeoff()
        # self._positions[drone_id][2] = 1.0  # takeoff altitude
        # if altitude_m > 1.1:
        #     extra_cm = int((altitude_m - 1.0) * 100)
        #     tello.move_up(extra_cm)
        #     self._positions[drone_id][2] = altitude_m
        # return True

        raise NotImplementedError("Implement takeoff using tello.takeoff()")

    def land(self, drone_id: int) -> bool:
        """Tello SDK: tello.land()"""
        tello = self._tellos.get(drone_id)
        if not tello:
            return False

        # === IMPLEMENT ===
        # tello.land()
        # self._positions[drone_id][2] = 0.0
        # return True

        raise NotImplementedError("Implement land using tello.land()")

    def send_waypoint(self, drone_id: int, x: float, y: float, z: float) -> bool:
        """
        Tello has no direct absolute waypoint command.
        Use go_xyz_speed(x_cm, y_cm, z_cm, speed_cm_s) for relative movement,
        or compute delta from current position and issue relative move.

        tello.go_xyz_speed(dx_cm, dy_cm, dz_cm, speed=30)
        Note: minimum move distance is 20cm. Ignore sub-20cm moves.
        """
        tello = self._tellos.get(drone_id)
        if not tello:
            return False

        cur = self._positions.get(drone_id, [0.0, 0.0, 0.0])
        dx_cm = int((x - cur[0]) * 100)
        dy_cm = int((y - cur[1]) * 100)
        dz_cm = int((z - cur[2]) * 100)

        # === IMPLEMENT ===
        # min_move = 20  # Tello minimum move in cm
        # if abs(dx_cm) > min_move or abs(dy_cm) > min_move or abs(dz_cm) > min_move:
        #     tello.go_xyz_speed(dx_cm, dy_cm, dz_cm, 30)
        #     self._positions[drone_id] = [x, y, z]
        # return True

        raise NotImplementedError("Implement send_waypoint using tello.go_xyz_speed()")

    def send_velocity(self, drone_id: int, vx: float, vy: float, vz: float) -> bool:
        """
        Tello SDK: tello.send_rc_control(left_right, forward_back, up_down, yaw_speed)
        Values range from -100 to 100.
        Map vx/vy/vz (m/s) to rc values (percentage of max speed ~4.5 m/s).
        """
        tello = self._tellos.get(drone_id)
        if not tello:
            return False

        max_speed_mps = 4.5
        lr = int(max(-100, min(100, vx / max_speed_mps * 100)))   # left-right
        fb = int(max(-100, min(100, vy / max_speed_mps * 100)))   # forward-back
        ud = int(max(-100, min(100, vz / max_speed_mps * 100)))   # up-down

        # === IMPLEMENT ===
        # tello.send_rc_control(lr, fb, ud, 0)  # 0 = no yaw
        # return True

        raise NotImplementedError("Implement send_velocity using tello.send_rc_control()")

    def return_to_launch(self, drone_id: int) -> bool:
        """
        Tello has no RTL. Implement as:
            1. Navigate to (0, 0) using send_waypoint
            2. Land
        """
        success = self.send_waypoint(drone_id, 0.0, 0.0, 1.0)
        if success:
            return self.land(drone_id)
        return False

    # ── Telemetry -------------------------------------------------------------

    def get_position(self, drone_id: int) -> Tuple[float, float, float]:
        """
        Tello has no GPS. Use dead reckoning position tracked internally.
        For Tello EDU with mission pad: tello.get_mission_pad_distance_x/y/z()
        """
        return tuple(self._positions.get(drone_id, [0.0, 0.0, 0.0]))

    def get_heading(self, drone_id: int) -> float:
        """
        Tello SDK: tello.get_yaw() — returns degrees [-180, 180]
        Convert to [0, 360): heading = yaw % 360
        """
        tello = self._tellos.get(drone_id)
        if not tello:
            return 0.0

        # === IMPLEMENT ===
        # return tello.get_yaw() % 360

        return self._headings.get(drone_id, 0.0)

    def get_speed(self, drone_id: int) -> float:
        """
        Tello SDK: tello.get_speed_x(), get_speed_y(), get_speed_z()
        Ground speed = sqrt(vx^2 + vy^2) in dm/s; convert to m/s: / 10
        """
        tello = self._tellos.get(drone_id)
        if not tello:
            return 0.0

        # === IMPLEMENT ===
        # vx = tello.get_speed_x() / 10.0  # dm/s -> m/s
        # vy = tello.get_speed_y() / 10.0
        # return (vx**2 + vy**2) ** 0.5

        return 0.0

    def get_battery(self, drone_id: int) -> float:
        """Tello SDK: tello.get_battery() — returns 0-100"""
        tello = self._tellos.get(drone_id)
        if not tello:
            return 0.0

        # === IMPLEMENT ===
        # return float(tello.get_battery())

        return 100.0

    def get_signal_strength(self, drone_id: int) -> float:
        """
        Tello has no RSSI API. Use WiFi RSSI from system if available.
        On Linux: iwconfig wlan0 | grep 'Signal level'
        On Windows: netsh wlan show interfaces | findstr Signal
        Return 100.0 if not measurable.
        """
        return 100.0  # No direct Tello RSSI API; approximate as full signal

    def get_status(self, drone_id: int) -> str:
        tello = self._tellos.get(drone_id)
        if not tello:
            return 'failed'
        battery = self.get_battery(drone_id)
        if battery < 5:
            return 'failed'
        return 'active'

    def get_camera_frame(self, drone_id: int) -> Optional[np.ndarray]:
        """
        Tello has a built-in front camera (5MP, 720p).
        
        === IMPLEMENT ===
        tello = self._tellos.get(drone_id)
        if not tello:
            return None
        # Start video stream once:
        # tello.streamon()
        frame_reader = tello.get_frame_read()
        frame = frame_reader.frame   # BGR numpy array
        return frame if frame is not None else None
        """
        return None  # None = use simulation-based detection until implemented
