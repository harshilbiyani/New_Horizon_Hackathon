import { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';
import StatsPanel from '../components/StatsPanel';
import DroneGrid from '../components/DroneGrid';
import SurvivorFeed from '../components/SurvivorFeed';
import EventLogs from '../components/EventLogs';
import LiveVideo from '../components/LiveVideo';
import ChartsPanel from '../components/ChartsPanel';
import MissionMap from '../components/MissionMap';
import AICommandPanel from '../components/AICommandPanel';
import FogOfWarMap from '../components/FogOfWarMap';
import ScenarioSelector from '../components/ScenarioSelector';
import GPSStatusIndicator from '../components/GPSStatusIndicator';
import type {
  Alert,
  AiInsights,
  Drone,
  HiddenSurvivor,
  MissionData,
  MeshLink,
  Obstacle,
  Survivor,
} from '../types/telemetry';

type ActiveTab = 'tactical' | 'fog_lidar' | 'gps_denied' | 'scenarios';

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

const DEFAULT_SCENARIOS = [
  {
    id: 'earthquake',
    name: 'Earthquake Aftermath',
    icon: '🏚️',
    description: 'Magnitude 7.2 earthquake in urban center. Ongoing aftershocks inject dynamic building collapses in real-time. Drones dynamically re-route using A* and LiDAR.',
    environment: 'urban_canyon',
    gps_denied: false,
    highlight_features: ['Dynamic obstacle injection', 'Real-time A* re-pathing', 'LiDAR building discovery', 'ABC task reallocation'],
    ui_theme: { color: '#ef4444', bg: '#1a0505', accent: '#f97316' },
    tick_ms: 300,
  },
  {
    id: 'flood_rescue',
    name: 'Coastal Flood Rescue',
    icon: '🌊',
    description: 'Catastrophic tropical cyclone flooding. Rising water levels make southern sectors impassable over time. High wind impacts battery endurance.',
    environment: 'coastal_storm',
    gps_denied: false,
    highlight_features: ['Rising water simulation', 'Wind battery penalty', 'Adaptive coverage shift', 'Priority survivor triage'],
    ui_theme: { color: '#3b82f6', bg: '#00050f', accent: '#06b6d4' },
    tick_ms: 350,
  },
  {
    id: 'night_rescue',
    name: 'Night Forest Rescue',
    icon: '🌙',
    description: 'Dense forest canopy blocks all GPS signals. Drones operate in Dead Reckoning mode with visual position uncertainty circles and collaborative drift correction.',
    environment: 'forest_canopy',
    gps_denied: true,
    highlight_features: ['GPS-Denied dead reckoning', 'Uncertainty circle visualization', 'Collaborative position correction', 'Thermal detection mode'],
    ui_theme: { color: '#8b5cf6', bg: '#05000f', accent: '#a78bfa' },
    tick_ms: 400,
  },
  {
    id: 'hostile_zone',
    name: 'Hostile Zone Recon',
    icon: '⚔️',
    description: 'Active conflict zone with hostile radar and communication jamming. All mesh network communications are AES-256 encrypted. Threat-aware navigation active.',
    environment: 'mountain_pass',
    gps_denied: true,
    highlight_features: ['AES-256 encrypted mesh', 'Comm jamming simulation', 'Threat-level path planning', 'Secure survivor location relay'],
    ui_theme: { color: '#f59e0b', bg: '#0a0800', accent: '#dc2626' },
    tick_ms: 250,
  },
];

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('tactical');
  const [missionData, setMissionData] = useState<MissionData>(EMPTY_MISSION_DATA);
  const [drones, setDrones] = useState<Drone[]>([]);
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
  const [aiInsights, setAiInsights] = useState<AiInsights | null>(null);

  // Enhanced features state
  const [fogState, setFogState] = useState<any>(null);
  const [lidarCloud, setLidarCloud] = useState<any[]>([]);
  const [gpsGlobalDenied, setGpsGlobalDenied] = useState<boolean>(false);
  const [scenarios, setScenarios] = useState<any[]>(DEFAULT_SCENARIOS);
  const [currentScenarioId, setCurrentScenarioId] = useState<string>('earthquake');
  const [simulationRunning, setSimulationRunning] = useState<boolean>(false);

  // Fetch scenarios from API on mount
  useEffect(() => {
    fetch('http://localhost:3001/api/scenarios')
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.scenarios) && data.scenarios.length) {
          setScenarios(data.scenarios);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setCoverageHistory([]);
    setBatteryHistory([]);
    setLastSnapshotAt(null);

    const socket = io('http://localhost:3001', {
      transports: ['websocket', 'polling'],
      reconnectionAttempts: 10,
    });

    socket.on('connect', () => setConnectionState('connected'));
    socket.on('disconnect', () => setConnectionState('disconnected'));

    socket.on('telemetrySnapshot', (snapshot: any) => {
      setConnectionState('connected');
      setLastSnapshotAt(snapshot.timestamp);
      setDrones(snapshot.drones || []);
      setObstacles(snapshot.obstacles || []);
      setHiddenSurvivors(snapshot.hiddenSurvivors || []);
      setSurvivors(snapshot.foundSurvivors || []);
      setAlerts(snapshot.alerts || []);
      setMeshLinks(snapshot.meshLinks || []);
      setGpsGlobalDenied(!!snapshot.gps_denied);
      setSimulationRunning(!!snapshot.simulationRunning);
      if (snapshot.scenario_id) setCurrentScenarioId(snapshot.scenario_id);

      if (snapshot.fog) setFogState(snapshot.fog);
      if (snapshot.lidar_cloud) setLidarCloud(snapshot.lidar_cloud);

      if (snapshot.missionData) {
        setMissionData(snapshot.missionData);
        const timeLabel = new Date(snapshot.timestamp).toLocaleTimeString();
        setCoverageHistory((prev) => [...prev, { time: timeLabel, coverage: snapshot.missionData.coverage }].slice(-20));
        setBatteryHistory((prev) => [...prev, { time: timeLabel, battery: snapshot.missionData.avgBattery }].slice(-20));
      }

      setSelectedDroneId((current) => {
        if (current && snapshot.drones?.some((drone: Drone) => drone.id === current)) return current;
        return snapshot.drones?.[0]?.id;
      });
    });

    socket.on('fogState', (fog: any) => setFogState(fog));
    socket.on('lidarCloud', (cloud: any[]) => setLidarCloud(cloud || []));
    socket.on('aiInsights', (insights: AiInsights) => setAiInsights(insights));

    return () => {
      socket.disconnect();
    };
  }, []);

  // Scenario and GPS control actions
  const handleStartScenario = async (scenarioId: string) => {
    try {
      const res = await fetch('http://localhost:3001/api/mission/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_id: scenarioId }),
      });
      const data = await res.json();
      if (data.ok) {
        setSimulationRunning(true);
        setCurrentScenarioId(scenarioId);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleStopScenario = async () => {
    try {
      await fetch('http://localhost:3001/api/mission/stop', { method: 'POST' });
      setSimulationRunning(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleResetScenario = async () => {
    try {
      await fetch('http://localhost:3001/api/mission/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario_id: currentScenarioId }),
      });
      setSimulationRunning(false);
    } catch (err) {
      console.error(err);
    }
  };

  const handleToggleGPS = async (denied: boolean) => {
    try {
      await fetch('http://localhost:3001/api/mission/gps-denied', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: denied }),
      });
      setGpsGlobalDenied(denied);
    } catch (err) {
      console.error(err);
    }
  };

  const selectedDrone = useMemo(
    () => drones.find((drone) => drone.id === selectedDroneId),
    [drones, selectedDroneId]
  );

  const lastUpdateLabel = lastSnapshotAt
    ? new Date(lastSnapshotAt).toLocaleTimeString()
    : 'Awaiting snapshot';

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#000814] text-white p-6 font-sans">
      {/* Top Header */}
      <header className="mb-4 border-b border-white/10 pb-4 flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-widest text-[#00ffcc]">
            SWARM COMMAND <span className="text-xs font-semibold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400">AI-DRIVEN</span>
          </h1>
          <p className="text-xs text-gray-400 mt-1">Autonomous Search & Rescue • GPS-Denied • LiDAR Collision Avoidance • Secure Mesh</p>
        </div>

        <div className="flex items-center gap-4 text-xs uppercase tracking-wider flex-wrap justify-end">
          {/* Security Status Badge */}
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-purple-500/20 border border-purple-500/40 text-purple-300 font-mono text-[11px]">
            🔒 AES-256 MESH
          </span>

          {/* GPS Status Badge */}
          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-[11px] font-mono ${
            gpsGlobalDenied ? 'bg-red-500/20 border-red-500/50 text-red-400' : 'bg-emerald-500/20 border-emerald-500/50 text-emerald-400'
          }`}>
            {gpsGlobalDenied ? '📡 GPS DENIED (DR)' : '🛰️ GPS ACTIVE'}
          </span>

          <span className={`flex items-center gap-2 ${connectionState === 'connected' ? 'text-green-400' : 'text-red-400'}`}>
            <span className={`w-2.5 h-2.5 rounded-full ${connectionState === 'connected' ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></span>
            {connectionState}
          </span>
          <span className="text-gray-400">{lastUpdateLabel}</span>
        </div>
      </header>

      {/* Navigation Tabs */}
      <div className="flex gap-2 mb-6 border-b border-white/10 pb-3">
        {[
          { id: 'tactical', label: '🗺️ Tactical & Live Video' },
          { id: 'fog_lidar', label: '🌫️ LiDAR & Fog-of-War' },
          { id: 'gps_denied', label: '📡 GPS-Denied & Dead Reckoning' },
          { id: 'scenarios', label: '🎯 Disaster Scenarios' },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as ActiveTab)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === tab.id
                ? 'bg-cyan-500 text-black shadow-lg shadow-cyan-500/30'
                : 'bg-white/5 text-gray-300 hover:bg-white/10'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Top Stats Bar */}
      <div className="mb-6">
        <StatsPanel
          dronesCount={missionData.activeDrones || drones.filter((drone) => drone.status === 'active').length}
          coverage={missionData.coverage}
          survivorsCount={missionData.foundSurvivors || survivors.length}
          scannedCells={missionData.scannedCells}
          avgBattery={missionData.avgBattery}
          avgSignal={missionData.avgSignal}
          missionTimeSec={missionData.missionTimeSec}
        />
      </div>

      {/* Main Content Area based on Tab */}
      {activeTab === 'tactical' && (
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1.1fr] gap-6">
          <div className="flex flex-col gap-6">
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

            <div className="h-[360px]">
              <MissionMap
                drones={drones}
                obstacles={obstacles}
                foundSurvivors={survivors}
                hiddenSurvivors={hiddenSurvivors}
                meshLinks={meshLinks}
                selectedDroneId={selectedDroneId}
                onSelectDrone={setSelectedDroneId}
              />
            </div>

            <AICommandPanel aiInsights={aiInsights} />

            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5 overflow-hidden flex flex-col min-h-[320px]">
              <h2 className="text-lg font-semibold mb-4 text-gray-300">System Logs</h2>
              <EventLogs alerts={alerts} />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'fog_lidar' && (
        <div className="grid grid-cols-1 md:grid-cols-[1.5fr_1fr] gap-6">
          <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-6">
            <h2 className="text-lg font-bold text-cyan-400 mb-2">Live LiDAR Point Cloud & Fog-of-War Grid</h2>
            <p className="text-xs text-gray-400 mb-4">
              Drones start with zero map knowledge. Each tick, LiDAR rays sweep 360° to discover terrain. Obstacles trigger real-time path re-planning.
            </p>
            <FogOfWarMap fogState={fogState} lidarCloud={lidarCloud} />
          </div>

          <div className="flex flex-col gap-6">
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5">
              <h2 className="text-base font-semibold text-gray-200 mb-3">Swarm LiDAR Diagnostics</h2>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between p-2.5 rounded bg-black/40 border border-white/5">
                  <span className="text-gray-400">LiDAR Ray Density:</span>
                  <span className="font-mono text-cyan-300">72 rays / scan (5° res)</span>
                </div>
                <div className="flex justify-between p-2.5 rounded bg-black/40 border border-white/5">
                  <span className="text-gray-400">Effective Sensing Range:</span>
                  <span className="font-mono text-cyan-300">8 grid cells (56 meters)</span>
                </div>
                <div className="flex justify-between p-2.5 rounded bg-black/40 border border-white/5">
                  <span className="text-gray-400">Reactive Repulsion (APF):</span>
                  <span className="font-mono text-emerald-400">Active (Potential Fields)</span>
                </div>
                <div className="flex justify-between p-2.5 rounded bg-black/40 border border-white/5">
                  <span className="text-gray-400">Dynamic Re-routing:</span>
                  <span className="font-mono text-emerald-400">A* Path Invalidation Triggered</span>
                </div>
              </div>
            </div>

            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5 overflow-hidden flex flex-col min-h-[300px]">
              <h2 className="text-lg font-semibold mb-4 text-[#ff4a1c]">Live Detections Feed</h2>
              <SurvivorFeed survivors={survivors} />
            </div>
          </div>
        </div>
      )}

      {activeTab === 'gps_denied' && (
        <div className="grid grid-cols-1 md:grid-cols-[1.4fr_1fr] gap-6">
          <GPSStatusIndicator
            drones={drones as any}
            gpsGlobalDenied={gpsGlobalDenied}
            onToggleGPS={handleToggleGPS}
          />

          <div className="flex flex-col gap-6">
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5">
              <h2 className="text-base font-semibold text-gray-200 mb-3">GPS-Denied Architecture</h2>
              <div className="space-y-3 text-xs leading-relaxed text-gray-300">
                <p>
                  <strong className="text-cyan-400">1. Inertial Dead Reckoning:</strong> When GPS is jammed or canopy blocks signal, drones integrate IMU acceleration and compass headings to estimate position.
                </p>
                <p>
                  <strong className="text-purple-400">2. Collaborative Uncertainty Correction:</strong> When two drones fly within mesh communication range (&lt;15m), they exchange estimated coordinates and reduce accumulated drift error.
                </p>
                <p>
                  <strong className="text-emerald-400">3. Landmark Observations:</strong> Distinctive terrain features identified by LiDAR act as fixed references to bound localization error.
                </p>
              </div>
            </div>

            <AICommandPanel aiInsights={aiInsights} />
          </div>
        </div>
      )}

      {activeTab === 'scenarios' && (
        <div className="grid grid-cols-1 md:grid-cols-[1.3fr_1fr] gap-6">
          <ScenarioSelector
            scenarios={scenarios}
            currentScenarioId={currentScenarioId}
            onSelect={setCurrentScenarioId}
            onStart={handleStartScenario}
            onStop={handleStopScenario}
            onReset={handleResetScenario}
            simulationRunning={simulationRunning}
          />

          <div className="flex flex-col gap-6">
            <div className="h-[340px]">
              <MissionMap
                drones={drones}
                obstacles={obstacles}
                foundSurvivors={survivors}
                hiddenSurvivors={hiddenSurvivors}
                meshLinks={meshLinks}
                selectedDroneId={selectedDroneId}
                onSelectDrone={setSelectedDroneId}
              />
            </div>
            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5 overflow-hidden flex flex-col min-h-[250px]">
              <h2 className="text-lg font-semibold mb-3 text-gray-300">Scenario Event Stream</h2>
              <EventLogs alerts={alerts} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
