export function computeCommand(droneState, worldMap, missionState) {
  // Pull obstacles from wherever they are injected (to be fully swapped in Phase 2)
  const obstacles = (worldMap && worldMap.obstacles) || (missionState && missionState.obstacles) || [];
  
  let nearest = null;
  let nearestDist = Number.POSITIVE_INFINITY;

  for (const obstacle of obstacles) {
    const dx = droneState.x - obstacle.x;
    const dy = droneState.y - obstacle.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < nearestDist) {
      nearestDist = distance;
      nearest = obstacle;
    }
  }

  // Default command values to continue current trajectory
  const command = {
    droneId: droneState.id,
    targetHeading: droneState.targetHeading,
    targetSpeed: droneState.targetSpeed,
    targetZ: droneState.targetZ,
    reason: 'exploring',
    priority: 'normal',
    issuedAt: new Date().toISOString(),
    issuedBy: 'ai-bridge'
  };

  if (!nearest) return command;

  const cautionRadius = nearest.radius + 12;
  const clearanceZ = nearest.height + 25; // Minimum safe altitude to fly over

  // Only evade if we are within the horizontal circle AND below the safe clearance altitude (3D check!)
  if (nearestDist < cautionRadius && droneState.z < clearanceZ) {
    const awayAngle = (Math.atan2(droneState.y - nearest.y, droneState.x - nearest.x) * 180) / Math.PI;
    const blend = nearestDist < nearest.radius + 3 ? 0.78 : 0.42;
    
    // Smoothly turn away by setting the target heading
    command.targetHeading = ((1 - blend) * droneState.targetHeading + blend * awayAngle + 360) % 360;
    
    // Speed clamp equivalent to `clamp(drone.targetSpeed * 0.82, 7, 16)`
    command.targetSpeed = Math.max(7, Math.min(16, droneState.targetSpeed * 0.82));
    
    // 3D Evasion: Also pitch up to fly over the obstacle!
    command.targetZ = Math.max(droneState.targetZ, clearanceZ + 5);
    
    command.reason = 'obstacle-avoidance';
    command.priority = nearestDist < nearest.radius + 3 ? 'emergency' : 'high';

    // Hard push only if absolutely critically close
    if (nearestDist < nearest.radius + 1.5) {
      const push = nearest.radius + 2.2 - nearestDist;
      const rad = (awayAngle * Math.PI) / 180;
      // Inject force dx/dy into the command so actution engine applies it immediately
      command.positionAdjust = {
        dx: Math.cos(rad) * push,
        dy: Math.sin(rad) * push
      };
    }
  }

  return command;
}
