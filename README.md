# DroneShield

Real-time flood-rescue drone swarm telemetry and 3D situational awareness for the New Horizon Hackathon 2026.

## Features
- **Swarm Command Dashboard** with live mission KPIs, drone table, and selectable telemetry.
- **Tactical Mission Map** showing drone trails, obstacles by severity, and survivor locations.
- **Survivor Detection Feed** with confidence and coordinates.
- **Event Logs** for critical/warning/info alerts.
- **Coverage and Battery Charts** plus fleet allocation by task.
- **3D Terrain Visualization** with post-processing, animated drone, and keyboard controls.
- **Dual Telemetry Modes**: local simulation or live Socket.IO feed.

## Routes
- `/` Home landing page
- `/dashboard` Command center
- `/map` 3D visualization (iframe from `/public/map`)

## Tech Stack
- React + TypeScript + Vite
- Tailwind CSS, Framer Motion, Recharts
- Express + Socket.IO
- Three.js

## Running Locally

### 1. Install dependencies
```bash
npm install
```

### 2. Start the app (frontend + server)
```bash
npm run start
```
- Vite dev server: http://localhost:5173  
- Telemetry server: http://localhost:3001  

### 3. Switch telemetry mode (optional)
- **Simulation** mode runs locally by default in the dashboard.
- **Live** mode connects to the Socket.IO server at `http://localhost:3001`.

### 4. Run separately (optional)
```bash
# Frontend only
npm run dev

# Server only
node server.js
```

## Build and Preview
```bash
npm run build
npm run preview
```

## Notes
- The 3D visualization depends on `three`. If you see Vite dependency errors, re-run `npm install`.
