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
} from '../types/xai';

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
  gridSize: number,
  worldBoundary: number
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

  const coverage: Record<ZoneId, number> = {};
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

  // Factor 1: Coverage gap (0–40 pts)
  const coverage = zoneCoverage[zone.id as ZoneId] ?? 0.3;
  const gap = 1 - Math.min(1, Math.max(0, coverage));
  breakdown.coverage = Math.round(gap * 40);

  // Factor 2: Survivor proximity (0–35 pts)
  const undiscovered = survivors.filter((s) => !s.discovered);
  if (undiscovered.length > 0) {
    const closestDist = Math.min(
      ...undiscovered.map((s) => Math.hypot(s.x - cx, s.y - cy))
    );
    breakdown.survivor =
      closestDist < 200 ? Math.round((1 - closestDist / 200) * 35) : 0;
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

  // Factor 4: Drone travel cost (0–10 pts)
  const droneDist = Math.hypot(drone.x - cx, drone.y - cy);
  breakdown.proximity = Math.round(Math.max(0, 10 - (droneDist / mapWidth) * 14));

  const rawScore =
    breakdown.coverage +
    breakdown.survivor +
    breakdown.clearance +
    breakdown.proximity;

  return { breakdown, rawScore };
}

/**
 * Generate contextual reasoning text
 */
function generateReasons(
  drone: XAIDroneState,
  topZone: ZoneScore,
  zoneCoverage: Record<ZoneId, number>,
  survivors: Array<{ x: number; y: number; discovered: boolean }>
): string[] {
  const reasons: string[] = [];

  if (drone.battery < 25) {
    reasons.push('CRITICAL BATTERY — RTB override');
    reasons.push(`${topZone.label} sector is nearest base`);
  } else {
    const pct = Math.round((1 - (zoneCoverage[topZone.id as ZoneId] ?? 0.5)) * 100);

    if (topZone.breakdown.coverage > 20) {
      reasons.push(`${pct}% area unexplored`);
    }

    if (topZone.breakdown.survivor > 15) {
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

  return reasons;
}

/**
 * Derive full XAI decision for a single drone
 */
export function deriveXAI(
  drone: XAIDroneState,
  worldState: XAIWorldState
): XAIDecision {
  const { tick = 0, zoneCoverage = {}, survivors = [] } = worldState;

  // Score all zones
  const zoneScores: ZoneScore[] = ZONES.map((zone) => {
    const { breakdown, rawScore } = scoreZone(drone, zone, worldState);

    // Battery emergency override
    const emergencyMult =
      drone.battery < 25 ? (zone.id === 'Z1' ? 3.0 : 0.15) : 1.0;

    // Deterministic jitter to avoid all drones converging
    const jitter =
      Math.sin((drone.id as any) * 13.7 + zone.col * 5.3 + zone.row * 7.1) *
      3.5;

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

  return {
    assignedZone: zoneScores[0],
    zoneScores: zoneScores.slice(0, 5),
    allScores: zoneScores,
    confidence,
    reasons,
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
