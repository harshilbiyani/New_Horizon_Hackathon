# Autonomous Drone Swarm Platform

Integrated high-level solution for autonomous search, rescue, and reconnaissance in disaster, forest, and GPS-denied environments.

This repository now connects all three development branches into one deployable stack:

- `main`: React command dashboard + Node mission server
- `origin/kosada`: 3D terrain and drone visualization (Three.js)
- `origin/trupti`: AI swarm coordination modules (Python)

## What Is Implemented

- Live multi-drone mission simulation with obstacle zones and survivor detections
- Real-time dashboard via Socket.IO (telemetry, logs, map, trends)
- Improved 3D tactical scene under `public/map/` with live HUD
- AI bridge (`simulation/ai_bridge.py`) that converts mission snapshots into:
  - zone ranking and mission priority
  - drone assignment recommendations
  - command suggestions and swarm health
- AI insights available via REST and websocket

## Architecture

1. `server.js` runs mission simulation and broadcasts telemetry.
2. React app consumes telemetry and renders command UI.
3. Three.js scene (`/map`) renders terrain, drones, and AI HUD overlays.
4. Python AI bridge (`simulation/ai_bridge.py`) uses modules in `drone_swarm/` and returns mission intelligence.

## API Endpoints

- `GET /health`
- `GET /api/mission/status`
- `POST /api/mission/configure`
- `POST /api/mission/start`
- `POST /api/mission/stop`
- `POST /api/mission/reset`
- `GET /api/mission/snapshot`
- `GET /api/mission/map`
- `GET /api/mission/ai-insights`

## Local Setup

### 1) Install JavaScript dependencies

```bash
npm install
```

### 2) Install Python dependencies (for full AI branch demos/tests)

```bash
python -m pip install -r requirements.txt
```

### 3) Run full stack

```bash
npm run dev
```

This starts:

- Mission server on `http://localhost:3001`
- Frontend on Vite dev server (default `http://localhost:5173`)

## Project Layout

- `src/`: React control center and pages
- `public/map/`: Three.js 3D visualization
- `server.js`: telemetry + mission orchestration
- `simulation/`: Team A simulation logic and AI bridge
- `drone_swarm/`: Team C AI coordination and integration modules from branch 3

## Notes

- If Python is unavailable or AI bridge fails, the server falls back to built-in heuristic insights so the UI remains operational.
- For deterministic Python selection, set `PYTHON_EXECUTABLE` before running the server.

Example:

```bash
set PYTHON_EXECUTABLE=python
npm run dev
```
