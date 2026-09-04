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

  const pythonAssignments = (missionState && missionState.pythonAssignments) || {};
  const allDroneIds = (missionState && missionState.allDroneIds) || [];

  const assignment = pythonAssignments[droneState.id];
  let assignedZoneId = undefined;

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
    task: droneState.task || 'exploring',
  };

  if (assignment) {
    if (assignment.role === 'relay') {
      command.task = 'relay';
      command.reason = 'mesh-checkpoint';
      command.assignedZoneId = 'RELAY';
      const target = assignment.checkpoint;
      if (target) {
        const dist = dist2D(droneState, target);
        if (dist > 15) {
          command.targetHeading = bearingTo(droneState, target);
          command.targetSpeed = Math.min(droneState.targetSpeed + 1.5, 20);
        } else {
          // Hover at checkpoint
          command.targetSpeed = 0;
          command.targetHeading = droneState.heading; // Hold heading
        }
        command.targetZ = 120; // High altitude for relay
      }
    } else if (assignment.role === 'searcher') {
      command.task = 'exploring';
      command.reason = 'ring-sweep';
      
      const sector = assignment.sector;
      if (sector) {
        command.assignedZoneId = `RING-${sector.ring}`;
        // Calculate drone's current polar coordinates relative to launch (0,0)
        const dx = droneState.x;
        const dy = droneState.y;
        const r = Math.sqrt(dx*dx + dy*dy);
        let theta = Math.atan2(dy, dx);
        if (theta < 0) theta += 2 * Math.PI;

        // Ensure drone stays within sector
        let targetR = r;
        let targetTheta = theta;
        let outOfBounds = false;

        if (r < sector.r_inner + 20) { targetR = sector.r_inner + 40; outOfBounds = true; }
        if (r > sector.r_outer - 20) { targetR = sector.r_outer - 40; outOfBounds = true; }
        
        // Normalize thetas for comparison
        let sStart = sector.theta_start;
        let sEnd = sector.theta_end;
        if (sEnd < sStart) sEnd += 2 * Math.PI;
        let tNormalized = theta;
        if (tNormalized < sStart) tNormalized += 2 * Math.PI;

        if (tNormalized < sStart + 0.1) { targetTheta = sStart + 0.3; outOfBounds = true; }
        if (tNormalized > sEnd - 0.1) { targetTheta = sEnd - 0.3; outOfBounds = true; }

        if (outOfBounds) {
          // Steer back into sector
          const targetX = targetR * Math.cos(targetTheta);
          const targetY = targetR * Math.sin(targetTheta);
          command.targetHeading = bearingTo(droneState, {x: targetX, y: targetY});
          command.targetSpeed = 15;
        } else {
          // Inside sector: random sweep (bounce off walls naturally handled by outOfBounds)
          // Add slight random drift to sweep the area
          if (Math.random() < 0.05) {
             command.targetHeading = (command.targetHeading + (Math.random() * 60 - 30) + 360) % 360;
          }
          command.targetSpeed = 12;
        }
        command.targetZ = 80; // Lower altitude for searching
      }
    }
  }

  // --- Step 1.5: GPS-denied hold ---
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
