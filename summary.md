# Project Summary: DroneShield

## Purpose
DroneShield is a hackathon prototype for real-time flood-rescue coordination. It simulates (or streams) drone swarm telemetry, highlights survivor detections, and provides a tactical UI plus a 3D terrain visualization.

## Tech Stack
- **Frontend:** React + TypeScript + Vite, Tailwind CSS, Framer Motion, Recharts
- **Backend:** Node.js + Express + Socket.IO (telemetry simulation and live feed)
- **3D:** Three.js (standalone visualization under `public/map`)

## App Structure
- **Routes**
  - `/` Home landing page with CTA links to the command center and 3D view.
  - `/dashboard` Swarm Command dashboard (telemetry, charts, logs, map).
  - `/map` 3D visualization embedded via iframe from `/public/map/index.html`.
- **Key UI Components**
  - `StatsPanel`, `DroneGrid`, `MissionMap`, `SurvivorFeed`, `EventLogs`, `LiveVideo`, `ChartsPanel`.

## Feature Highlights
- **Swarm Command Dashboard**
  - Live metrics: coverage %, active drones, survivors found, scanned cells, avg battery/signal, mission timer.
  - Drone table with live position/heading/speed, battery + signal bars, and row selection.
  - Tactical mission map showing drone trails, obstacles (severity-coded), detected survivors, and hidden survivor zones.
  - Event log feed with animated alerts (info/warning/critical) and timestamps.
  - Survivor detection feed with confidence %, time, and coordinates.
  - Charts for coverage trend + battery trend; fleet allocation bar by task (explore/idle/return).
  - Simulated “live video” feed with HUD overlays (altitude, speed, heading, battery, signal).
- **Telemetry Modes**
  - **Simulation mode** (default): Fully local telemetry engine on the client for demos.
  - **Live mode**: Socket.IO connection to the server for real-time snapshots.
- **3D Visualization**
  - Procedural terrain with stylized lighting, fog, bloom, and water reflections.
  - Orbit controls + post-processing passes (bloom/output).
  - Animated drone model with rotor spin and glow effects.
  - Keyboard controls: **WASD / Arrow keys** for movement, **Space/Shift** for altitude.
- **Server Simulation**
  - Periodic telemetry snapshots (every ~700ms).
  - Drone state updates: heading drift, movement, battery drain, signal decay, trails.
  - Survivor detection within radius + alert generation.
  - REST endpoints: `/health`, `/api/mission/snapshot`.

## Runtime Flow
- **Simulation mode (default in Dashboard):** Client-side telemetry generation updates drones, survivors, coverage, logs.
- **Live mode:** Connects to `http://localhost:3001` via Socket.IO for real server snapshots.
- **Server (`server.js`):** Emits `telemetrySnapshot` updates every ~700ms, tracks obstacles and survivor detections, and exposes `/health` + `/api/mission/snapshot`.

## 3D Visualization
The 3D terrain scene is a standalone vanilla JS Three.js build (`public/map/main.js`) with orbit controls, post-processing, and a stylized drone/terrain scene. The React app embeds it through an iframe.

## Current Notes
- Three.js is required for the 3D map; ensure `npm install` has been run after adding `three` to `package.json` to resolve Vite pre-bundling errors.
