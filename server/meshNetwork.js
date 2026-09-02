/**
 * meshNetwork.js — Real mesh connectivity with BFS relay paths
 *
 * Every tick:
 *   1. Build adjacency from drone positions + base station.
 *   2. BFS from each drone to find if it can reach BASE (possibly multi-hop).
 *   3. Record the relay path on the drone state; null = isolated.
 *   4. Survivor detections made by isolated drones are queued.
 *   5. On reconnect, queued detections are flushed back to the caller.
 *
 * Exports:
 *   buildMeshState(drones, simConfig) → { meshLinks, pendingFlush }
 *     - meshLinks      : raw links to feed buildSnapshot / MissionMap
 *     - pendingFlush   : survivor detections that were queued and now delivered
 */

const BASE_ID = 'BASE';
const BASE_POS = { x: 0, y: 0 }; // Fixed base station at origin

// Per-drone queued (undelivered) detections — persists across ticks
const _pendingDetections = new Map(); // droneId → detection[]

/**
 * Build adjacency list for all nodes (drones + BASE).
 *
 * @param {Object[]} activeDrones
 * @param {number} commRange
 * @returns {Map<string, string[]>} adjacency
 */
function buildAdjacency(activeDrones, commRange) {
    const adj = new Map();
    const nodes = [{ id: BASE_ID, x: BASE_POS.x, y: BASE_POS.y }, ...activeDrones];

    for (const node of nodes) adj.set(node.id, []);

    for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
            const a = nodes[i];
            const b = nodes[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist <= commRange) {
                adj.get(a.id).push(b.id);
                adj.get(b.id).push(a.id);
            }
        }
    }

    return adj;
}

/**
 * BFS from `startId` to `BASE_ID`.
 *
 * @param {string} startId
 * @param {Map<string, string[]>} adj
 * @returns {string[]|null} ordered relay path including startId and BASE, or null
 */
function bfsToBase(startId, adj) {
    if (startId === BASE_ID) return [BASE_ID];
    if (!adj.has(startId)) return null;

    const visited = new Set([startId]);
    const queue = [[startId]]; // each item is the path so far

    while (queue.length > 0) {
        const path = queue.shift();
        const current = path[path.length - 1];

        for (const neighbor of (adj.get(current) || [])) {
            if (visited.has(neighbor)) continue;
            const newPath = [...path, neighbor];
            if (neighbor === BASE_ID) return newPath;
            visited.add(neighbor);
            queue.push(newPath);
        }
    }

    return null; // unreachable
}

/**
 * Build the full mesh state for one tick.
 *
 * @param {Object[]} drones         — full mutable drone array (active + failed)
 * @param {{ COMM_RANGE: number }} simConfig
 * @param {Object[]} [newDetections=[]]  — detections found this tick (from detectSurvivors)
 * @returns {{ meshLinks: Object[], pendingFlush: Object[] }}
 */
export function buildMeshState(drones, simConfig, newDetections = []) {
    const commRange = simConfig.COMM_RANGE || simConfig.COMMUNICATION_RANGE || 90;
    const activeDrones = drones.filter(d => d.status === 'active');

    const adj = buildAdjacency(activeDrones, commRange);

    // Build meshLinks array for snapshot / MissionMap
    const meshLinks = [];
    for (const drone of activeDrones) {
        for (const neighborId of (adj.get(drone.id) || [])) {
            if (neighborId === BASE_ID) continue; // don't draw base links in drone-to-drone list
            // Only add each pair once (lower id first)
            if (drone.id < neighborId) {
                const other = activeDrones.find(d => d.id === neighborId);
                if (!other) continue;
                const dx = drone.x - other.x;
                const dy = drone.y - other.y;
                const dist = Math.sqrt(dx * dx + dy * dy);
                meshLinks.push({
                    from: drone.id,
                    to: neighborId,
                    distance: Number(dist.toFixed(2)),
                    signal: Number(Math.max(0.1, 1 - (dist / commRange) * 0.9).toFixed(2)),
                });
            }
        }
    }

    // Queue new detections for isolated drones; let connected drones pass through
    const pendingFlush = [];

    for (const detection of newDetections) {
        const droneId = detection.droneId;
        const relayPath = bfsToBase(droneId, adj);

        if (relayPath) {
            // Drone is connected — deliver immediately
            pendingFlush.push(detection);
        } else {
            // Isolated — queue it
            if (!_pendingDetections.has(droneId)) _pendingDetections.set(droneId, []);
            _pendingDetections.get(droneId).push(detection);
        }
    }

    // Update relay paths on each drone; flush queued detections on reconnect
    for (const drone of drones) {
        const relayPath = bfsToBase(drone.id, adj);
        drone.relayPath = relayPath;

        // If drone just reconnected and has queued detections, flush them
        if (relayPath && _pendingDetections.has(drone.id)) {
            const queued = _pendingDetections.get(drone.id);
            pendingFlush.push(...queued);
            _pendingDetections.delete(drone.id);
            if (queued.length > 0) {
                console.log(`[MESH] Flushed ${queued.length} queued detection(s) from ${drone.id} on reconnect.`);
            }
        }
    }

    return { meshLinks, pendingFlush };
}

/**
 * Expose GPS-denial zone data alongside so the frontend can draw them.
 * @returns {Map} current pending detection queues per drone (for diagnostics)
 */
export function getPendingDetectionCounts() {
    const out = {};
    for (const [id, queue] of _pendingDetections) {
        out[id] = queue.length;
    }
    return out;
}
