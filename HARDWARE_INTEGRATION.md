# DroneShield — Hardware Integration Guide

> **Target audience:** Drone engineers who want to fly a physical swarm using the DroneShield software stack.
> **Time to onboard:** ~30 minutes to run a first test; ~2–4 hours to a first real flight.

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│              Web Dashboard (React)           │
│   /dashboard  /xai  /mission-control        │
└──────────────────┬──────────────────────────┘
                   │ Socket.IO telemetry
┌──────────────────▼──────────────────────────┐
│           server.js (Node.js)               │
│   REST API + Socket.IO + mission loop        │
│                                             │
│   ┌─────────────────────────────────┐       │
│   │  JS Fallback Simulation         │       │  ← active when Python unavailable
│   │  (obstacle avoidance, random    │       │
│   │   walk, survivor proximity)     │       │
│   └─────────────────────────────────┘       │
│                                             │
│   spawnSync every 700ms ─────────────────── │
└──────────────────┬──────────────────────────┘
                   │ JSON stdin/stdout
┌──────────────────▼──────────────────────────┐
│        simulation/ai_bridge.py              │  ← Python AI core (authoritative)
│                                             │
│  ZoneFitness  →  ABC Allocator              │
│  AICoordinator (Q-learning zone ranking)    │
│  AIDetector   (logistic regression conf.)   │
│  FailureRecoveryManager                     │
│  MissionBlackboard                          │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│          simulation/hal.py                  │  ← YOU IMPLEMENT THIS FOR HARDWARE
│                                             │
│  SimulatedDroneHAL (default, no hardware)   │
│  MAVLinkDroneHAL  (hal_mavlink_template.py) │
│  TelloDroneHAL    (hal_tello_template.py)   │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│            Physical Drones                  │
│  PX4 / ArduPilot / Tello / Custom           │
└─────────────────────────────────────────────┘
```

**The only file you need to modify to support new hardware is your HAL subclass.**
Everything above it — the web dashboard, AI zone ranking, Q-learning, ABC allocation — stays identical whether you're running simulated or real drones.

---

## Step 1: Choose Your Integration Path

| Drone type | Template to use | SDK to install |
|---|---|---|
| PX4, ArduPilot, any MAVLink FC | `simulation/hal_mavlink_template.py` | `pip install pymavlink` |
| DJI Tello / Tello EDU | `simulation/hal_tello_template.py` | `pip install djitellopy` |
| Custom / ROS2 | Subclass `DroneHAL` directly | Your SDK |
| Simulation only (no hardware) | Nothing — default works | Nothing |

---

## Step 2: Implement Your HAL

### Example: MAVLink (PX4/ArduPilot)

```python
# my_mavlink_hal.py
from simulation.hal_mavlink_template import MAVLinkDroneHAL
from pymavlink import mavutil

class MyPX4HAL(MAVLinkDroneHAL):

    def connect(self, drone_id: int) -> bool:
        conn_str = self.connection_strings[drone_id]
        conn = mavutil.mavlink_connection(conn_str, source_system=255)
        conn.wait_heartbeat(timeout=self.timeout_s)
        self._connections[drone_id] = conn
        print(f"Drone {drone_id} connected: {conn.target_system}")
        return True

    def get_position(self, drone_id: int):
        conn = self._connections[drone_id]
        msg = conn.recv_match(type='LOCAL_POSITION_NED', blocking=True, timeout=1)
        if msg:
            return (msg.y, msg.x, -msg.z)   # East, North, Up
        return (0.0, 0.0, 0.0)

    def get_battery(self, drone_id: int) -> float:
        conn = self._connections[drone_id]
        msg = conn.recv_match(type='SYS_STATUS', blocking=True, timeout=1)
        return float(msg.battery_remaining) if msg else 0.0

    # ... implement remaining abstract methods
```

### Example: DJI Tello

```python
# my_tello_hal.py
from simulation.hal_tello_template import TelloDroneHAL
from djitellopy import Tello

class MyTelloHAL(TelloDroneHAL):

    def connect(self, drone_id: int) -> bool:
        tello = Tello(host=self.ip_addresses[drone_id])
        tello.connect()
        self._tellos[drone_id] = tello
        self._positions[drone_id] = [0.0, 0.0, 0.0]
        return True

    def get_battery(self, drone_id: int) -> float:
        return float(self._tellos[drone_id].get_battery())

    def takeoff(self, drone_id: int, altitude_m: float = 1.0) -> bool:
        self._tellos[drone_id].takeoff()
        self._positions[drone_id][2] = 1.0
        return True

    # ... implement remaining methods
```

---

## Step 3: Validate Your HAL with the Contract Test

Before connecting to real drones, run the HAL contract test in simulation mode:

```bash
python -m pytest simulation/tests/test_hal_interface.py -v
```

Then run it against your HAL implementation:

```python
# In test or script:
from simulation.tests.test_hal_interface import run_hal_contract_tests
from my_mavlink_hal import MyPX4HAL

hal = MyPX4HAL(connection_strings=["udp:127.0.0.1:14550"])
hal.connect(0)
run_hal_contract_tests(hal, drone_id=0)
```

---

## Step 4: Connect to the Simulation Core

```python
# run_with_hardware.py
from simulation.hal import SimulatedDroneHAL  # swap with your HAL
from my_mavlink_hal import MyPX4HAL

# Use your HAL instead of simulation
hal = MyPX4HAL(connection_strings=["udp:127.0.0.1:14550"])
for i in range(hal_drone_count):
    assert hal.connect(i), f"Failed to connect drone {i}"

# The ai_bridge.py reads HAL state via the sim interface.
# For hardware integration, also update ai_bridge.py to read position from hal.get_position()
# instead of from the JS snapshot. See: simulation/ai_bridge.py _get_ai_singletons()
```

---

## Environment Variables Reference

| Variable | Default | Description |
|---|---|---|
| `DRONE_IMAGE_SOURCE` | `sim` | Image source: `sim`, `file`, `rtsp`, `v4l2` |
| `DRONE_IMAGE_DIR` | *(none)* | Directory for static images (when `source=file`) |
| `DRONE_RTSP_URL` | *(none)* | RTSP stream URL for camera frames |
| `DRONE_RTSP_URL_{ID}` | *(none)* | Per-drone RTSP URL (e.g. `DRONE_RTSP_URL_DRN_001`) |
| `DRONE_V4L2_DEVICE` | *(none)* | V4L2 device path (e.g. `/dev/video0`) |
| `YOLO_MODEL` | `yolov8n.pt` | YOLO model file to use |
| `YOLO_CONFIDENCE` | `0.45` | Minimum confidence threshold for YOLO detections |
| `OLLAMA_URL` | *(none)* | Set to enable Ollama LLM (e.g. `http://localhost:11434`) |
| `OLLAMA_MODEL` | `llama3.2:3b` | Ollama model name (if enabled) |
| `OLLAMA_ENABLED` | `false` | Set to `true` to enable Ollama even with default URL |
| `PYTHON_EXECUTABLE` | `python` | Python binary for server.js child processes |
| `SIM_SURVIVOR_SEED` | `77341` | Seed for survivor placement RNG |
| `SIM_SURVIVOR_COUNT` | `5` | Number of survivors to place |
| `PORT` | `3001` | HTTP server port |

---

## Common Integration Mistakes

### ❌ Coordinate mismatch
MAVLink NED is `(North, East, Down)`. The HAL uses `(East, North, Up)`.
Always convert: `hal_x = msg.y, hal_y = msg.x, hal_z = -msg.z`

### ❌ Forgetting to arm before takeoff
Call `hal.arm_drone(drone_id)` before `hal.takeoff(drone_id)`. Some FCs require GPS lock too.

### ❌ Tello minimum move distance
Tello SDK requires minimum 20cm per move command. Smaller moves are silently ignored.
Accumulate moves until delta > 20cm, then send.

### ❌ YOLO not detecting targets
By default YOLO uses `yolov8n.pt` which is trained on COCO (80 classes, includes `person`).
Fire detection requires a fire-specific model. Set `YOLO_MODEL=path/to/fire_model.pt`.

### ❌ DRONE_IMAGE_SOURCE not set
Without setting `DRONE_IMAGE_SOURCE=rtsp` (or `file`/`v4l2`), the bridge uses sim-based
detection and YOLO is never called, even if a camera is attached.

### ❌ NumPy version conflict on Jetson
JetPack 4.6 ships NumPy 1.19. The project's `requirements.txt` may specify `>=1.26`.
Downgrade in `requirements.txt` to `numpy>=1.19` before installing on Jetson.

---

## Testing Without Hardware (SITL)

Use PX4 SITL or ArduPilot SITL to test the MAVLink HAL without a real drone:

```bash
# PX4 SITL (in a separate terminal)
cd PX4-Autopilot
make px4_sitl gazebo

# Then connect your HAL to the SITL UDP port
hal = MyPX4HAL(connection_strings=["udp:127.0.0.1:14550"])
```

---

## Jetson Nano Specific Notes

- **Python**: JetPack ships Python 3.6. The codebase uses f-strings and type hints compatible with 3.6+.
  If you use `from __future__ import annotations`, type hints in function signatures work on 3.6.
- **NumPy**: Use `numpy>=1.19,<1.26` in requirements.txt for JetPack 4.6 compatibility.
- **YOLO on Jetson GPU**: Export model to TensorRT for ~2-3x speedup:
  ```python
  from ultralytics import YOLO
  model = YOLO('yolov8n.pt')
  model.export(format='engine', device=0)  # generates yolov8n.engine
  # Then use: YOLO_MODEL=yolov8n.engine
  ```
- **Ollama**: Not feasible on Jetson Nano (4GB RAM). Leave `OLLAMA_URL` unset — system auto-falls back to rule-based parsing.
- **OpenCV**: Install from NVIDIA's JetPack packages, not pip: `sudo apt install python3-opencv`
