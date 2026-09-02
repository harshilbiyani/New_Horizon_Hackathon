# DroneShield Implementation Tasks

## Day 1 — Core Engine

- [/] **Hour 1-2**: Build `simulation/core/lidar.py` — raycasting engine
- [ ] **Hour 2-3**: Build `simulation/core/fog_of_war.py` — per-cell visibility states
- [ ] **Hour 3-5**: Wire LiDAR + Fog of War into `drone.py` + `map.py`
- [ ] **Hour 5-6**: Dynamic re-pathing — A* path invalidation on new obstacle discovery
- [ ] **Hour 6-7**: Build `simulation/core/potential_field.py`
- [ ] **Hour 7-9**: Wire dead reckoning into drone move loop, GPS toggle
- [ ] **Hour 9-10**: Build `simulation/scenarios.py` — 4 demo scenarios
- [ ] **Hour 10-12**: Update Python visualizer — fog of war, LiDAR cloud, DR drift
- [ ] **Hour 12-14**: Test all scenarios end-to-end

## Day 2 — Frontend + Integration

- [ ] **Hour 1-3**: Update `server.js` — Python sim as single source of truth
- [ ] **Hour 3-5**: Build React components — FogOfWarMap, LiDARCloud, ScenarioSelector, GPSStatus
- [ ] **Hour 5-7**: Integrate all new data into Dashboard
- [ ] **Hour 7-8**: AES encryption in mesh_network.py + UI indicator
- [ ] **Hour 8-9**: Jetson Nano headless runner + YOLO inference demo
- [ ] **Hour 9-10**: End-to-end demo rehearsal — all 4 scenarios
- [ ] **Hour 10-12**: Polish + bug fixes
