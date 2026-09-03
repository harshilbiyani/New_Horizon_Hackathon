# DroneShield — Next Steps: Consolidated Fix Backlog

Based on the audit findings, the core algorithms exist but aren't plugged in — this is almost entirely **wiring**, not new engineering, plus one real feature addition (making the human models the actual survivors). This should be fast to execute. Ordered by dependency and payoff.

Give this directly to your agent as a task list, one item at a time — don't let it batch all of them into one giant diff, since you want to test after each wire-up (a broken import here silently kills the whole tick loop).

---

## TRACK 1 — Person B's wiring (brain side: 3 import swaps, ~30–60 min total)

These three are mechanically identical: real logic already written and unit-tested in `server/`, just never imported into `server.js`. Do them one at a time, restart the server, run a mission, confirm behavior visibly changes before moving to the next.

### B1. Wire `decisionEngine.js` — highest priority, unblocks path planning + real obstacle avoidance
- In `server.js`, replace the call to `stubDecisionEngine(drone)` (currently ~line 263, still looping `obstacles[]` at line 276) with:
  ```js
  import { computeCommand } from './server/decisionEngine.js';
  // in the tick loop:
  const command = computeCommand(droneState, currentWorldMap, missionState);
  ```
- **Verify after**: drones should now sweep organized lawnmower patterns instead of random heading drift. Watch one drone for 30 seconds — if it's still doing random `+/-10°` wander, the import didn't take or `missionState`/zone assignment isn't populated yet (check `zonePlanner.js` is actually being called somewhere to produce zones for `computeCommand` to read).
- **Known dependency**: `computeCommand` expects `worldMap` — confirm `currentWorldMap` is non-null at the point this is called (i.e., a mission can't meaningfully start until the world-map scan has POSTed once — decide whether to block "Start Mission" until `currentWorldMap` exists, or fall back to `stubDecisionEngine` gracefully if it's null so the app doesn't crash on a fresh boot with no scan yet).

### B2. Wire `gpsModel.js`
- Replace the `drone.signalStrength > 40` fallback threshold (~line 360) with:
  ```js
  import { updateGpsState } from './server/gpsModel.js';
  updateGpsState(droneState, gpsZones);
  ```
- **Verify after**: fly a drone into a defined GPS-denial zone, confirm `gpsMode` flips to `'dead-reckoning'` in the outgoing telemetry and `DroneGrid.tsx`'s badge actually lights up (the UI was already built per the audit — this is the first time it'll show real data instead of never firing).

### B3. Wire `meshNetwork.js`
- Replace the pairwise-distance `buildMeshLinks()` (~line 415) with:
  ```js
  import { computeMeshGraph } from './server/meshNetwork.js';
  const { meshLinks, relayPaths } = computeMeshGraph(drones, baseStation);
  ```
- **Verify after**: push a drone far enough from base that it needs a relay — confirm `relayPath` populates (e.g. `DRN-004 → DRN-002 → BASE`) in `DroneGrid.tsx`, and confirm a drone with no path at all gets marked undelivered/queued rather than silently still "connected."

**Track 1 exit check**: run one full mission end-to-end. All three UI elements that were previously dead (organized sweep paths, dead-reckoning badge, relay chain text) should now visibly do something during the mission, not just exist in the component code.

---

## TRACK 2 — Person A's wiring (world side: 2 fixes, ~20–40 min total)

### A1. Fix `GET /api/mission/map` to serve `currentWorldMap`
- Replace the call to `generatePerlinLikeNoise()` inside `getMapData()` (lines ~698, ~768) with a direct return of `currentWorldMap`.
- **Verify after**: hit the endpoint directly (`curl localhost:3001/api/mission/map` or open in browser) and confirm the response is your real occupancy grid shape (`{height, occupied}` per cell), not noise values.

### A2. Expose `scannedCells` as a real array in `telemetrySnapshot`, not just a count
- Currently `snapshot.missionData.scannedCells` sends an integer count. Change it to also include the actual set of `"cellX:cellY"` keys (or an array of `{x, y}`), e.g.:
  ```js
  missionData: {
    scannedCellsCount: scannedCells.size,   // keep for existing UI that just shows a number
    scannedCells: Array.from(scannedCells)  // new: individual cells for rendering
  }
  ```
- Then update `MissionMap.tsx` to actually render a tile per entry in `scannedCells` (this is the "render scanned cell squares" fix the audit flagged).
- **Verify after**: watch the 2D tactical map during a mission — explored tiles should visibly light up/shade in as drones fly over them, not stay blank.

**Track 2 exit check**: heatmap on both the 3D scene and 2D map should now reflect real explored coverage, and the raw map API should return real building data to any external consumer.

---

## TRACK 3 — Make the survivor models real (the feature you just decided on: Option 2)

This is new work, not just wiring, so budget more time than Track 1/2. Assign to whichever person has bandwidth first — it touches both `public/map/main.js` (world side) and `server.js` (currently Person A's territory, so probably natural for A, but doesn't block B's work at all).

### C1. Constrain model placement to unoccupied ground cells
- Wherever the human `.glb` models are currently placed "randomly," change the placement logic to pick from cells where `worldMap[cellX][cellY].occupied === false` (reuse the same grid you already built in `scanCityMesh()` — don't recompute a second occupancy check).
- Keep using `dropToGround()` (already exists, per the original audit) to snap each model exactly onto the terrain/floor height at that cell, so nothing spawns floating or clipped into geometry.

### C2. Send real placement positions to the server
- After models are placed, POST their `(x, y, z)` world coordinates to a new (or reused) endpoint — e.g. `POST /api/mission/survivor-positions` — the same pattern already used for `worldMap` POSTing.
- On the server, replace the hardcoded `hiddenSurvivors` array (currently 5 fixed coordinates, lines ~80-86) with whatever positions arrive from this POST. Keep a sane fallback (the old hardcoded array) for the case where no scan/placement has happened yet, so the mission can still start in a degraded mode rather than crash.

### C3. Confirm detection radius math is unchanged but now points at real positions
- `detectSurvivors()`'s distance-check logic doesn't need to change — only its input data source does. Double check the detection radius (`35` units) still makes sense visually against the new real placements (a model that looks "close" on screen should actually be within 35 units, or the demo will look broken — drone flies right next to a person and nothing happens).

### C4. Decide on population vs. survivors, and flag any non-survivor models
- If every placed human model is meant to be a survivor: skip this step.
- If any models are meant to be scene-dressing / bystanders (not something a drone should "find"): add a `detectable: true/false` field to whatever gets POSTed in C2, and make sure `hiddenSurvivors` on the server only includes the `detectable: true` ones.

**Track 3 exit check**: fly a drone directly over/near a visible human model in the 3D scene and confirm a `survivorFound` event fires and shows up in `SurvivorFeed.tsx` — the visual and the logic should now be the same thing, closing the gap the audit flagged in Part 3 (hardcoded, disconnected survivor coordinates).

---

## WHAT TO DEFER (lower priority than the above — only if time remains after Tracks 1–3)

- GPS-denial zones derived automatically from `worldMap` height clusters instead of hand-picked boxes (reusability item, not demo-breaking).
- `data/worldMap.json` cache invalidation when the GLB changes (only matters if you actually swap city models before the deadline — if you're demoing with one fixed city, this is safe to leave).
- Deriving signal-strength/confidence numbers from something more principled than distance + jitter (cosmetic realism, not functionally broken).

---

## SUGGESTED EXECUTION ORDER (if working solo through the agent, do it in this sequence)

1. B1 (decisionEngine) — biggest visible payoff, unblocks path planning entirely.
2. A1 (map endpoint) — trivial, 5-line fix.
3. A2 (scannedCells array) — pairs with A1 to finish the real heatmap.
4. B2 (gpsModel) — independent, moderate payoff.
5. B3 (meshNetwork) — independent, moderate payoff.
6. C1–C4 (survivor models) — do last since it's genuinely new work, not just wiring, and everything before it is safe/independent of it.

After each numbered item: restart the server, run a short mission, visually confirm the specific "Verify after" behavior before moving to the next item. Don't stack multiple unverified wiring changes — if something breaks, you want to know exactly which import caused it.