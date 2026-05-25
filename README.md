# DroneShield — Autonomous Drone Swarm Platform

Real-time flood-rescue drone swarm telemetry, AI insights, and 3D situational awareness for the New Horizon Hackathon 2026.

## Features
- **Swarm Command Dashboard** with live mission KPIs, drone table, and tactical overlays.
- **Tactical Mission Map** showing drone trails, obstacles by severity, and survivor locations.
- **Survivor Detection Feed** with confidence and coordinates.
- **Event Logs** for critical/warning/info alerts.
- **Coverage & Battery Charts** plus fleet allocation by task.
- **3D Terrain Visualization** with post-processing, animated drone, and keyboard controls.
- **AI Insights Bridge** via Python (fallbacks to heuristic insights if Python is unavailable).
- **XAI Decision Matrix** (Explainable AI) with zone scores, confidence, and reasoning.
- **Dual Telemetry Modes**: local simulation or live Socket.IO feed.

## Routes
- `/` Home landing page
- `/dashboard` Command center
- `/map` 3D visualization (iframe from `/public/map`)
- `/xai` XAI Decision Matrix

## Architecture
1. `server.js` runs mission simulation, telemetry, and AI insight generation.
2. React app renders the command UI and XAI views.
3. Three.js scene (`public/map/`) renders terrain and drone visuals.
4. Python AI bridge (`simulation/ai_bridge.py`) uses modules in `drone_swarm/` (optional).

## API Endpoints
- `GET /health`
- `GET /api/mission/snapshot`
- `GET /api/mission/status`
- `GET /api/mission/ai-insights`
- `POST /api/mission/configure`
- `POST /api/mission/start`
- `POST /api/mission/stop`
- `POST /api/mission/reset`
- `GET /api/mission/map`

## Running Locally

### 1) Install JavaScript dependencies
```bash
npm install
```

### 2) (Optional) Install Python dependencies for AI bridge
```bash
python -m pip install -r requirements.txt
```

### 3) Run full stack (frontend + server)
```bash
npm run start
```

This starts:
- Mission server on `http://localhost:3001`
- Frontend on Vite dev server (default `http://localhost:5173`)

### 4) Run separately (optional)
```bash
# Frontend only
npm run dev

# Server only
node server.js
```

## Notes
- If Python is unavailable, the server falls back to built-in heuristic insights so the UI remains operational.
- For deterministic Python selection, set `PYTHON_EXECUTABLE` before running the server.

Example:
```bash
set PYTHON_EXECUTABLE=python
npm run start
```
