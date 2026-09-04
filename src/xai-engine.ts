/**
 * XAI Scoring Engine
 * Derives zone assignments, confidence scores, and reasoning from mission state
 */

import type {
  Zone,
  ZoneId,
  ZoneScore,
  FactorBreakdown,
  XAIDecision,
  XAIDroneState,
  XAIWorldState,
  ExplorationMode,
} from './types/xai';

const ZONES: Zone[] = [
  { id: 'Z1', label: 'Alpha', col: 0, row: 0 },
  { id: 'Z2', label: 'Bravo', col: 1, row: 0 },
  { id: 'Z3', label: 'Charlie', col: 2, row: 0 },
  { id: 'Z4', label: 'Delta', col: 0, row: 1 },
  { id: 'Z5', label: 'Echo', col: 1, row: 1 },
  { id: 'Z6', label: 'Foxtrot', col: 2, row: 1 },
];

const GRID_COLS = 3;
const GRID_ROWS = 2;

/**
 * Derive zone coverage map from scanned cells and grid configuration
 * Maps global grid coordinates to zone IDs with 0–1 coverage float
 */
export function deriveZoneCoverage(
  scannedCells: Set<string>,
  gridSize: number
): Record<ZoneId, number> {
  const zoneCellCounts = new Map<ZoneId, number>();
  const cellsPerZone = (gridSize / GRID_COLS) * (gridSize / GRID_ROWS);

  ZONES.forEach((zone) => {
    zoneCellCounts.set(zone.id, 0);
  });

  scannedCells.forEach((cellKey) => {
    const [x, y] = cellKey.split(':').map(Number);
    const zoneCol = Math.floor((x / gridSize) * GRID_COLS);
    const zoneRow = Math.floor((y / gridSize) * GRID_ROWS);

    const zone = ZONES.find((z) => z.col === zoneCol && z.row === zoneRow);
    if (zone) {
      const count = (zoneCellCounts.get(zone.id) ?? 0) + 1;
      zoneCellCounts.set(zone.id, count);
    }
  });

  const coverage: Record<ZoneId, number> = {
    Z1: 0,
    Z2: 0,
    Z3: 0,
    Z4: 0,
    Z5: 0,
    Z6: 0,
  };
  ZONES.forEach((zone) => {
    const count = zoneCellCounts.get(zone.id) ?? 0;
    coverage[zone.id] = Math.min(1, count / cellsPerZone);
  });

  return coverage;
}

/**
 * Score a single drone-zone pair across 4 factors
 */
function scoreZone(
  drone: XAIDroneState,
  zone: Zone,
  worldState: XAIWorldState
): { breakdown: FactorBreakdown; rawScore: number } {
  const {
    survivors = [],
    obstacles = [],
    mapWidth = 600,
    mapHeight = 400,
    zoneCoverage = {},
  } = worldState;

  const cellW = mapWidth / GRID_COLS;
  const cellH = mapHeight / GRID_ROWS;
  const cx = (zone.col + 0.5) * cellW;
  const cy = (zone.row + 0.5) * cellH;

  const breakdown: FactorBreakdown = {
    coverage: 0,
    survivor: 0,
    clearance: 0,
    proximity: 0,
  };

  // Factor 1: Coverage gap (0–35 pts)
  const coverage = zoneCoverage[zone.id as ZoneId] ?? 0.3;
  const gap = 1 - Math.min(1, Math.max(0, coverage));
  breakdown.coverage = Math.round(gap * 35);

  // Factor 2: Survivor proximity (0–30 pts)
  const undiscovered = survivors.filter((s) => !s.discovered);
  if (undiscovered.length > 0) {
    const closestDist = Math.min(
      ...undiscovered.map((s) => Math.hypot(s.x - cx, s.y - cy))
    );
    breakdown.survivor =
      closestDist < 200 ? Math.round((1 - closestDist / 200) * 30) : 0;
  }

  // Factor 3: Obstacle clearance (0–15 pts)
  const nearObstacles = obstacles.filter(
    (o) => Math.hypot(o.x - cx, o.y - cy) < 110
  );
  const obsPenalty = nearObstacles.reduce(
    (sum, o) => sum + ((o.severity ?? 1) * 3),
    0
  );
  breakdown.clearance = Math.max(0, 15 - obsPenalty);

  // Factor 4: Drone travel cost (0–20 pts)
  const droneDist = Math.hypot(drone.x - cx, drone.y - cy);
  const batteryBias = drone.battery < 35 ? 0.75 : drone.battery < 50 ? 0.9 : 1;
  breakdown.proximity = Math.round(
    Math.max(0, 20 - (droneDist / mapWidth) * 28) * batteryBias
  );

  const rawScore =
    breakdown.coverage +
    breakdown.survivor +
    breakdown.clearance +
    breakdown.proximity;

  return { breakdown, rawScore };
}

/**
 * Generate contextual reasoning text (brief bullets)
 */
function generateReasons(
  drone: XAIDroneState,
  topZone: ZoneScore,
  zoneCoverage: Partial<Record<ZoneId, number>>,
  survivors: Array<{ x: number; y: number; discovered: boolean }>
): string[] {
  const reasons: string[] = [];
  const distance = Math.hypot(drone.x - topZone.cx, drone.y - topZone.cy);
  const speed = drone.speed ?? 12;
  const eta = speed > 0 ? Math.round(distance / speed) : null;
  const signalStatus =
    drone.signal < 45 ? 'weak' : drone.signal < 70 ? 'moderate' : 'strong';

  if (drone.battery < 25) {
    reasons.push('CRITICAL BATTERY — RTB override');
    reasons.push(`${topZone.label} sector is nearest safe zone`);
  } else {
    const pct = Math.round((1 - (zoneCoverage[topZone.id as ZoneId] ?? 0.5)) * 100);

    if (topZone.breakdown.coverage > 16) {
      reasons.push(`${pct}% area unexplored`);
    }

    if (topZone.breakdown.survivor > 12) {
      const undiscovered = survivors.filter((s) => !s.discovered);
      if (undiscovered.length > 0) {
        reasons.push(
          `${undiscovered.length} undiscovered target${undiscovered.length > 1 ? 's' : ''} in range`
        );
      } else {
        reasons.push('thermal anomaly detected');
      }
    }

    if (topZone.breakdown.clearance > 10) {
      reasons.push('low obstacle density');
    }

    if (drone.battery < 45) {
      reasons.push('efficiency routing active');
    }

    if (reasons.length === 0) {
      reasons.push(`optimal gap in ${topZone.label} sector`);
    }
  }

  reasons.push(
    `Distance to ${topZone.label}: ${Math.round(distance)}m${eta !== null ? ` · ETA ${eta}s` : ''}`
  );
  reasons.push(
    `Battery ${Math.round(drone.battery)}% · Signal ${Math.round(drone.signal)}% (${signalStatus})`
  );
  if (drone.task) {
    reasons.push(`Task ${drone.task.toUpperCase()} · Holding course`);
  }

  return reasons;
}

/**
 * Generate detailed narrative reasoning explaining the decision
 */
function generateDetailedReasoning(
  drone: XAIDroneState,
  topZone: ZoneScore,
  allZones: ZoneScore[],
  zoneCoverage: Partial<Record<ZoneId, number>>,
  survivors: Array<{ x: number; y: number; discovered: boolean }>
): string {
  const distance = Math.hypot(drone.x - topZone.cx, drone.y - topZone.cy);
  const speed = drone.speed ?? 12;
  const eta = speed > 0 ? Math.round(distance / speed) : null;
  const coverage = zoneCoverage[topZone.id as ZoneId] ?? 0.5;
  const unexploredPct = Math.round((1 - coverage) * 100);
  const undiscovered = survivors.filter((s) => !s.discovered);
  const secondRankedZone = allZones[1];

  let narrative = '';

  if (drone.battery < 25) {
    narrative = `EMERGENCY PROTOCOL ACTIVATED: Battery critical at ${Math.round(drone.battery)}%. ${drone.id} must return to base (${topZone.label}) immediately to prevent mission loss. All zone assignments overridden to prioritize RTB safety. Estimated time to base: ${eta !== null ? `${eta}s` : 'calculating'}`;
  } else if (drone.battery < 45) {
    narrative = `${drone.id} is operating in efficiency mode with ${Math.round(drone.battery)}% battery. Assigned to ${topZone.label} sector (${unexploredPct}% unexplored) as optimal balance between coverage gains and safe return margin. If battery drops below 25%, RTB override will activate. Signal strength is ${Math.round(drone.signal)}% (${drone.signal < 45 ? 'degraded' : drone.signal < 70 ? 'nominal' : 'excellent'}).`;
  } else {
    narrative = `${drone.id} is assigned to ${topZone.label} sector. `;

    if (topZone.breakdown.coverage > 16) {
      narrative += `This zone has ${unexploredPct}% of its coverage area still unexplored, making it a high-priority sector for continued systematic scan operations. `;
    }

    if (topZone.breakdown.survivor > 12 && undiscovered.length > 0) {
      narrative += `Thermal analysis detected ${undiscovered.length} undiscovered target${undiscovered.length > 1 ? 's' : ''} in this sector, indicating significant survivor concentration requiring immediate investigation. `;
    } else if (topZone.breakdown.survivor > 12) {
      narrative += `Thermal anomalies have been detected in this zone, suggesting potential survivor activity requiring close examination. `;
    }

    if (topZone.breakdown.clearance > 10) {
      narrative += `Obstacle density is low in this sector, allowing efficient high-speed navigation and comprehensive coverage scanning. `;
    }

    narrative += `The ${topZone.label} assignment provides a ${Math.round(topZone.score)} point tactical advantage over the next priority, ${secondRankedZone?.label || 'secondary'} (${Math.round(secondRankedZone?.score || 0)} pts). `;
    narrative += `At current speed of ${Math.round(speed)} m/s, ${drone.id} will reach the sector center in approximately ${eta !== null ? `${eta} seconds` : 'unknown time'}. Battery is at ${Math.round(drone.battery)}% with ${Math.round(drone.signal)}% signal strength.`;
  }

  return narrative;
}

/**
 * Derive full XAI decision for a single drone
 */
export function deriveXAI(
  drone: XAIDroneState,
  worldState: XAIWorldState
): XAIDecision {
  const { tick = 0, zoneCoverage = {}, survivors = [] } = worldState;
  const droneIdNumeric =
    typeof drone.id === 'number'
      ? drone.id
      : Number.parseInt(String(drone.id).replace(/\D+/g, ''), 10) || 0;

  // Score all zones
  const zoneScores: ZoneScore[] = ZONES.map((zone) => {
    const { breakdown, rawScore } = scoreZone(drone, zone, worldState);

    // Battery emergency override
    const emergencyMult =
      drone.battery < 25 ? (zone.id === 'Z1' ? 3.0 : 0.15) : 1.0;

    // Deterministic jitter to avoid all drones converging
    const jitter =
      Math.sin(droneIdNumeric * 13.7 + zone.col * 5.3 + zone.row * 7.1) * 3.5;

    const score = Math.max(0, Math.round(rawScore * emergencyMult + jitter));

    return {
      ...zone,
      score,
      breakdown,
      cx: (zone.col + 0.5) * ((worldState.mapWidth ?? 600) / GRID_COLS),
      cy: (zone.row + 0.5) * ((worldState.mapHeight ?? 400) / GRID_ROWS),
    };
  });

  // Sort best-first
  zoneScores.sort((a, b) => b.score - a.score);

  const totalScore = zoneScores.reduce((s, z) => s + z.score, 0);
  const topScore = zoneScores[0]?.score ?? 0;
  const confidence =
    totalScore > 0 ? Math.round((topScore / totalScore) * 100) : 0;

  // Exploration/exploitation decay
  const epsilon = Math.max(0.05, 0.65 - (tick ?? 0) * 0.003);
  const epsilonPct = Math.round(epsilon * 100);
  const mode: ExplorationMode =
    epsilon > 0.35 ? 'EXPLORE' : epsilon > 0.18 ? 'BALANCED' : 'EXPLOIT';

  // Generate reasoning
  const reasons = generateReasons(
    drone,
    zoneScores[0],
    zoneCoverage,
    survivors
  );

  const detailedReasoning = generateDetailedReasoning(
    drone,
    zoneScores[0],
    zoneScores,
    zoneCoverage,
    survivors
  );

  return {
    assignedZone: zoneScores[0],
    zoneScores: zoneScores.slice(0, 5),
    allScores: zoneScores,
    confidence,
    reasons,
    detailedReasoning,
    epsilon: epsilonPct,
    mode,
    topFactors: zoneScores[0].breakdown,
  };
}

/**
 * Get all zone definitions
 */
export function getAllZones(): Zone[] {
  return [...ZONES];
}

/**
 * Get a single zone by ID
 */
export function getZoneById(id: ZoneId): Zone | undefined {
  return ZONES.find((z) => z.id === id);
}
