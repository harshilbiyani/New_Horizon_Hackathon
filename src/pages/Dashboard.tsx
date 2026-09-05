import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import StatsPanel from '../components/StatsPanel';
import DroneGrid from '../components/DroneGrid';
import SurvivorFeed from '../components/SurvivorFeed';
import EventLogs from '../components/EventLogs';
import LiveVideo from '../components/LiveVideo';
import ChartsPanel from '../components/ChartsPanel';
import MissionMap from '../components/MissionMap';
import Map2D from '../components/Map2D';
import AdminPanel from '../components/AdminPanel';
import type {
  Alert,
  Drone,
  HiddenSurvivor,
  MissionData,
  MeshLink,
  Obstacle,
  Survivor,
  TelemetrySnapshot,
} from '../types/telemetry';

const EMPTY_MISSION_DATA: MissionData = {
  coverage: 0,
  scannedCells: [],
  totalCells: 0,
  activeDrones: 0,
  failedDrones: 0,
  avgBattery: 0,
  avgSignal: 0,
  foundSurvivors: 0,
  missionTimeSec: 0,
};

export default function Dashboard() {
  const [missionData, setMissionData] = useState<MissionData>(EMPTY_MISSION_DATA);
  const [drones, setDrones] = useState<Drone[]>([]);
  const [sitlDrones, setSitlDrones] = useState<any[]>([]);
  const [activeMap, setActiveMap] = useState<'3d'|'2d'>('3d');
  const [survivors, setSurvivors] = useState<Survivor[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [obstacles, setObstacles] = useState<Obstacle[]>([]);
  const [hiddenSurvivors, setHiddenSurvivors] = useState<HiddenSurvivor[]>([]);
  const [meshLinks, setMeshLinks] = useState<MeshLink[]>([]);
  const [coverageHistory, setCoverageHistory] = useState<{ time: string; coverage: number }[]>([]);
  const [batteryHistory, setBatteryHistory] = useState<{ time: string; battery: number }[]>([]);
  const [connectionState, setConnectionState] = useState<'connected' | 'disconnected'>('disconnected');
  const [lastSnapshotAt, setLastSnapshotAt] = useState<string | null>(null);
  const [selectedDroneId, setSelectedDroneId] = useState<string>();

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
      setMeshLinks(snapshot.meshLinks ?? []);
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
        if (current && snapshot.drones.some((drone: Drone) => drone.id === current)) {
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

    socket.on('sitlSnapshot', (data: any[]) => {
      setSitlDrones(data);
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const selectedDrone = useMemo(
    () => drones.find((drone) => drone.id === selectedDroneId),
    [drones, selectedDroneId]
  );

  const lastUpdateLabel = lastSnapshotAt
    ? new Date(lastSnapshotAt).toLocaleTimeString()
    : 'Awaiting snapshot';

  const scannedCellKeys = Array.isArray(missionData.scannedCells) ? missionData.scannedCells : [];
  const scannedCount = Array.isArray(missionData.scannedCells)
    ? missionData.scannedCells.length
    : (missionData.scannedCells || 0);

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#000814] text-white p-6 font-sans">
      <header className="mb-6 border-b border-white/10 pb-4 flex flex-wrap justify-between items-center gap-3">
        <h1 className="text-2xl font-bold tracking-widest text-[#00ffcc]">
          SWARM COMMAND <span className="text-sm font-normal text-gray-400">v2.0</span>
        </h1>
        <div className="flex items-center gap-4 text-xs uppercase tracking-wider flex-wrap justify-end">
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
            scannedCells={scannedCount}
            avgBattery={missionData.avgBattery}
            avgSignal={missionData.avgSignal}
            missionTimeSec={missionData.missionTimeSec}
          />

          <div className="grid grid-cols-1 xl:grid-cols-[2.3fr_1fr] gap-6 h-[420px]">
            <LiveVideo
                selectedDrone={selectedDrone}
                connectionState={connectionState}
                drones={drones}
                onSelectDrone={setSelectedDroneId}
              />
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

          
          <div className="h-[430px] flex flex-col">
            <div className="flex items-center justify-between gap-4 mb-2">
              <div className="flex gap-3">
                <button 
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${activeMap === '3d' ? 'bg-[#00ff00] text-black shadow-[0_0_10px_rgba(0,255,0,0.5)]' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
                  onClick={() => setActiveMap('3d')}
                >
                  3D Tactical Swarm Map
                </button>
                <button 
                  className={`px-4 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${activeMap === '2d' ? 'bg-[#00ff00] text-black shadow-[0_0_10px_rgba(0,255,0,0.5)]' : 'bg-white/10 text-gray-300 hover:bg-white/20'}`}
                  onClick={() => setActiveMap('2d')}
                >
                  2D Map (ArduPilot Sectors)
                </button>
              </div>
            </div>
            <div className="flex-1 relative bg-white/5 border border-white/10 rounded-xl overflow-hidden shadow-2xl">
              {activeMap === '3d' ? (
                <MissionMap
                  drones={drones}
                  obstacles={obstacles}
                  foundSurvivors={survivors}
                  hiddenSurvivors={hiddenSurvivors}
                  meshLinks={meshLinks}
                  scannedCells={scannedCellKeys}
                  selectedDroneId={selectedDroneId}
                  onSelectDrone={setSelectedDroneId}
                />
              ) : (
                <Map2D sitlDrones={sitlDrones} />
              )}
            </div>
          </div>

          <AdminPanel />

          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5 overflow-hidden flex flex-col min-h-[320px]">
            <h2 className="text-lg font-semibold mb-4 text-gray-300">System Logs</h2>
            <EventLogs alerts={alerts} />
          </div>
        </div>
      </div>
    </div>
  );
}
