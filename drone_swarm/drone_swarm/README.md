# 10-Drone Disaster-Response Swarm

Implements the architecture from the planning discussion: comms, obstacle
avoidance, task allocation, battery-aware RTL, event-driven reallocation,
the battery-vs-distance judge question, ring+sector search division, and
multi-drone SLAM.

## Run the demo

```bash
pip install -r requirements.txt
cd ..                      # the folder that CONTAINS drone_swarm/
python -m drone_swarm.simulation
```

Prints each layer's output and saves `swarm_layout.png`.

## Files

| File | What it does | How real it is |
|---|---|---|
| `drone.py` | Drone state (position, battery, role) | data model |
| `battery_manager.py` | Flags RTL when `battery_remaining <= time_to_home + margin` | direct implementation of the formula discussed |
| `leapfrog_charging.py` | Answers the judges' 60-min/45-min-battery question: checks if the mission distance is physically possible on one battery, and if not, places charging/battery-swap stations | real physics check — no radio trick fixes a flight-range shortfall, only staged charging does |
| `relay_chain.py` | Store-and-forward relay chain (DTN "bucket brigade") — dedicates drones as fixed comms checkpoints | named, documented technique (used in DARPA SubT-style robotics); solves *comms* range, not flight range |
| `ring_sector_allocation.py` | Divides the search area into concentric rings + angular sectors, one cell per drone | standard real-world SAR grid-planning pattern; avoids square-grid corner blind spots |
| `mesh_network.py` | `SimulatedMeshNetwork` (distance-based, for testing/demo) and `UDPMeshNode` (real UDP broadcast + TTL flooding — deployable on any Linux companion computer with a broadcast-capable radio link) | simulated version for the demo; `UDPMeshNode` is genuinely runnable on real hardware without any vendor SDK |
| `lidar_obstacle_avoidance.py` | Reactive local avoidance via the artificial potential field method (Khatib, 1986) | real, standard robotics technique |
| `slam.py` | Log-odds occupancy-grid mapping from LIDAR + a `merge_maps()` for collaborative multi-drone mapping | real mapping technique; **note** — full SLAM also needs pose *localization* (ICP/particle-filter scan matching, e.g. Hector SLAM), which isn't implemented here — this assumes GPS or another localization source supplies the pose |
| `task_allocation.py` | CBBA — Consensus-Based Bundle Algorithm (Choi, Brunet & How, 2009) | a real, published, distributed multi-robot task-allocation algorithm, not a toy heuristic; supports cheap partial re-solves |
| `swarm_coordinator.py` | Event bus: watches battery + comms, triggers CBBA reallocation only over affected zones | ties every layer together |
| `simulation.py` | Runnable end-to-end demo + matplotlib visualization | — |

## What was intentionally left out

Vendor-specific mesh radio integration (e.g. Doodle Labs Mesh Rider, Silvus
StreamCaster) is not implemented — those require actual procured hardware
and vendor SDKs to write and test against, which isn't verifiable here.
`UDPMeshNode` instead implements the same flooding-with-TTL hop-to-hop
pattern in a vendor-agnostic way that genuinely runs on real companion
computers over any broadcast-capable link (Wi-Fi ad-hoc, or a radio bridged
to a network interface).

Full pose-estimation SLAM (scan-matching / particle filters) is flagged as
out of scope in `slam.py` rather than faked — it's a real, substantial
subsystem in its own right (see Hector SLAM / LOAM for real implementations
to integrate if you have LIDAR hardware to test against).
