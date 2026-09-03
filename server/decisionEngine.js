/**
 * decisionEngine.js  (Phase 2 — waypoint-guided sweep with obstacle avoidance fallback)
 *
 * External API:
 *   computeCommand(droneState, worldMap, missionState) → DroneCommand
 *
 * missionState may carry:
 *   missionState.waypointQueues  — Map<droneId, {x,y,z}[]>  (from zonePlanner.buildZoneWaypoints)
 *   missionState.obstacles       — obstacle[] (flat array, Phase 1 fallback)
 *   missionState.allDroneIds     — string[]  (for zone label generation)
 *
 * The engine:
 *   1. Checks if a waypoint queue exists for the drone.
 *   2. Steers toward the head of the queue, popping waypoints on arrival.
 *   3. Runs the obstacle avoidance check and overrides the heading/altitude if needed.
 *   4. Returns a canonical DroneCommand object.
 */

// Arrival threshold: if the drone is within this distance of a waypoint, pop it.
const WAYPOINT_ARRIVAL_RADIUS = 18; // world units

/**
 * Compute the bearing angle (degrees [0,360)) from the drone's current
 * position toward a target (x, y).
 */
function bearingTo(drone, target) {
  const dx = target.x - drone.x;
  const dy = target.y - drone.y;
  return ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
}

/**
 * Euclidean distance in the XY plane.
 */
function dist2D(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Run the obstacle avoidance check. Returns a partial command override if
 * the drone is dangerously close to an obstacle, otherwise null.
 *
 * @param {{ x,y,z,targetHeading,targetSpeed,targetZ }} drone
 * @param {Object[]} obstacles
 * @returns {Object|null}
 */
function obstacleAvoidanceOverride(drone, obstacles) {
  if (!obstacles || obstacles.length === 0) return null;

  let nearest = null;
  let nearestDist = Number.POSITIVE_INFINITY;

  for (const obstacle of obstacles) {
    const dx = drone.x - obstacle.x;
    const dy = drone.y - obstacle.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < nearestDist) {
      nearestDist = distance;
      nearest = obstacle;
    }
  }

  if (!nearest) return null;

  const cautionRadius = nearest.radius + 12;
  const clearanceZ = nearest.height + 25;

  if (nearestDist < cautionRadius && drone.z < clearanceZ) {
    const awayAngle = (Math.atan2(drone.y - nearest.y, drone.x - nearest.x) * 180) / Math.PI;
    const isCritical = nearestDist < nearest.radius + 3;
    const blend = isCritical ? 0.78 : 0.42;

    const override = {
      targetHeading: ((1 - blend) * drone.targetHeading + blend * awayAngle + 360) % 360,
      targetSpeed: Math.max(7, Math.min(16, drone.targetSpeed * 0.82)),
      targetZ: Math.max(drone.targetZ, clearanceZ + 5),
      reason: 'obstacle-avoidance',
      priority: isCritical ? 'emergency' : 'high',
    };

    // Hard push if critically close
    if (nearestDist < nearest.radius + 1.5) {
      const push = nearest.radius + 2.2 - nearestDist;
      const rad = (awayAngle * Math.PI) / 180;
      override.positionAdjust = {
        dx: Math.cos(rad) * push,
        dy: Math.sin(rad) * push,
      };
    }

    return override;
  }

  return null;
}

/**
 * Pure function — no side effects, no globals.
 *
 * @param {Object} droneState    — current drone telemetry snapshot
 * @param {Object|null} worldMap — Person A's occupancy grid (Phase 2+) or null
 * @param {Object} missionState  — { waypointQueues, obstacles, allDroneIds }
 * @returns {Object}             — DroneCommand per shared/command.schema.md
 */
export function computeCommand(droneState, worldMap, missionState) {
  const obstacles =
    (worldMap && worldMap.obstacles) ||
    (missionState && missionState.obstacles) ||
    [];

  const waypointQueues =
    (missionState && missionState.waypointQueues) || null;

  const allDroneIds =
    (missionState && missionState.allDroneIds) || [];

  // Derive zone label for schema field
  const zoneIdx = allDroneIds.indexOf(droneState.id);
  const assignedZoneId = zoneIdx >= 0 ? `Z${zoneIdx + 1}` : undefined;

  // --- Base command: maintain current trajectory ---
  const command = {
    droneId: droneState.id,
    targetHeading: droneState.targetHeading,
    targetSpeed: droneState.targetSpeed,
    targetZ: droneState.targetZ,
    assignedZoneId,
    reason: 'exploring',
    priority: 'normal',
    issuedAt: new Date().toISOString(),
    issuedBy: 'ai-bridge',
  };

  // --- Step 1: Waypoint pursuit steering ---
  if (waypointQueues) {
    const queue = waypointQueues.get(droneState.id);

    if (queue && queue.length > 0) {
      const target = queue[0];
      const distToWaypoint = dist2D(droneState, target);

      if (distToWaypoint < WAYPOINT_ARRIVAL_RADIUS) {
        // Pop the reached waypoint in-place (caller owns the queue reference)
        queue.shift();
      }

      // If there is still a waypoint to reach, steer toward it
      const nextTarget = queue[0];
      if (nextTarget) {
        command.targetHeading = bearingTo(droneState, nextTarget);
        // Match cruise altitude of the waypoint
        command.targetZ = nextTarget.z;
        // Fly at a purposeful speed during coverage
        command.targetSpeed = Math.min(
          droneState.targetSpeed + 1.5,
          20
        );
        command.reason = 'sweeping';
        command.priority = 'normal';
      }
    }
    // If queue is exhausted, fall through to random-drift (inherited base values)
  }

  // --- Step 1.5: GPS-denied hold — reduce speed, freeze heading to limit drift ---
  if (droneState.gpsMode === 'dead-reckoning') {
    // Hold current heading (don't pursue waypoints we can't verify reaching)
    command.targetHeading = droneState.heading;
    // Slow down: drift error = speed × time, so cutting speed cuts uncertainty growth
    command.targetSpeed = Math.max(7, droneState.targetSpeed * 0.55);
    command.reason = 'gps-denied-hold';
    command.priority = 'high';
  }

  // --- Step 2: Obstacle avoidance (overrides waypoint steering when needed) ---
  const avoidance = obstacleAvoidanceOverride(droneState, obstacles);
  if (avoidance) {
    Object.assign(command, avoidance);
    // Preserve schema fields that avoidance doesn't touch
    if (!command.assignedZoneId && assignedZoneId) {
      command.assignedZoneId = assignedZoneId;
    }
  }

  return command;
}
