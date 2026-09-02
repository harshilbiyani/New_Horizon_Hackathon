# DroneState — Canonical Schema

This is the single source of truth for a drone's state object.
All layers (server.js, Dashboard.tsx, XAIDecisions.tsx, public/map/main.js, ai_bridge.py) must conform to this shape.

## TypeScript Definition

```ts
interface DroneState {
  id: string;                    // e.g. "DRN-001"
  x: number;                     // World X coord, range [-WORLD_BOUNDARY, +WORLD_BOUNDARY]
  y: number;                     // World Y coord, range [-WORLD_BOUNDARY, +WORLD_BOUNDARY]
  z: number;                     // Altitude (world units), range [60, 130] cruising
  heading: number;               // Actual heading in degrees [0, 360)
  speed: number;                 // Current speed in world units/sec
  battery: number;               // 0–100%, drains each tick
  signalStrength: number;        // 28–99%, degrades with distance from origin
  status: 'active' | 'failed';
  task: 'exploring' | 'returning' | 'evading' | 'idle' | 'reassigned';
  gpsMode: 'gps' | 'dead-reckoning'; // GPS if signal > 40, dead-reckoning below
  positionUncertainty: number;   // Meters of position error (0 = perfect GPS)
  relayPath: string[] | null;    // Ordered list of drone IDs used as signal relay, null if direct
  distanceTraveled: number;      // Odometer (world units)
  lastSeen: string;              // ISO timestamp of last tick update
  trail: Array<{ x: number; y: number }>; // Last 40 positions
}
```

## Python Equivalent (dict keys)

```python
{
  "id": str,                     # "DRN-001"
  "x": float,
  "y": float,
  "z": float,
  "heading": float,
  "speed": float,
  "battery": float,
  "signalStrength": float,
  "status": "active" | "failed",
  "task": str,
  "gpsMode": "gps" | "dead-reckoning",
  "positionUncertainty": float,
  "relayPath": list[str] | None,
  "distanceTraveled": float,
  "lastSeen": str,               # ISO 8601
  "trail": list[{"x": float, "y": float}]
}
```

## Notes

- `gpsMode` and `positionUncertainty` are **actively populated** by `server/gpsModel.js`. Denial zones are geographic circles; when a drone enters one it switches to `'dead-reckoning'` and `positionUncertainty` grows as `sqrt(ticks_denied) × 8` world-units.
- `relayPath` is **actively populated** by `server/meshNetwork.js` via BFS each tick. `null` means isolated from BASE; a non-null list e.g. `["DRN-003", "DRN-005", "BASE"]` is the relay chain. Survivor detections made while `relayPath === null` are **queued** and flushed to `foundSurvivors` on reconnect.
- All coordinates use the **same world space**: `[-350, 350]` on both X and Y axes. Do NOT use a different boundary in any file.
- `targetHeading`, `targetSpeed`, `targetZ` are **internal physics state** on the server only. They are NOT part of the broadcast DroneState.
- `denialZoneId` (e.g. `"GDZ-A"`) is a transient debug field present only when `gpsMode === 'dead-reckoning'`.
