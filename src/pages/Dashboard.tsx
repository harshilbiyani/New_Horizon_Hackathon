import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import StatsPanel from '../components/StatsPanel';
import DroneGrid from '../components/DroneGrid';
import SurvivorFeed from '../components/SurvivorFeed';
import EventLogs from '../components/EventLogs';
import LiveVideo from '../components/LiveVideo';
import ChartsPanel from '../components/ChartsPanel';
import MissionMap from '../components/MissionMap';
import type {
  Alert,
  Drone,
  HiddenSurvivor,
  MissionData,
  Obstacle,
  Survivor,
  TelemetrySnapshot,
} from '../types/telemetry';

type PanelMode = 'simulation' | 'live';

const EMPTY_MISSION_DATA: MissionData = {
  coverage: 0,
  scannedCells: 0,
  totalCells: 0,
  activeDrones: 0,
  failedDrones: 0,
  avgBattery: 0,
  avgSignal: 0,
  foundSurvivors: 0,
  missionTimeSec: 0,
};

const SIM_WORLD_BOUNDARY = 140;
const SIM_GRID_SIZE = 40;
const SIM_TOTAL_CELLS = SIM_GRID_SIZE * SIM_GRID_SIZE;
const SIM_DETECTION_RADIUS = 16;

const SIM_OBSTACLES: Obstacle[] = [
  { id: 'OBS-001', x: -62, y: -4, radius: 9, severity: 'high' },
  { id: 'OBS-002', x: 52, y: 34, radius: 7, severity: 'medium' },
  { id: 'OBS-003', x: -15, y: 72, radius: 6, severity: 'low' },
  { id: 'OBS-004', x: 8, y: -58, radius: 10, severity: 'high' },
  { id: 'OBS-005', x: 85, y: -36, radius: 8, severity: 'medium' },
];

const SIM_HIDDEN_SURVIVORS: HiddenSurvivor[] = [
  { id: 'HSV-001', x: -50, y: 14, severity: 'critical' },
  { id: 'HSV-002', x: 28, y: 46, severity: 'stable' },
  { id: 'HSV-003', x: 74, y: -26, severity: 'critical' },
  { id: 'HSV-004', x: -12, y: -76, severity: 'stable' },
  { id: 'HSV-005', x: 3, y: 2, severity: 'unknown' },
];

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function randomBetween(min: number, max: number) {
  return min + Math.random() * (max - min);
}

function worldToCellCoord(value: number) {
  const normalized = (value + SIM_WORLD_BOUNDARY) / (SIM_WORLD_BOUNDARY * 2);
  return clamp(Math.floor(normalized * SIM_GRID_SIZE), 0, SIM_GRID_SIZE - 1);
}

function createSimulationDrone(index: number, x: number, y: number, heading: number): Drone {
  return {
    id: `DRN-${String(index + 1).padStart(3, '0')}`,
    x,
    y,
    z: randomBetween(80, 130),
    heading,
    speed: randomBetween(10, 18),
    task: 'exploring',
    status: 'active',
    battery: randomBetween(72, 100),
    signalStrength: randomBetween(75, 99),
    distanceTraveled: 0,
    lastSeen: new Date().toISOString(),
    trail: [{ x, y }],
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

function cloneDrones(drones: Drone[]) {
  return drones.map((drone) => ({
    ...drone,
    trail: drone.trail.map((point) => ({ ...point })),
  }));
}

export default function Dashboard() {
  const [mode, setMode] = useState<PanelMode>('simulation');
  const [missionData, setMissionData] = useState<MissionData>(EMPTY_MISSION_DATA);
  const [drones, setDrones] = useState<Drone[]>([]);
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [hiddenSurvivors, setHiddenSurvivors] = useState<HiddenSurvivor[]>([]);
  const [coverageHistory, setCoverageHistory] = useState<{ time: string; coverage: number }[]>([]);
  const [batteryHistory, setBatteryHistory] = useState<{ time: string; battery: number }[]>([]);
  const [connectionState, setConnectionState] = useState<'connected' | 'disconnected'>('disconnected');
  const [lastSnapshotAt, setLastSnapshotAt] = useState<string | null>(null);
  const [selectedDroneId, setSelectedDroneId] = useState<string>();

  useEffect(() => {
    setCoverageHistory([]);
    setBatteryHistory([]);
    setLastSnapshotAt(null);

    if (mode === 'simulation') {
      setConnectionState('connected');
      setObstacles(SIM_OBSTACLES);
      setHiddenSurvivors(SIM_HIDDEN_SURVIVORS);

      const detectedSurvivorIds = new Set<string>();
      const scannedCells = new Set<string>();
      const simulationStartedAt = Date.now();
      const simulationDrones = createSimulationDrones();
      const simulationSurvivors: Survivor[] = [];
      const simulationAlerts: Alert[] = [
        {
          id: `INFO-${Date.now()}-SIM`,
          type: 'info',
          message: 'Simulation mode active. Local telemetry is running.',
          timestamp: new Date().toISOString(),
        },
      ];

      const pushAlert = (type: Alert['type'], message: string) => {
        simulationAlerts.unshift({
          id: `${type.toUpperCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          type,
          message,
          timestamp: new Date().toISOString(),
        });
        if (simulationAlerts.length > 250) {
          simulationAlerts.length = 250;
        }
      };

      const tick = () => {
        for (const drone of simulationDrones) {
          if (drone.status === 'failed') {
            continue;
          }

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
          const previousX = drone.x;
          const previousY = drone.y;
          drone.x += Math.cos(radians) * distanceStep;
          drone.y += Math.sin(radians) * distanceStep;

          if (drone.x < -SIM_WORLD_BOUNDARY || drone.x > SIM_WORLD_BOUNDARY) {
            drone.heading = (180 - drone.heading + 360) % 360;
            drone.x = clamp(drone.x, -SIM_WORLD_BOUNDARY, SIM_WORLD_BOUNDARY);
          }
          if (drone.y < -SIM_WORLD_BOUNDARY || drone.y > SIM_WORLD_BOUNDARY) {
            drone.heading = (360 - drone.heading + 360) % 360;
            drone.y = clamp(drone.y, -SIM_WORLD_BOUNDARY, SIM_WORLD_BOUNDARY);
          }

          const actualDx = drone.x - previousX;
          const actualDy = drone.y - previousY;
          const actualDistance = Math.sqrt(actualDx * actualDx + actualDy * actualDy);
          drone.distanceTraveled += actualDistance;

          drone.z = clamp(drone.z + randomBetween(-3, 3), 65, 145);
          drone.battery = clamp(drone.battery - randomBetween(0.2, 0.8), 0, 100);
          drone.signalStrength = clamp(
            95 - (Math.abs(drone.x) + Math.abs(drone.y)) / 3 + randomBetween(-2.5, 2.5),
            28,
            99
          );

          if (drone.battery <= 1 && drone.status === 'active') {
            drone.status = 'failed';
            drone.task = 'idle';
            pushAlert('warning', `${drone.id} battery depleted. Drone marked as failed.`);
          }

          if (drone.status === 'active') {
            const cellX = worldToCellCoord(drone.x);
            const cellY = worldToCellCoord(drone.y);
            scannedCells.add(`${cellX}:${cellY}`);
          }

          drone.trail.push({ x: drone.x, y: drone.y });
          if (drone.trail.length > 40) {
            drone.trail.shift();
          }
          drone.lastSeen = new Date().toISOString();
        }

        for (const hidden of SIM_HIDDEN_SURVIVORS) {
          if (detectedSurvivorIds.has(hidden.id)) {
            continue;
          }

          let closestDrone: Drone | undefined;
          let minDistance = Number.POSITIVE_INFINITY;
          for (const drone of simulationDrones) {
            if (drone.status !== 'active') {
              continue;
            }
            const dx = drone.x - hidden.x;
            const dy = drone.y - hidden.y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            if (distance < minDistance) {
              minDistance = distance;
              closestDrone = drone;
            }
          }

          if (closestDrone && minDistance <= SIM_DETECTION_RADIUS) {
            detectedSurvivorIds.add(hidden.id);
            const detection: Survivor = {
              id: `SURV-${Math.floor(Math.random() * 100000)}`,
              sourceId: hidden.id,
              x: hidden.x,
              y: hidden.y,
              timestamp: new Date().toISOString(),
              confidence: clamp(0.7 + Math.random() * 0.29, 0, 0.99),
              droneId: closestDrone.id,
            };
            simulationSurvivors.unshift(detection);
            if (simulationSurvivors.length > 120) {
              simulationSurvivors.length = 120;
            }
            pushAlert(
              'critical',
              `Survivor detected by ${closestDrone.id} at [${hidden.x.toFixed(1)}, ${hidden.y.toFixed(1)}].`
            );
          }
        }

        if (Math.random() < 0.08) {
          pushAlert('info', 'Sector update complete. Adaptive reassignment initiated.');
        }

        const activeDrones = simulationDrones.filter((drone) => drone.status === 'active').length;
        const failedDrones = simulationDrones.length - activeDrones;
        const avgBattery =
          simulationDrones.reduce((sum, drone) => sum + drone.battery, 0) / simulationDrones.length;
        const avgSignal =
          simulationDrones.reduce((sum, drone) => sum + drone.signalStrength, 0) / simulationDrones.length;
        const nowIso = new Date().toISOString();
        const elapsedMs = Date.now() - simulationStartedAt;
        const missionSnapshot: MissionData = {
          coverage: Math.round((scannedCells.size / SIM_TOTAL_CELLS) * 100),
          scannedCells: scannedCells.size,
          totalCells: SIM_TOTAL_CELLS,
          activeDrones,
          failedDrones,
          avgBattery: Number(avgBattery.toFixed(1)),
          avgSignal: Number(avgSignal.toFixed(1)),
          foundSurvivors: simulationSurvivors.length,
          missionTimeSec: Math.floor(elapsedMs / 1000),
        };

        setMissionData(missionSnapshot);
        setDrones(cloneDrones(simulationDrones));
        setSurvivors([...simulationSurvivors]);
        setAlerts([...simulationAlerts]);
        setLastSnapshotAt(nowIso);

        const timeKey = new Date(nowIso).toLocaleTimeString('en-US', {
          hour12: false,
          minute: '2-digit',
          second: '2-digit',
        });

        setCoverageHistory((previous) => {
          const updated = [...previous, { time: timeKey, coverage: missionSnapshot.coverage }];
          if (updated.length > 40) {
            updated.shift();
          }
          return updated;
        });

        setBatteryHistory((previous) => {
          const updated = [...previous, { time: timeKey, battery: missionSnapshot.avgBattery }];
          if (updated.length > 40) {
            updated.shift();
          }
          return updated;
        });

        setSelectedDroneId((current) => {
          if (current && simulationDrones.some((drone) => drone.id === current)) {
            return current;
          }
          return simulationDrones[0]?.id;
        });
      };

      tick();
      const simulationTimer = window.setInterval(tick, 900);
      return () => {
        window.clearInterval(simulationTimer);
      };
    }

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

    socket.on('connect_error', () => {
      setConnectionState('disconnected');
    });

    socket.on('telemetrySnapshot', (snapshot: TelemetrySnapshot) => {
      setMissionData(snapshot.missionData);
      setDrones(snapshot.drones);
      setSurvivors(snapshot.foundSurvivors);
      setAlerts(snapshot.alerts);
      setObstacles(snapshot.obstacles);
      setHiddenSurvivors(snapshot.hiddenSurvivors);
      setLastSnapshotAt(snapshot.timestamp);

      const timeKey = new Date(snapshot.timestamp).toLocaleTimeString('en-US', {
        hour12: false,
        minute: '2-digit',
        second: '2-digit',
      });

      setCoverageHistory((previous) => {
        const updated = [...previous, { time: timeKey, coverage: snapshot.missionData.coverage }];
        if (updated.length > 40) {
          updated.shift();
        }
        return updated;
      });

      setBatteryHistory((previous) => {
        const updated = [...previous, { time: timeKey, battery: snapshot.missionData.avgBattery }];
        if (updated.length > 40) {
          updated.shift();
        }
        return updated;
      });

      setSelectedDroneId((current) => {
        if (current && snapshot.drones.some((drone) => drone.id === current)) {
          return current;
        }
        return snapshot.drones[0]?.id;
      });
    });

    // Fallback handlers for partial streams.
    socket.on('missionData', (data: Partial<MissionData>) => {
      setMissionData((previous) => ({ ...previous, ...data }));
    });

    socket.on('drones', (data: Drone[]) => {
      setDrones(data);
      setSelectedDroneId((current) => {
        if (current && data.some((drone) => drone.id === current)) {
          return current;
        }
        return data[0]?.id;
      });
    });

    socket.on('survivorFound', (survivor: Survivor) => {
      setSurvivors((previous) => [survivor, ...previous].slice(0, 120));
    });

    socket.on('alert', (alert: Alert) => {
      setAlerts((previous) => [alert, ...previous].slice(0, 250));
    });

    return () => {
      socket.disconnect();
    };
  }, [mode]);

  const selectedDrone = useMemo(
    () => drones.find((drone) => drone.id === selectedDroneId),
    [drones, selectedDroneId]
  );

  const lastUpdateLabel = lastSnapshotAt
    ? new Date(lastSnapshotAt).toLocaleTimeString()
    : 'Awaiting snapshot';

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#000814] text-white p-6 font-sans">
      <header className="mb-6 border-b border-white/10 pb-4 flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-2xl font-bold tracking-widest text-[#00ffcc]">
          SWARM COMMAND <span className="text-sm font-normal text-gray-400">v2.0</span>
        </h1>
        <div className="flex items-center gap-4 text-xs uppercase tracking-wider flex-wrap justify-end">
          <label className="flex items-center gap-2 text-gray-400">
            Mode
            <select
              value={mode}
              onChange={(event) => setMode(event.target.value as PanelMode)}
              className="bg-[#081425] border border-white/10 text-gray-200 text-xs rounded-md px-2 py-1 uppercase tracking-wide"
            >
              <option value="simulation">Simulation</option>
              <option value="live">Live Socket</option>
            </select>
          </label>
          <span className={`flex items-center gap-2 ${connectionState === 'connected' ? 'text-green-400' : 'text-red-400'}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${connectionState === 'connected' ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></span>
            {connectionState}
          </span>
          <span className="text-gray-400">Last Update: {lastUpdateLabel}</span>
          <span className="text-gray-400">Selected: {selectedDrone?.id ?? 'None'}</span>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-[2fr_1.1fr] gap-6">
        <div className="flex flex-col gap-6">
          <StatsPanel
            dronesCount={missionData.activeDrones || drones.filter((drone) => drone.status === 'active').length}
            coverage={missionData.coverage}
            survivorsCount={missionData.foundSurvivors || survivors.length}
            scannedCells={missionData.scannedCells}
            avgBattery={missionData.avgBattery}
            avgSignal={missionData.avgSignal}
            missionTimeSec={missionData.missionTimeSec}
          />

          <div className="grid grid-cols-1 xl:grid-cols-[2.3fr_1fr] gap-6 h-[420px]">
            <div className="h-full flex flex-col gap-3">
              <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-lg px-3 py-2 flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-gray-400">Live View Drone</span>
                <select
                  value={selectedDroneId ?? ''}
                  onChange={(event) => setSelectedDroneId(event.target.value)}
                  disabled={drones.length === 0}
                  className="bg-[#081425] border border-white/10 text-gray-200 text-xs rounded-md px-2 py-1 min-w-[140px]"
                >
                  {drones.map((drone) => (
                    <option key={drone.id} value={drone.id}>
                      {drone.id.replace('DRN-', 'Drone ')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <LiveVideo selectedDrone={selectedDrone} connectionState={connectionState} />
              </div>
            </div>
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5 overflow-hidden flex flex-col h-full">
              <h2 className="text-lg font-semibold mb-4 text-[#ff4a1c]">Live Detections</h2>
              <SurvivorFeed survivors={survivors} />
            </div>
          </div>

          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5 flex flex-col overflow-hidden min-h-[300px]">
            <h2 className="text-lg font-semibold mb-4 text-gray-300">Active Swarm Telemetry</h2>
            <DroneGrid
              drones={drones}
              selectedDroneId={selectedDroneId}
              onSelectDrone={setSelectedDroneId}
            />
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <div className="h-[310px]">
            <ChartsPanel historyData={coverageHistory} batteryHistory={batteryHistory} drones={drones} />
          </div>

          <div className="h-[360px]">
            <MissionMap
              drones={drones}
              obstacles={obstacles}
              foundSurvivors={survivors}
              hiddenSurvivors={hiddenSurvivors}
              selectedDroneId={selectedDroneId}
              onSelectDrone={setSelectedDroneId}
            />
          </div>

          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5 overflow-hidden flex flex-col min-h-[320px]">
            <h2 className="text-lg font-semibold mb-4 text-gray-300">System Logs</h2>
            <EventLogs alerts={alerts} />
          </div>
        </div>
      </div>
    </div>
  );
}
