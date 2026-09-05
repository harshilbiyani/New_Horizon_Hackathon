import { useState } from 'react';
import { Radio, ChevronDown, Video, Eye } from 'lucide-react';
import type { Drone } from '../types/telemetry';

interface LiveVideoProps {
  selectedDrone?: Drone;
  connectionState: 'connected' | 'disconnected';
  drones?: Drone[];
  onSelectDrone?: (id: string) => void;
}

export default function LiveVideo({ selectedDrone, connectionState, drones = [], onSelectDrone }: LiveVideoProps) {
  const droneLabel = selectedDrone ? selectedDrone.id : 'NO LINK';
  const [dropdownOpen, setDropdownOpen] = useState(false);

  // Iframe URL for the 3D map following the selected drone from above
  const followUrl = selectedDrone
    ? `/map/index.html?follow=${selectedDrone.id}`
    : '/map/index.html';

  return (
    <div className="flex flex-col h-full w-full bg-black/60 rounded-xl overflow-hidden border border-white/10 relative">
      {/* Top Bar */}
      <div className="absolute top-0 w-full flex justify-between items-center p-3 bg-gradient-to-b from-black/90 to-transparent z-20 pointer-events-auto">
        <div className="flex items-center gap-2 text-yellow-400 font-bold text-xs tracking-widest">
          <span className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse"></span>
          SIM FPV — {droneLabel}
        </div>
        <span className="text-[9px] text-yellow-300/60 tracking-wider uppercase border border-yellow-400/20 px-1.5 py-0.5 rounded">
          Simulated Feed · Placeholder for camera integration
        </span>

        {/* Drone Selector Dropdown */}
        <div className="relative">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg px-3 py-1.5 text-[#00ffcc] text-xs font-semibold transition-all cursor-pointer"
          >
            <Video size={12} />
            {selectedDrone?.id || 'Select Drone'}
            <ChevronDown size={12} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
          </button>

          {dropdownOpen && drones.length > 0 && (
            <div className="absolute right-0 top-full mt-1 bg-[#0a0e1a]/95 backdrop-blur-md border border-white/10 rounded-lg overflow-hidden shadow-2xl z-50 min-w-[180px]">
              {drones.map((drone) => (
                <button
                  key={drone.id}
                  onClick={() => {
                    onSelectDrone?.(drone.id);
                    setDropdownOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium transition-all cursor-pointer hover:bg-white/5 ${drone.id === selectedDrone?.id ? 'bg-[#00ffcc]/10 text-[#00ffcc]' : 'text-gray-300'
                    }`}
                >
                  <span className={`w-2 h-2 rounded-full ${drone.status === 'active' ? 'bg-green-400 animate-pulse' : 'bg-red-400'
                    }`}></span>
                  <span className="flex-1 text-left">{drone.id}</span>
                  <span className="text-[10px] text-gray-500">{drone.battery.toFixed(0)}%</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded ${drone.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                    }`}>
                    {drone.status.toUpperCase()}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-[#00ffcc] text-xs">
          <Radio size={14} className="animate-pulse" />
          LINK: {connectionState.toUpperCase()}
        </div>
      </div>

      {/* Actual 3D Scene following the drone — top-down view */}
      <iframe
        key={selectedDrone?.id || 'none'}
        src={followUrl}
        title="Drone FPV Feed"
        className="w-full h-full border-none block"
        style={{ height: '100%', width: '100%', display: 'block', border: 'none' }}
      />

      {/* Tactical HUD Overlay */}
      <div className="absolute inset-0 z-10 pointer-events-none m-3">
        {/* Crosshair */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-40">
          <div className="w-16 h-[1px] bg-[#00ffcc] absolute top-1/2 -translate-y-1/2 -left-8"></div>
          <div className="w-[1px] h-16 bg-[#00ffcc] absolute left-1/2 -translate-x-1/2 -top-8"></div>
          <div className="w-8 h-8 border border-[#00ffcc]/40 rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
        </div>

        {/* FOV label */}
        <div className="absolute top-16 left-4 flex items-center gap-2">
          <Eye size={12} className="text-[#00ffcc]" />
          <span className="text-[10px] text-[#00ffcc] font-mono">FOV: TOP-DOWN 60°</span>
        </div>

        {/* Telemetry bottom-left */}
        <div className="absolute bottom-4 left-4 text-[#00ffcc] font-mono text-[10px] leading-relaxed bg-black/40 px-2 py-1 rounded">
          ALT: {selectedDrone ? `${selectedDrone.z.toFixed(0)}M` : '--'} |
          SPD: {selectedDrone ? `${selectedDrone.speed.toFixed(1)}` : '--'} |
          {selectedDrone?.task?.toUpperCase() || 'IDLE'}
        </div>

        {/* Telemetry bottom-right */}
        <div className="absolute bottom-4 right-4 text-[#00ffcc] font-mono text-[10px] text-right leading-relaxed bg-black/40 px-2 py-1 rounded">
          X:{selectedDrone ? selectedDrone.x.toFixed(1) : '--'} Y:{selectedDrone ? selectedDrone.y.toFixed(1) : '--'} |
          BATT:{selectedDrone ? `${selectedDrone.battery.toFixed(0)}%` : '--'} |
          SIG:{selectedDrone ? `${selectedDrone.signalStrength.toFixed(0)}%` : '--'}
        </div>

        {/* Frame corners */}
        <div className="absolute top-12 left-0 w-6 h-6 border-l-2 border-t-2 border-[#00ffcc]/30"></div>
        <div className="absolute top-12 right-0 w-6 h-6 border-r-2 border-t-2 border-[#00ffcc]/30"></div>
        <div className="absolute bottom-0 left-0 w-6 h-6 border-l-2 border-b-2 border-[#00ffcc]/30"></div>
        <div className="absolute bottom-0 right-0 w-6 h-6 border-r-2 border-b-2 border-[#00ffcc]/30"></div>
      </div>
    </div>
  );
}