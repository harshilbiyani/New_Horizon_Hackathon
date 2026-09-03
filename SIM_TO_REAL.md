# DroneShield — Sim-to-Real Hardware Architecture

This document details the exact technical transition path from the **DroneShield Autonomous Simulation Engine** to physical unmanned aerial vehicles (UAVs) executing real-world search & rescue operations in GPS-denied disaster environments.

---

## Architectural Principle: Zero-Schema Change

The DroneShield architecture was explicitly engineered around a clean separation of concerns:

- **StateProvider**: Abstracts telemetry sources into canonical `DroneState` snapshots.
- **DecisionEngine / SwarmAllocator**: Evaluates world state and generates `DroneCommand` instructions.
- **ActuationLayer**: Translates `DroneCommand` instructions into vehicle control outputs.

Because `DroneState` and `DroneCommand` are formal JSON contracts, **the Decision Engine and AI Swarm Allocator require ZERO modification when switching from simulated drones to physical UAV hardware**.

```
┌────────────────────────────────────────────────────────┐
│             Autonomous Decision Engine                 │
│         (SwarmAllocator / ZonePlanner / XAI)           │
└──────────────────────────┬─────────────────────────────┘
                           │ DroneCommand (Canonical JSON)
                           ▼
 ┌───────────────────────────────────────────────────┐
 │                  ActuationLayer                   │
 ├─────────────────────────┬─────────────────────────┤
 │     Simulation Mode     │     Real Hardware       │
 │   Kinematic Integration │ MAVLink Command Bridge  │
 └─────────────────────────┴─────────────────────────┘
```

---

## Hardware Layer Mapping

| Component | Simulation Environment | Physical UAV Deployment |
|---|---|---|
| **Autopilot Control** | Kinematic velocity & turn-rate integration | PX4 Autopilot / ArduPilot via MAVLink (`SET_POSITION_TARGET_LOCAL_NED`) |
| **Telemetry Ingestion** | In-process tick loop snapshot (`server.js`) | MAVLink UDP Telemetry Stream (`GLOBAL_POSITION_INT`, `SYS_STATUS`, `HIGHRES_IMU`) |
| **GPS-Denied Navigation** | Simulated dead-reckoning position error growth | Optical Flow Camera (PX4FLOW) + Visual Inertial Odometry (VIO / T265) + UWB Triangulation |
| **Mesh Communications** | Simulated graph distance & multi-hop BFS (`COMM_RANGE`) | 900MHz Long-Range Mesh Radios (Silvus / Microhard / Doodle Labs mesh nodes) |
| **Survivor Detection** | Simulated radius proximity check (`DETECTION_RADIUS`) | Onboard Edge AI Thermal/RGB Camera + Jetson Orin Nano running YOLOv8-Thermal |
| **Ground Station Interface** | React Command Dashboard + Socket.IO | QGroundControl / MAVSDK-Node bridge over Socket.IO |

---

## Code Transition Walkthrough

### 1. Telemetry Ingestion (`StateProvider`)

In simulation, `getDroneStates()` packages in-memory JavaScript objects.
In physical deployment, `StateProvider` subscribes to MAVSDK telemetry:

```typescript
// Physical Hardware Listener Example (MAVSDK-Node)
import { System } from 'mavsdk';

const drone = new System();
await drone.connect('udp://:14540');

drone.telemetry.position().subscribe((pos) => {
  droneState.x = pos.latitudeDeg; // converted to local NED meters
  droneState.y = pos.longitudeDeg;
  droneState.z = pos.relativeAltitudeM;
});

drone.telemetry.battery().subscribe((bat) => {
  droneState.battery = bat.remainingPercent * 100;
});
```

### 2. Command Execution (`ActuationLayer`)

In simulation, `applyActuation(drone, command)` steps velocity towards target heading.
In physical deployment, `ActuationLayer` sends MAVLink setpoint packets:

```typescript
// MAVLink Actuation Bridge Example
import { Offboard } from 'mavsdk';

export async function sendDroneCommand(droneSystem: System, command: DroneCommand) {
  // Translate canonical DroneCommand into Offboard Position/Velocity Setpoint
  await droneSystem.offboard.setVelocityNed({
    northMms: command.targetSpeed * Math.cos(command.targetHeading * Math.PI / 180),
    eastMms:  command.targetSpeed * Math.sin(command.targetHeading * Math.PI / 180),
    downMms:  -command.targetZ,
    yawDeg:   command.targetHeading
  });
}
```

---

## Proof of Feasibility

1. **Strict Units**: All world space calculations use meters, degrees, and seconds.
2. **Safety Fallbacks**: Low battery return-to-base (RTB) and obstacle avoidance logic run at the vehicle layer, ensuring physical safety even if ground station connectivity drops.
3. **Decoupled Data Pipeline**: Replay Mode, Live Mode, and Hardware Mode consume the exact same JSON schema.
