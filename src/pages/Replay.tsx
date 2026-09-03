import { useEffect, useState } from 'react';
import { Play, Pause, RotateCcw, FastForward, Film } from 'lucide-react';
import StatsPanel from '../components/StatsPanel';
import DroneGrid from '../components/DroneGrid';
import SurvivorFeed from '../components/SurvivorFeed';
import EventLogs from '../components/EventLogs';
import MissionMap from '../components/MissionMap';
import type { TelemetrySnapshot } from '../types/telemetry';

interface LogItem {
  id: string;
  filename: string;
  ticks: number;
}

export default function Replay() {
  const [logs, setLogs] = useState<LogItem[]>([]);
  const [selectedLogId, setSelectedLogId] = useState<string>('');
  const [snapshots, setSnapshots] = useState<TelemetrySnapshot[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState<number>(1);
  const [loading, setLoading] = useState(false);

  // Fetch list of available mission logs
  useEffect(() => {
    fetch('http://localhost:3001/api/mission/logs')
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && Array.isArray(data.logs)) {
          setLogs(data.logs);
          if (data.logs.length > 0) {
            setSelectedLogId(data.logs[0].id);
          }
        }
      })
      .catch((err) => console.error('Failed to fetch logs:', err));
  }, []);

  // Fetch snapshots when selectedLogId changes
  useEffect(() => {
    if (!selectedLogId) return;
    setLoading(true);
    setIsPlaying(false);
    setCurrentIndex(0);

    fetch(`http://localhost:3001/api/mission/history/${selectedLogId}`)
      .then((res) => res.json())
      .then((data) => {
        setLoading(false);
        if (data.ok && Array.isArray(data.ticks)) {
          setSnapshots(data.ticks);
        }
      })
      .catch((err) => {
        setLoading(false);
        console.error('Failed to load history:', err);
      });
  }, [selectedLogId]);

  // Playback timer
  useEffect(() => {
    if (!isPlaying || snapshots.length === 0) return;

    const intervalMs = Math.max(100, Math.floor(700 / speed));
    const timer = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev + 1 >= snapshots.length) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, intervalMs);

    return () => clearInterval(timer);
  }, [isPlaying, snapshots, speed]);

  const currentSnapshot = snapshots[currentIndex] || null;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#000814] text-white p-6 font-sans">
      <header className="mb-6 border-b border-white/10 pb-4 flex flex-wrap justify-between items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-widest text-[#00ffcc] flex items-center gap-2">
            <Film className="w-6 h-6 text-[#00ffcc]" /> MISSION REPLAY PLAYER
          </h1>
          <p className="text-xs text-gray-400 mt-1">
            Offline JSONL log playback — zero mock physics, exact historical replay.
          </p>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 text-xs uppercase tracking-wider text-gray-400">
            Log:
            <select
              value={selectedLogId}
              onChange={(e) => setSelectedLogId(e.target.value)}
              className="bg-[#081425] border border-white/10 text-gray-200 text-xs rounded-md px-3 py-1.5 uppercase"
            >
              {logs.length === 0 && <option value="">No logs recorded yet</option>}
              {logs.map((log) => (
                <option key={log.id} value={log.id}>
                  {log.id} ({log.ticks} ticks)
                </option>
              ))}
            </select>
          </label>

          {/* Controls */}
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 px-3 py-1 rounded-lg">
            <button
              onClick={() => setIsPlaying(!isPlaying)}
              disabled={snapshots.length === 0}
              className="p-1.5 rounded hover:bg-white/10 text-[#00ffcc] disabled:opacity-50"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
            </button>
            <button
              onClick={() => {
                setIsPlaying(false);
                setCurrentIndex(0);
              }}
              disabled={snapshots.length === 0}
              className="p-1.5 rounded hover:bg-white/10 text-gray-300 disabled:opacity-50"
              title="Reset to start"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSpeed((s) => (s >= 4 ? 1 : s * 2))}
              className="px-2 py-1 text-xs font-mono text-cyan-400 hover:bg-white/10 rounded flex items-center gap-1"
            >
              <FastForward className="w-3 h-3" /> {speed}x
            </button>
          </div>
        </div>
      </header>

      {/* Scrubber Bar */}
      {snapshots.length > 0 && (
        <div className="mb-6 bg-white/5 border border-white/10 rounded-xl p-4">
          <div className="flex justify-between text-xs text-gray-400 mb-2">
            <span>Tick {currentIndex + 1} / {snapshots.length}</span>
            <span>{currentSnapshot?.timestamp ? new Date(currentSnapshot.timestamp).toLocaleTimeString() : ''}</span>
          </div>
          <input
            type="range"
            min={0}
            max={snapshots.length - 1}
            value={currentIndex}
            onChange={(e) => {
              setIsPlaying(false);
              setCurrentIndex(Number(e.target.value));
            }}
            className="w-full h-2 bg-gray-800 rounded-lg appearance-none cursor-pointer accent-[#00ffcc]"
          />
        </div>
      )}

      {loading && <div className="text-center py-12 text-cyan-400">Loading mission log history...</div>}

      {!loading && snapshots.length === 0 && (
        <div className="text-center py-16 text-gray-500 border border-dashed border-white/10 rounded-xl">
          No ticks recorded in selected mission log. Launch a mission on the dashboard to record log data.
        </div>
      )}

      {!loading && currentSnapshot && (
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1.1fr] gap-6">
          <div className="flex flex-col gap-6">
            <StatsPanel
              dronesCount={currentSnapshot.missionData.activeDrones}
              coverage={currentSnapshot.missionData.coverage}
              survivorsCount={currentSnapshot.missionData.foundSurvivors}
              scannedCells={Array.isArray(currentSnapshot.missionData.scannedCells) ? currentSnapshot.missionData.scannedCells.length : currentSnapshot.missionData.scannedCells}
              avgBattery={currentSnapshot.missionData.avgBattery}
              avgSignal={currentSnapshot.missionData.avgSignal}
              missionTimeSec={currentSnapshot.missionData.missionTimeSec}
            />

            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5 flex flex-col min-h-[300px]">
              <h2 className="text-lg font-semibold mb-4 text-gray-300">Swarm Telemetry (Replay)</h2>
              <DroneGrid drones={currentSnapshot.drones} />
            </div>

            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5 flex flex-col min-h-[250px]">
              <h2 className="text-lg font-semibold mb-4 text-[#ff4a1c]">Detections (Replay)</h2>
              <SurvivorFeed survivors={currentSnapshot.foundSurvivors} />
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="h-[400px]">
              <MissionMap
                drones={currentSnapshot.drones}
                obstacles={currentSnapshot.obstacles}
                foundSurvivors={currentSnapshot.foundSurvivors}
                hiddenSurvivors={currentSnapshot.hiddenSurvivors}
                meshLinks={currentSnapshot.meshLinks}
              />
            </div>

            <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5 min-h-[300px]">
              <h2 className="text-lg font-semibold mb-4 text-gray-300">System Logs (Replay)</h2>
              <EventLogs alerts={currentSnapshot.alerts} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
