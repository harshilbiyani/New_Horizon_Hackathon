import { useEffect, useMemo, useRef, useState } from 'react';
import XAIDecisionPanel from '../components/XAIDecisionPanel';
import { deriveZoneCoverage } from '../xai-engine';
import type { XAIWorldState, XAIDroneState } from '../types/xai';

const WORLD_BOUNDARY = 140;
const GRID_SIZE = 40;
const DETECTION_RADIUS = 16;
const TICK_MS = 900;

const SIM_OBSTACLES = [
  { id: 'OBS-001', x: -62, y: -4, radius: 9, severity: 'high' },
  { id: 'OBS-002', x: 52, y: 34, radius: 7, severity: 'medium' },
  { id: 'OBS-003', x: -15, y: 72, radius: 6, severity: 'low' },
  { id: 'OBS-004', x: 8, y: -58, radius: 10, severity: 'high' },
  { id: 'OBS-005', x: 85, y: -36, radius: 8, severity: 'medium' },
];

const SIM_HIDDEN_SURVIVORS = [
  { id: 'HSV-001', x: -50, y: 14 },
  { id: 'HSV-002', x: 28, y: 46 },
  { id: 'HSV-003', x: 74, y: -26 },
  { id: 'HSV-004', x: -12, y: -76 },
  { id: 'HSV-005', x: 3, y: 2 },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function worldToCellCoord(value: number) {
  const normalized = (value + WORLD_BOUNDARY) / (WORLD_BOUNDARY * 2);
  return clamp(Math.floor(normalized * GRID_SIZE), 0, GRID_SIZE - 1);
}

function createSimulationDrone(index: number, x: number, y: number, heading: number) {
  return {
    id: `DRN-${String(index + 1).padStart(3, '0')}`,
    x,
    y,
    heading,
    speed: randomBetween(10, 18),
    task: 'exploring',
    battery: randomBetween(72, 100),
    signalStrength: randomBetween(75, 99),
  };
}

function createSimulationDrones() {
  return [
    createSimulationDrone(0, -40, -25, 45),
    createSimulationDrone(1, 38, -10, 120),
    createSimulationDrone(2, 18, 60, 225),
    createSimulationDrone(3, -75, 30, 310),
    createSimulationDrone(4, 0, -70, 15),
  ];
}

function updateDrone(drone: ReturnType<typeof createSimulationDrone>) {
  const headingDrift = randomBetween(-10, 10);
  drone.heading = (drone.heading + headingDrift + 360) % 360;

  if (drone.battery < 24) {
    drone.task = 'returning';
  } else if (drone.task !== 'reassigned') {
    drone.task = 'exploring';
  }

  drone.speed = clamp(drone.speed + randomBetween(-1.2, 1.2), 8, 21);
  const distanceStep = drone.speed * 0.9;
  const radians = (drone.heading * Math.PI) / 180;
  drone.x += Math.cos(radians) * distanceStep;
  drone.y += Math.sin(radians) * distanceStep;

  if (drone.x < -WORLD_BOUNDARY || drone.x > WORLD_BOUNDARY) {
    drone.heading = (180 - drone.heading + 360) % 360;
    drone.x = clamp(drone.x, -WORLD_BOUNDARY, WORLD_BOUNDARY);
  }
  if (drone.y < -WORLD_BOUNDARY || drone.y > WORLD_BOUNDARY) {
    drone.heading = (360 - drone.heading + 360) % 360;
    drone.y = clamp(drone.y, -WORLD_BOUNDARY, WORLD_BOUNDARY);
  }

  drone.battery = clamp(drone.battery - randomBetween(0.2, 0.8), 0, 100);
  drone.signalStrength = clamp(
    95 - (Math.abs(drone.x) + Math.abs(drone.y)) / 3 + randomBetween(-2.5, 2.5),
    28,
    99
  );
}

export default function XAIDecisions() {
  const [tick, setTick] = useState(0);
  const [drones, setDrones] = useState(() => createSimulationDrones());

  const dronesRef = useRef(drones);
  const scannedCellsRef = useRef(new Set<string>());
  const discoveredIdsRef = useRef(new Set<string>());

  useEffect(() => {
    dronesRef.current = drones;
  }, [drones]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      const nextDrones = dronesRef.current.map((drone) => {
        const next = { ...drone };
        updateDrone(next);

        const cellX = worldToCellCoord(next.x);
        const cellY = worldToCellCoord(next.y);
        scannedCellsRef.current.add(`${cellX}:${cellY}`);

        for (const survivor of SIM_HIDDEN_SURVIVORS) {
          if (discoveredIdsRef.current.has(survivor.id)) continue;
          const dx = next.x - survivor.x;
          const dy = next.y - survivor.y;
          if (Math.hypot(dx, dy) <= DETECTION_RADIUS) {
            discoveredIdsRef.current.add(survivor.id);
          }
        }

        return next;
      });

      setDrones(nextDrones);
      setTick((prev) => prev + 1);
    }, TICK_MS);

    return () => window.clearInterval(interval);
  }, []);

  const zoneCoverage = useMemo(
    () => deriveZoneCoverage(scannedCellsRef.current, GRID_SIZE),
    [tick]
  );

  const mapSize = WORLD_BOUNDARY * 2;

  const worldState: XAIWorldState = useMemo(() => {
    return {
      mapWidth: mapSize,
      mapHeight: mapSize,
      tick,
      zoneCoverage,
      survivors: SIM_HIDDEN_SURVIVORS.map((s) => ({
        x: s.x + WORLD_BOUNDARY,
        y: s.y + WORLD_BOUNDARY,
        discovered: discoveredIdsRef.current.has(s.id),
      })),
      obstacles: SIM_OBSTACLES.map((o) => ({
        x: o.x + WORLD_BOUNDARY,
        y: o.y + WORLD_BOUNDARY,
        severity: o.severity === 'high' ? 3 : o.severity === 'medium' ? 2 : 1,
      })),
    };
  }, [tick, zoneCoverage, mapSize]);

  const droneStates: XAIDroneState[] = useMemo(
    () =>
      drones.map((d) => {
        const status =
          d.battery < 25
            ? 'LOW BAT'
            : d.task === 'returning'
              ? 'RETURNING'
              : 'SEARCHING';
        return {
          id: d.id,
          x: d.x + WORLD_BOUNDARY,
          y: d.y + WORLD_BOUNDARY,
          battery: Math.round(d.battery),
          signal: Math.round(d.signalStrength),
          speed: Math.round(d.speed),
          heading: Math.round(d.heading),
          status,
          task: d.task,
        };
      }),
    [drones]
  );

  return <XAIDecisionPanel droneStates={droneStates} worldState={worldState} />;
}
