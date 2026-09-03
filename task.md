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

## Security Implementation (0-12 Hours)
- [x] **Phase 1 (Layer 1)**: HKDF Key Isolation (`crypto_identity.py`) + Network Integration
- [x] **Phase 2 (Layer 2)**: Hybrid X25519 + ML-KEM Handshake (`liboqs`)
- [x] **Phase 3 (Layer 3)**: Telemetry Signing (`PyNaCl` Ed25519)
- [x] **Phase 4 (Layer 4)**: Swarm AI Anomaly (Impossible Jump Quarantine)
- [x] **Phase 5 (Layer 5)**: Active Canary Trap & Firebase Auth
- [x] **Phase 6 (Layer 6)**: BLE Survivor Sniffing (`bleak`)

## Security Implementation (12-36 Hours)
- [ ] **Phase 1-6**: Advanced Integration (QoS, Isolation Forests, Direct Handoff)

## Day 2 — Frontend + Integration
- [x] **Hour 1-3**: Update `server.js` — Python sim as single source of truth
- [x] **Hour 3-5**: Build React components — FogOfWarMap, ScenarioSelector, GPSStatus
- [/] **Hour 5-7**: Integrate all new data into Dashboard + fix JSON serialization
- [x] **Hour 7-8**: AES encryption in mesh_network.py + UI indicator
- [ ] **Hour 8-9**: LiDAR Point Cloud React component
- [ ] **Hour 9-10**: End-to-end demo rehearsal — all 4 scenarios
- [ ] **Hour 10-12**: Polish + bug fixes + architecture document
