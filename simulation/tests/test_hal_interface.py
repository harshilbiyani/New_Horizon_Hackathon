"""
simulation/tests/test_hal_interface.py — HAL Contract Tests
=============================================================
Run these tests against any DroneHAL implementation to verify it satisfies
the full interface contract before connecting to real hardware.

Usage (simulation mode — no hardware required):
    python -m pytest simulation/tests/test_hal_interface.py -v

Usage (against your HAL implementation):
    from simulation.tests.test_hal_interface import run_hal_contract_tests
    from my_hal import MyHAL
    hal = MyHAL(...)
    hal.connect(0)
    run_hal_contract_tests(hal, drone_id=0)
"""

from __future__ import annotations
import os
import sys

ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------

def _make_sim_hal():
    """Create a SimulatedDroneHAL with a minimal stub simulation."""
    from simulation.hal import SimulatedDroneHAL

    class _MinimalDrone:
        def __init__(self):
            self.x       = 10.0
            self.y       = -5.0
            self.altitude= 12.0
            self.heading = 45.0
            self.speed   = 14.0
            self.battery = 78.5
            self.task    = 'exploring'
            self.target  = (25, 25)

    class _MinimalMap:
        size = 50

    class _MinimalSim:
        drones = [_MinimalDrone(), _MinimalDrone()]
        map    = _MinimalMap()

    hal = SimulatedDroneHAL(_MinimalSim())
    hal.connect(0)
    hal.connect(1)
    return hal


# ---------------------------------------------------------------------------
# Contract tests (runnable standalone or via pytest)
# ---------------------------------------------------------------------------

def run_hal_contract_tests(hal, drone_id: int = 0) -> None:
    """
    Run full contract validation against a HAL instance.
    Raises AssertionError if any contract is violated.
    """
    _test_connect(hal, drone_id)
    _test_position(hal, drone_id)
    _test_heading(hal, drone_id)
    _test_speed(hal, drone_id)
    _test_battery(hal, drone_id)
    _test_signal_strength(hal, drone_id)
    _test_status(hal, drone_id)
    _test_camera_frame(hal, drone_id)
    _test_arm_disarm(hal, drone_id)
    _test_send_waypoint(hal, drone_id)
    _test_send_velocity(hal, drone_id)
    print(f"[HAL Contract] All tests passed for drone_id={drone_id}")


def _test_connect(hal, drone_id):
    assert hal.is_connected(drone_id), \
        f"is_connected({drone_id}) must return True after connect()"


def _test_position(hal, drone_id):
    pos = hal.get_position(drone_id)
    assert isinstance(pos, (tuple, list)), \
        f"get_position() must return a tuple or list, got {type(pos)}"
    assert len(pos) == 3, \
        f"get_position() must return (x, y, z) with 3 elements, got {len(pos)}"
    x, y, z = pos
    assert isinstance(x, (int, float)), f"get_position()[0] must be numeric, got {type(x)}"
    assert isinstance(y, (int, float)), f"get_position()[1] must be numeric, got {type(y)}"
    assert isinstance(z, (int, float)), f"get_position()[2] must be numeric, got {type(z)}"


def _test_heading(hal, drone_id):
    heading = hal.get_heading(drone_id)
    assert isinstance(heading, (int, float)), \
        f"get_heading() must return a number, got {type(heading)}"
    assert 0.0 <= heading < 360.0, \
        f"get_heading() must be in [0, 360), got {heading}"


def _test_speed(hal, drone_id):
    speed = hal.get_speed(drone_id)
    assert isinstance(speed, (int, float)), \
        f"get_speed() must return a number, got {type(speed)}"
    assert speed >= 0.0, \
        f"get_speed() must be non-negative, got {speed}"


def _test_battery(hal, drone_id):
    battery = hal.get_battery(drone_id)
    assert isinstance(battery, (int, float)), \
        f"get_battery() must return a number, got {type(battery)}"
    assert 0.0 <= battery <= 100.0, \
        f"get_battery() must be in [0.0, 100.0], got {battery}"


def _test_signal_strength(hal, drone_id):
    sig = hal.get_signal_strength(drone_id)
    assert isinstance(sig, (int, float)), \
        f"get_signal_strength() must return a number, got {type(sig)}"
    assert 0.0 <= sig <= 100.0, \
        f"get_signal_strength() must be in [0.0, 100.0], got {sig}"


def _test_status(hal, drone_id):
    status = hal.get_status(drone_id)
    valid  = {"active", "idle", "failed", "returning", "landed"}
    assert isinstance(status, str), \
        f"get_status() must return a string, got {type(status)}"
    assert status in valid, \
        f"get_status() must be one of {valid}, got '{status}'"


def _test_camera_frame(hal, drone_id):
    import numpy as np
    frame = hal.get_camera_frame(drone_id)
    if frame is not None:
        assert isinstance(frame, np.ndarray), \
            f"get_camera_frame() must return np.ndarray or None, got {type(frame)}"
        assert frame.ndim == 3, \
            f"Camera frame must have shape (H, W, C), got ndim={frame.ndim}"
        assert frame.shape[2] == 3, \
            f"Camera frame must have 3 channels (BGR), got {frame.shape[2]}"


def _test_arm_disarm(hal, drone_id):
    arm_result = hal.arm_drone(drone_id)
    assert isinstance(arm_result, bool), \
        f"arm_drone() must return bool, got {type(arm_result)}"
    disarm_result = hal.disarm_drone(drone_id)
    assert isinstance(disarm_result, bool), \
        f"disarm_drone() must return bool, got {type(disarm_result)}"


def _test_send_waypoint(hal, drone_id):
    result = hal.send_waypoint(drone_id, x=10.0, y=10.0, z=15.0)
    assert isinstance(result, bool), \
        f"send_waypoint() must return bool, got {type(result)}"


def _test_send_velocity(hal, drone_id):
    result = hal.send_velocity(drone_id, vx=1.0, vy=0.5, vz=0.0)
    assert isinstance(result, bool), \
        f"send_velocity() must return bool, got {type(result)}"


# ---------------------------------------------------------------------------
# pytest test functions (automatically discovered by pytest)
# ---------------------------------------------------------------------------

def test_sim_hal_connect():
    hal = _make_sim_hal()
    assert hal.is_connected(0)
    assert hal.is_connected(1)
    assert not hal.is_connected(99)


def test_sim_hal_position():
    hal = _make_sim_hal()
    pos = hal.get_position(0)
    assert len(pos) == 3
    x, y, z = pos
    assert isinstance(x, float)
    assert isinstance(y, float)
    assert isinstance(z, float)


def test_sim_hal_heading_range():
    hal = _make_sim_hal()
    heading = hal.get_heading(0)
    assert 0.0 <= heading < 360.0


def test_sim_hal_battery_range():
    hal = _make_sim_hal()
    battery = hal.get_battery(0)
    assert 0.0 <= battery <= 100.0


def test_sim_hal_signal_range():
    hal = _make_sim_hal()
    sig = hal.get_signal_strength(0)
    assert 0.0 <= sig <= 100.0


def test_sim_hal_status():
    hal = _make_sim_hal()
    status = hal.get_status(0)
    assert status in {"active", "idle", "failed", "returning", "landed"}


def test_sim_hal_camera_returns_none():
    hal = _make_sim_hal()
    frame = hal.get_camera_frame(0)
    # Simulated HAL always returns None (no camera)
    assert frame is None


def test_sim_hal_arm_disarm():
    hal = _make_sim_hal()
    assert hal.arm_drone(0) is True
    assert hal.disarm_drone(0) is True


def test_sim_hal_send_waypoint():
    hal = _make_sim_hal()
    result = hal.send_waypoint(0, x=20.0, y=30.0, z=15.0)
    assert isinstance(result, bool)


def test_sim_hal_send_velocity():
    hal = _make_sim_hal()
    result = hal.send_velocity(0, vx=2.0, vy=-1.0, vz=0.5)
    assert isinstance(result, bool)


def test_sim_hal_full_contract():
    """Run the complete contract validation suite against SimulatedDroneHAL."""
    hal = _make_sim_hal()
    run_hal_contract_tests(hal, drone_id=0)


if __name__ == "__main__":
    # Can also run directly: python test_hal_interface.py
    test_sim_hal_full_contract()
    print("All HAL contract tests passed.")
