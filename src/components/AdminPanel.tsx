import React, { useState } from 'react';

export default function AdminPanel() {
  const [droneCount, setDroneCount] = useState<number>(5);
  const [statusMsg, setStatusMsg] = useState<string>('');

  const handleStartMission = async () => {
    setStatusMsg('Launching mission...');
    try {
      const res = await fetch('/api/mission/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ droneCount }),
      });
      const data = await res.json();
      setStatusMsg(data.ok ? `Mission Started with ${droneCount} drones!` : (data.error || 'Failed to start'));
    } catch (e: any) {
      setStatusMsg('Error launching mission');
    }
  };

  const handlePauseMission = async () => {
    try {
      await fetch('/api/mission/pause', { method: 'POST' });
      setStatusMsg('Mission Paused');
    } catch (e) {
      setStatusMsg('Failed to pause');
    }
  };

  const handleResetMission = async () => {
    try {
      await fetch('/api/mission/reset', { method: 'POST' });
      setStatusMsg('Swarm reset to central launchpad (0,0)');
    } catch (e) {
      setStatusMsg('Failed to reset');
    }
  };

  const sendArduPilotCommand = async (action: string) => {
    try {
      await fetch('/api/mission/command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, drone_id: 'ALL' }),
      });
      setStatusMsg(`Sent ArduPilot Command: ${action} to ALL drones`);
    } catch (e) {
      setStatusMsg(`Failed to send ${action}`);
    }
  };

  const triggerEvent = async (eventType: string) => {
    try {
      await fetch('/api/mission/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ event: eventType }),
      });
    } catch (e) {
      console.error('Failed to trigger event', e);
    }
  };

  const setGPS = async (denied: boolean) => {
    try {
      await fetch('/api/mission/admin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'set_gps_denied', enabled: denied }),
      });
    } catch (e) {
      console.error('Failed to toggle GPS', e);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Top Card: Mission Launch & Swarm Control */}
      <div className="bg-[#00122e]/80 backdrop-blur-md border border-[#00ffcc]/30 rounded-xl p-5 shadow-lg">
        <div className="flex items-center justify-between mb-3 border-b border-[#00ffcc]/20 pb-2">
          <h2 className="text-base font-bold text-[#00ffcc] tracking-wider uppercase flex items-center gap-2">
            🚀 Mission Launch & Swarm Allocator
          </h2>
          <span className="text-xs bg-[#00ffcc]/10 border border-[#00ffcc]/40 text-[#00ffcc] px-2 py-0.5 rounded font-mono">
            STATUS: ACTIVE
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center">
          <div>
            <label className="text-xs text-gray-400 font-semibold block mb-1">NUM DRONES IN SWARM</label>
            <select
              value={droneCount}
              onChange={(e) => setDroneCount(Number(e.target.value))}
              className="w-full bg-[#000814] border border-[#00ffcc]/40 text-white rounded p-2 text-sm font-mono focus:outline-none focus:border-[#00ffcc]"
            >
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((num) => (
                <option key={num} value={num}>
                  {num} Drones Swarm
                </option>
              ))}
            </select>
          </div>

          <div className="flex gap-2 col-span-3">
            <button
              onClick={handleStartMission}
              className="flex-1 bg-gradient-to-r from-emerald-600 to-teal-500 hover:from-emerald-500 hover:to-teal-400 text-white font-bold text-sm py-2 px-4 rounded transition-all shadow-md active:scale-95"
            >
              ▶ START MISSION
            </button>

            <button
              onClick={handlePauseMission}
              className="flex-1 bg-amber-600/80 hover:bg-amber-500 text-white font-bold text-sm py-2 px-4 rounded transition-all active:scale-95"
            >
              ⏸ PAUSE
            </button>

            <button
              onClick={handleResetMission}
              className="flex-1 bg-red-600/80 hover:bg-red-500 text-white font-bold text-sm py-2 px-4 rounded transition-all active:scale-95"
            >
              🔄 RESET TO CENTER
            </button>
          </div>
        </div>

        {statusMsg && (
          <div className="mt-3 text-xs font-mono text-[#00ffcc] bg-[#00ffcc]/10 border border-[#00ffcc]/30 p-2 rounded">
            {statusMsg}
          </div>
        )}
      </div>

      {/* Second Card: ArduPilot Simplified Commands & Disaster Injection */}
      <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5 overflow-hidden flex flex-col">
        <div className="flex items-center justify-between mb-4 border-b border-gray-800 pb-2">
          <h2 className="text-base font-semibold text-cyan-400">ArduPilot Simplified Command Center & Injection</h2>
          <span className="text-xs text-gray-500 uppercase tracking-wider">Mission Planner Interconnect</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* ArduPilot Commands */}
          <div>
            <h3 className="text-sm font-semibold text-emerald-400 mb-2">Simplified ArduPilot Commands</h3>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => sendArduPilotCommand('TAKEOFF')}
                className="bg-emerald-900/40 hover:bg-emerald-800/60 border border-emerald-500 text-emerald-200 p-2 rounded text-xs transition-colors text-left font-mono"
              >
                🛫 ARM & TAKEOFF ALL DRONES (10m)
              </button>
              <button
                onClick={() => sendArduPilotCommand('HOLD')}
                className="bg-cyan-900/40 hover:bg-cyan-800/60 border border-cyan-500 text-cyan-200 p-2 rounded text-xs transition-colors text-left font-mono"
              >
                🛸 HOLD / HOVER IN SECTOR
              </button>
              <button
                onClick={() => sendArduPilotCommand('RTL')}
                className="bg-orange-900/40 hover:bg-orange-800/60 border border-orange-500 text-orange-200 p-2 rounded text-xs transition-colors text-left font-mono"
              >
                🏠 RETURN TO LAND (RTL HOME)
              </button>
            </div>
          </div>

          {/* Disaster Injection */}
          <div>
            <h3 className="text-sm font-semibold text-red-400 mb-2">Disaster & Anomaly Injection</h3>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => triggerEvent('crash_drone')}
                className="bg-red-900/30 hover:bg-red-900/60 border border-red-700 text-red-200 p-2 rounded text-xs transition-colors text-left"
              >
                ⚠️ Simulate Drone Crash (Node 2)
              </button>
              <button
                onClick={() => triggerEvent('jam_comms')}
                className="bg-orange-900/30 hover:bg-orange-900/60 border border-orange-700 text-orange-200 p-2 rounded text-xs transition-colors text-left"
              >
                📡 Jam RF Communications (Mesh Drop)
              </button>
              <button
                onClick={() => triggerEvent('degrade_sensors')}
                className="bg-yellow-900/30 hover:bg-yellow-900/60 border border-yellow-700 text-yellow-200 p-2 rounded text-xs transition-colors text-left"
              >
                🌫️ Inject Dense Smoke (Blind LiDAR)
              </button>
            </div>
          </div>

          {/* Environment & GPS */}
          <div>
            <h3 className="text-sm font-semibold text-blue-400 mb-2">Environment & GPS Controls</h3>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => setGPS(true)}
                className="bg-blue-900/30 hover:bg-blue-900/60 border border-blue-700 text-blue-200 p-2 rounded text-xs transition-colors text-left"
              >
                🛰️ Disable GPS (Force SLAM/Dead Reckoning)
              </button>
              <button
                onClick={() => setGPS(false)}
                className="bg-green-900/30 hover:bg-green-900/60 border border-green-700 text-green-200 p-2 rounded text-xs transition-colors text-left"
              >
                🛰️ Restore GPS
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
