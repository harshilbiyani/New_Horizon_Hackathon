import { useEffect, useMemo, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import XAIDecisionPanel from '../components/XAIDecisionPanel';
import { deriveZoneCoverage } from '../xai-engine';
import type { XAIWorldState, XAIDroneState } from '../types/xai';
import type { TelemetrySnapshot, Drone, Obstacle, HiddenSurvivor, Survivor } from '../types/telemetry';
import { useSimConfig } from '../context/ConfigContext';

export default function XAIDecisions() {
  const config = useSimConfig();
  const WORLD_BOUNDARY = config.WORLD_BOUNDARY || 350;
  const GRID_SIZE = config.GRID_SIZE || 40;

  const [drones, setDrones] = useState<Drone[]>([]);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [hiddenSurvivors, setHiddenSurvivors] = useState<HiddenSurvivor[]>([]);
  const [foundSurvivors, setFoundSurvivors] = useState<Survivor[]>([]);
  const [tick, setTick] = useState(0);
  const [connectionState, setConnectionState] = useState<'connected' | 'disconnected'>('disconnected');

  const scannedCellsRef = useRef(new Set<string>());

  useEffect(() => {
    const socket = io('http://localhost:3001', {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 500,
      reconnectionAttempts: Infinity,
    });

    socket.on('connect', () => {
      setConnectionState('connected');
    });

    socket.on('disconnect', () => {
      setConnectionState('disconnected');
    });

    socket.on('telemetrySnapshot', (snapshot: TelemetrySnapshot) => {
      setDrones(snapshot.drones || []);
      setObstacles(snapshot.obstacles || []);
      setHiddenSurvivors(snapshot.hiddenSurvivors || []);
      setFoundSurvivors(snapshot.foundSurvivors || []);

      // Accumulate scanned cells for zone coverage calculation
      (snapshot.drones || []).forEach((drone) => {
        if (drone.status === 'active') {
          const normX = (drone.x + WORLD_BOUNDARY) / (WORLD_BOUNDARY * 2);
          const normY = (drone.y + WORLD_BOUNDARY) / (WORLD_BOUNDARY * 2);
          const cx = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(normX * GRID_SIZE)));
          const cy = Math.min(GRID_SIZE - 1, Math.max(0, Math.floor(normY * GRID_SIZE)));
          scannedCellsRef.current.add(`${cx}:${cy}`);
        }
      });

      setTick((t) => t + 1);
    });

    return () => {
      socket.disconnect();
    };
  }, [WORLD_BOUNDARY, GRID_SIZE]);

  const zoneCoverage = useMemo(
    () => deriveZoneCoverage(scannedCellsRef.current, GRID_SIZE),
    [tick, GRID_SIZE]
  );

  const mapSize = WORLD_BOUNDARY * 2;

  const worldState: XAIWorldState = useMemo(() => {
    const foundIds = new Set(foundSurvivors.map((s) => s.sourceId || s.id));
    return {
      mapWidth: mapSize,
      mapHeight: mapSize,
      tick,
      zoneCoverage,
      survivors: hiddenSurvivors.map((s) => ({
        x: s.x + WORLD_BOUNDARY,
        y: s.y + WORLD_BOUNDARY,
        discovered: foundIds.has(s.id),
      })),
      obstacles: obstacles.map((o) => ({
        x: o.x + WORLD_BOUNDARY,
        y: o.y + WORLD_BOUNDARY,
        severity: o.severity === 'high' ? 3 : o.severity === 'medium' ? 2 : 1,
      })),
    };
  }, [tick, zoneCoverage, mapSize, hiddenSurvivors, foundSurvivors, obstacles, WORLD_BOUNDARY]);

  const droneStates: XAIDroneState[] = useMemo(
    () =>
      drones.map((d) => {
        const status =
          d.status === 'failed'
            ? 'FAILED'
            : d.battery < 25
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
    [drones, WORLD_BOUNDARY]
  );

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#000814] text-white p-6 font-sans">
      <header className="mb-6 border-b border-white/10 pb-4 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold tracking-widest text-[#00ffcc]">
            XAI DECISION MATRIX <span className="text-sm font-normal text-gray-400">v2.0</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Explainable AI evaluation engine — evaluating live backend telemetry in real time.
          </p>
        </div>
        <span className={`flex items-center gap-2 text-xs uppercase tracking-wider ${connectionState === 'connected' ? 'text-green-400' : 'text-red-400'}`}>
          <span className={`w-2.5 h-2.5 rounded-full ${connectionState === 'connected' ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></span>
          Live Stream: {connectionState}
        </span>
      </header>

      {drones.length === 0 ? (
        <div className="text-center py-16 text-gray-500 border border-dashed border-white/10 rounded-xl">
          Awaiting live drone telemetry stream... Launch a mission from the Admin Panel to start telemetry.
        </div>
      ) : (
        <XAIDecisionPanel worldState={worldState} droneStates={droneStates} />
      )}
    </div>
  );
}
