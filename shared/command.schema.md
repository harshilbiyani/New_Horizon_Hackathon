# Command — Canonical Schema

This is the shape of a command issued TO a drone, either from the AI engine or an operator.
Used by: server.js (applying commands), ai_bridge.py (producing commands), AICommandPanel.tsx (displaying them).

## TypeScript Definition

```ts
interface DroneCommand {
  droneId: string;               // Target drone, e.g. "DRN-003". Use "*" for broadcast to all.
  targetHeading?: number;        // Desired heading in degrees [0, 360). Optional.
  targetSpeed?: number;          // Desired speed in world units/sec. Optional.
  targetZ?: number;              // Desired altitude. Optional.
  assignedZoneId?: string;       // Zone identifier e.g. "Z3" or "ZONE-12". Optional.
  reason: string;                // Human-readable explanation for XAI display. REQUIRED.
  priority: 'low' | 'normal' | 'high' | 'emergency';
  issuedAt: string;              // ISO timestamp
  issuedBy: 'ai-bridge' | 'xai-engine' | 'operator';
}
```

## Python Equivalent

```python
{
  "droneId": str,                # "DRN-003" or "*"
  "targetHeading": float | None,
  "targetSpeed": float | None,
  "targetZ": float | None,
  "assignedZoneId": str | None,
  "reason": str,                 # REQUIRED
  "priority": "low" | "normal" | "high" | "emergency",
  "issuedAt": str,               # ISO 8601
  "issuedBy": "ai-bridge" | "xai-engine" | "operator"
}
```

## Notes

- `reason` is non-optional by design. Explainability is a core feature of this project.
- `priority: "emergency"` overrides all other commands for that drone immediately.
- The server must apply all fields that are present and ignore `None`/`undefined` fields gracefully.
- For Phase 1, commands are applied at the next tick. Real-time interruption (mid-tick) is a Phase 3 concern.
