# DroneShield Implementation Tasks

## Day 1 — Core Engine ✅ (All Complete)

- [x] **Hour 1-2**: Build `simulation/core/lidar.py` — raycasting engine
- [x] **Hour 2-3**: Build `simulation/core/fog_of_war.py` — per-cell visibility states
- [x] **Hour 3-5**: Wire LiDAR + Fog of War into `drone.py` + `map.py`
- [x] **Hour 5-6**: Dynamic re-pathing — A* path invalidation on new obstacle discovery
- [x] **Hour 6-7**: Build `simulation/core/potential_field.py`
- [x] **Hour 7-9**: Wire dead reckoning into drone move loop, GPS toggle
- [x] **Hour 9-10**: Build `simulation/scenarios.py` — 4 demo scenarios
- [x] **Hour 10-12**: Update Python visualizer — fog of war, LiDAR cloud, DR drift
- [x] **Hour 12-14**: `sim_server.py` + `config.py` enhanced

## Day 2 — Frontend + Integration

- [x] **Hour 1-3**: Update `server.js` — Python sim as single source of truth
- [x] **Hour 3-5**: Build React components — FogOfWarMap, ScenarioSelector, GPSStatus
- [/] **Hour 5-7**: Integrate all new data into Dashboard + fix JSON serialization
- [ ] **Hour 7-8**: AES encryption in mesh_network.py + UI indicator
- [ ] **Hour 8-9**: LiDAR Point Cloud React component
- [ ] **Hour 9-10**: End-to-end demo rehearsal — all 4 scenarios
- [ ] **Hour 10-12**: Polish + bug fixes + architecture document

## Bonus
- [ ] Jetson Nano headless runner + camera module demo
- [x] 3D map upgrade from kosada branch (city.glb, drone.glb, people models)
- [x] Fix numpy JSON serialization in Python-Node bridge
- [x] Install all dependencies (npm + pip)
