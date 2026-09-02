/**
 * zonePlanner.js
 *
 * Divides the world grid into N vertical strips (one per active drone),
 * then generates a boustrophedon (lawnmower) coverage path over each strip's
 * unoccupied cells. Returns a map of droneId → waypoints[].
 *
 * Phase 2 notes:
 *  - If Person A's worldMap is available (passed in), occupied cells are skipped.
 *  - If worldMap is null, all cells are treated as flyable (graceful degradation).
 *  - Call `buildZoneWaypoints(droneIds, worldMap, simConfig)` once at mission start,
 *    then pass individual drone queues into `decisionEngine.computeCommand()`.
 */

/**
 * Convert a grid cell coordinate back to world coordinates (cell centre).
 * @param {number} cellCoord  - 0-based cell index along one axis
 * @param {number} GRID_SIZE
 * @param {number} WORLD_BOUNDARY
 * @returns {number} world position
 */
function cellToWorld(cellCoord, GRID_SIZE, WORLD_BOUNDARY) {
    const cellSize = (WORLD_BOUNDARY * 2) / GRID_SIZE;
    return -WORLD_BOUNDARY + cellCoord * cellSize + cellSize / 2;
}

/**
 * Return true if the given cell is occupied (obstacle present).
 * Accepts the occupancy grid from Person A's worldMap:
 *   worldMap[cellX][cellY] = { occupied: bool, height: number }
 * Falls back to `false` if data is absent.
 *
 * @param {number} cx
 * @param {number} cy
 * @param {Object|null} worldMap
 * @returns {boolean}
 */
function isCellOccupied(cx, cy, worldMap) {
    if (!worldMap) return false;
    const col = worldMap[cx];
    if (!col) return false;
    const cell = col[cy];
    if (!cell) return false;
    return cell.occupied === true;
}

/**
 * Generate a boustrophedon (back-and-forth lawnmower) waypoint list
 * covering every unoccupied cell in the given column range [colStart, colEnd).
 *
 * @param {number} colStart   - first column index (inclusive)
 * @param {number} colEnd     - last column index (exclusive)
 * @param {number} GRID_SIZE  - total grid rows
 * @param {number} WORLD_BOUNDARY
 * @param {Object|null} worldMap
 * @param {number} cruiseAltitude - flight altitude in world units
 * @returns {{ x: number, y: number, z: number }[]}
 */
function generateSweepPath(colStart, colEnd, GRID_SIZE, WORLD_BOUNDARY, worldMap, cruiseAltitude) {
    const waypoints = [];

    for (let cx = colStart; cx < colEnd; cx++) {
        // Alternate scan direction each column — boustrophedon pattern
        const ascending = (cx - colStart) % 2 === 0;
        const rows = ascending
            ? Array.from({ length: GRID_SIZE }, (_, i) => i)
            : Array.from({ length: GRID_SIZE }, (_, i) => GRID_SIZE - 1 - i);

        for (const cy of rows) {
            if (isCellOccupied(cx, cy, worldMap)) continue;

            waypoints.push({
                x: cellToWorld(cx, GRID_SIZE, WORLD_BOUNDARY),
                y: cellToWorld(cy, GRID_SIZE, WORLD_BOUNDARY),
                z: cruiseAltitude,
            });
        }
    }

    return waypoints;
}

/**
 * Partition the grid into N equal vertical strips and generate a coverage
 * path for each strip.
 *
 * @param {string[]} droneIds      - active drone IDs, e.g. ["DRN-001", "DRN-002"]
 * @param {Object|null} worldMap   - Person A's occupancy grid, or null
 * @param {{ GRID_SIZE: number, WORLD_BOUNDARY: number }} simConfig
 * @param {number} [cruiseAltitude=95] - default cruise altitude
 * @returns {Map<string, { x,y,z }[]>}  droneId → ordered waypoints
 */
export function buildZoneWaypoints(droneIds, worldMap, simConfig, cruiseAltitude = 95) {
    const { GRID_SIZE = 40, WORLD_BOUNDARY = 350 } = simConfig || {};
    const n = droneIds.length;

    if (n === 0) return new Map();

    // Split GRID_SIZE columns evenly among n drones
    const colsPerDrone = Math.ceil(GRID_SIZE / n);
    const result = new Map();

    droneIds.forEach((id, idx) => {
        const colStart = idx * colsPerDrone;
        const colEnd = Math.min(colStart + colsPerDrone, GRID_SIZE);
        const path = generateSweepPath(
            colStart, colEnd, GRID_SIZE, WORLD_BOUNDARY, worldMap, cruiseAltitude
        );
        result.set(id, path);
    });

    return result;
}

/**
 * Given the droneId → zone index mapping, return the zone label string
 * suitable for DroneCommand.assignedZoneId, e.g. "Z3".
 *
 * @param {string} droneId
 * @param {string[]} allDroneIds
 * @returns {string}
 */
export function getZoneId(droneId, allDroneIds) {
    const idx = allDroneIds.indexOf(droneId);
    return idx >= 0 ? `Z${idx + 1}` : 'Z?';
}
