# WorldMap — Canonical Schema

The world map is a 2D grid of cells. It is generated once by the server (seeded Perlin noise) and shared with clients.
Used by: server.js (generating), public/map/main.js (3D terrain), Dashboard/MissionMap (2D overlay), ai_bridge.py (obstacle weighting).

## Coordinate System

- World space: `[-WORLD_BOUNDARY, +WORLD_BOUNDARY]` on both X and Y.
- Grid space: `[0, GRID_SIZE)` on both axes (from `shared/simConfig.json`).
- Conversion: `cellX = floor(((worldX + WORLD_BOUNDARY) / (WORLD_BOUNDARY * 2)) * GRID_SIZE)`
- The grid origin `[0,0]` maps to world `[-350, -350]` (bottom-left).

## TypeScript Definition

```ts
interface Cell {
  height: number;         // Terrain height 0–85 (raw Perlin value * 85)
  occupied: boolean;      // true if a building/obstacle occupies this cell
  obstacleId?: string;    // ID of the obstacle occupying this cell (if occupied)
}

type WorldMap = Cell[][];  // worldMap[cellX][cellY]
```

## API Response Shape (`GET /api/mission/map`)

```ts
interface MapData {
  heightMap: number[][];           // heightMap[row][col], range 0–85
  rawSurvivors: [number, number][]; // Grid-space [col, row] positions of hidden survivors
  gridSize: number;                // = GRID_SIZE from simConfig
  worldBoundary: number;           // = WORLD_BOUNDARY from simConfig
  obstacles?: Cell[][];            // Optional: populated after GLB scan via /api/mission/set-obstacles
}
```

## Obstacle Object (from `/api/mission/set-obstacles` or `buildObstacleField()`)

```ts
interface Obstacle {
  id: string;             // "OBS-001" (procedural) or "GLB-{x}-{y}" (scanned from city mesh)
  x: number;              // World X
  y: number;              // World Y
  radius: number;         // Horizontal avoidance radius in world units
  height: number;         // Vertical extent — drone must fly above this to safely pass over
  severity: 'low' | 'medium' | 'high';
  kind?: string;          // Visual kind for 3D rendering ('boulder_field', 'deadwood', etc.)
}
```

## Python Equivalent

```python
# MapData
{
  "heightMap": list[list[float]],    # [row][col]
  "rawSurvivors": list[tuple[int, int]],
  "gridSize": int,
  "worldBoundary": float
}

# Obstacle
{
  "id": str,
  "x": float,
  "y": float,
  "radius": float,
  "height": float,
  "severity": "low" | "medium" | "high"
}
```

## Notes

- `heightMap[row][col]` — row is Y axis, col is X axis. Be careful with index order.
- `rawSurvivors` positions are in **grid space**, not world space.
- After `POST /api/mission/set-obstacles`, the obstacle list on the server is replaced wholesale. The procedural obstacles from `buildObstacleField()` are discarded.
- The GLB scan (`scanCityMesh()`) produces obstacles with `id = "GLB-{worldX}-{worldY}"` so they are distinguishable from procedural ones.
