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

- `gpsMode` and `positionUncertainty` are new fields (not yet on server). Person B is responsible for adding these in Phase 1.
- `relayPath` is new. null means the drone has direct signal to base. A non-null list e.g. `["DRN-003", "DRN-005"]` means this drone's telemetry is being relayed through those drones in order.
- All coordinates use the **same world space**: `[-350, 350]` on both X and Y axes. Do NOT use a different boundary in any file.
- `targetHeading`, `targetSpeed`, `targetZ` are **internal physics state** on the server only. They are NOT part of the broadcast DroneState. Do not add them to this schema.
