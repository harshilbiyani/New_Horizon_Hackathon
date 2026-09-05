import { useState, useEffect } from 'react';
import { Radio, ChevronDown, Video, Eye, RefreshCw, WifiOff, Camera } from 'lucide-react';
import type { Drone } from '../types/telemetry';

interface LiveVideoProps {
  selectedDrone?: Drone;
  connectionState: 'connected' | 'disconnected';
  drones?: Drone[];
  onSelectDrone?: (id: string) => void;
}

const API_BASE = 'http://localhost:3001';

export default function LiveVideo({ selectedDrone, connectionState, drones = [], onSelectDrone }: LiveVideoProps) {
  const droneLabel = selectedDrone ? selectedDrone.id : 'DRONE-1';
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [camDropdownOpen, setCamDropdownOpen] = useState(false);
  const [viewMode, setViewMode] = useState<'camera' | '3d'>('camera');
  const [cameraSource, setCameraSource] = useState<'cam:1' | 'webcam'>('cam:1');
  const [feedKey, setFeedKey] = useState(Date.now());
  const [feedError, setFeedError] = useState(false);
  const [feedLoading, setFeedLoading] = useState(false);

  // Iframe URL for the 3D map following the selected drone
  const followUrl = selectedDrone
    ? `/map/index.html?follow=${selectedDrone.id}`
    : '/map/index.html';

  const reconnectFeed = () => {
    setFeedLoading(true);
    setFeedError(false);
    setFeedKey(Date.now());
  };

  useEffect(() => {
    if (feedLoading) {
      const timer = setTimeout(() => setFeedLoading(false), 900);
      return () => clearTimeout(timer);
    }
  }, [feedKey, feedLoading]);

  const yoloFeedUrl = `${API_BASE}/api/vlm/stream/yolo_feed?source=${encodeURIComponent(cameraSource)}&fps=24&t=${feedKey}`;

  return (
    <div className="flex flex-col h-full w-full bg-black/60 rounded-xl overflow-hidden border border-white/10 relative">
      {/* Top Bar */}
      <div className="absolute top-0 w-full flex justify-between items-center p-3 bg-gradient-to-b from-black/95 via-black/80 to-transparent z-20 pointer-events-auto">
        <div className="flex items-center gap-3">
          {/* Mode Switcher Tabs */}
          <div className="flex items-center bg-black/70 border border-white/15 p-0.5 rounded-lg shadow-inner">
            <button
              type="button"
              onClick={() => setViewMode('camera')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'camera'
                  ? 'bg-[#00ffcc] text-[#000d1a] shadow-[0_0_12px_rgba(0,255,204,0.4)]'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Camera size={12} />
              USB LIVE FEED
            </button>
            <button
              type="button"
              onClick={() => setViewMode('3d')}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === '3d'
                  ? 'bg-yellow-400 text-[#000d1a] shadow-[0_0_12px_rgba(250,204,21,0.4)]'
                  : 'text-gray-400 hover:text-white'
              }`}
            >
              <Eye size={12} />
              3D SIMULATION
            </button>
          </div>

          {/* Active status pill */}
          {viewMode === 'camera' ? (
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#00ffcc]/10 border border-[#00ffcc]/30 text-[10px] text-[#00ffcc] font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00ffcc] animate-pulse"></span>
              {cameraSource === 'cam:1' ? 'USB PHONE CAM (CAM 1)' : 'LAPTOP WEBCAM (CAM 0)'}
            </div>
          ) : (
            <div className="hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-yellow-400/10 border border-yellow-400/30 text-[10px] text-yellow-400 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse"></span>
              SIM FPV • {droneLabel}
            </div>
          )}
        </div>

        {/* Right Actions: Camera Selector (in camera mode) + Drone Selector + Link */}
        <div className="flex items-center gap-2">
          {viewMode === 'camera' && (
            <div className="relative">
              <button
                onClick={() => setCamDropdownOpen(!camDropdownOpen)}
                className="flex items-center gap-1.5 bg-black/60 hover:bg-white/10 border border-[#00ffcc]/30 rounded-lg px-2.5 py-1 text-[#00ffcc] text-[11px] font-medium transition-all cursor-pointer"
              >
                <Video size={11} />
                {cameraSource === 'cam:1' ? 'Mobile USB (Cam 1)' : 'Laptop Cam (0)'}
                <ChevronDown size={11} className={`transition-transform ${camDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {camDropdownOpen && (
                <div className="absolute right-0 top-full mt-1 bg-[#0a0e1a]/95 backdrop-blur-md border border-white/15 rounded-lg overflow-hidden shadow-2xl z-50 min-w-[190px]">
                  <button
                    onClick={() => {
                      setCameraSource('cam:1');
                      setFeedKey(Date.now());
                      setCamDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-medium hover:bg-white/5 transition-all text-left ${
                      cameraSource === 'cam:1' ? 'bg-[#00ffcc]/10 text-[#00ffcc]' : 'text-gray-300'
                    }`}
                  >
                    <span>Mobile USB (Camera 1)</span>
                    <span className="text-[10px] text-[#00ffcc] bg-[#00ffcc]/10 px-1.5 py-0.2 rounded border border-[#00ffcc]/30 font-mono">
                      USB
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      setCameraSource('webcam');
                      setFeedKey(Date.now());
                      setCamDropdownOpen(false);
                    }}
                    className={`w-full flex items-center justify-between px-3.5 py-2 text-xs font-medium hover:bg-white/5 transition-all text-left ${
                      cameraSource === 'webcam' ? 'bg-[#00ffcc]/10 text-[#00ffcc]' : 'text-gray-300'
                    }`}
                  >
                    <span>Built-in Camera (Camera 0)</span>
                    <span className="text-[10px] text-gray-400 bg-white/5 px-1.5 py-0.2 rounded border border-white/10 font-mono">
                      WEBCAM
                    </span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Drone Selector Dropdown */}
          <div className="relative">
            <button
              onClick={() => setDropdownOpen(!dropdownOpen)}
              className="flex items-center gap-1.5 bg-black/60 hover:bg-white/10 border border-white/10 rounded-lg px-2.5 py-1 text-gray-200 text-[11px] font-semibold transition-all cursor-pointer"
            >
              <span className="text-gray-400">Drone:</span>
              <span className="text-[#00ffcc]">{selectedDrone?.id || 'Select'}</span>
              <ChevronDown size={11} className={`transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} />
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
                    className={`w-full flex items-center gap-3 px-4 py-2.5 text-xs font-medium transition-all cursor-pointer hover:bg-white/5 ${
                      drone.id === selectedDrone?.id ? 'bg-[#00ffcc]/10 text-[#00ffcc]' : 'text-gray-300'
                    }`}
                  >
                    <span
                      className={`w-2 h-2 rounded-full ${
                        drone.status === 'active' ? 'bg-green-400 animate-pulse' : 'bg-red-400'
                      }`}
                    ></span>
                    <span className="flex-1 text-left">{drone.id}</span>
                    <span className="text-[10px] text-gray-500">{drone.battery.toFixed(0)}%</span>
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded ${
                        drone.status === 'active' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'
                      }`}
                    >
                      {drone.status.toUpperCase()}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="hidden sm:flex items-center gap-1.5 text-[#00ffcc] text-xs font-mono">
            <Radio size={12} className="animate-pulse" />
            <span>{connectionState.toUpperCase()}</span>
          </div>
        </div>
      </div>

      {/* Main Viewport Content */}
      <div className="relative w-full h-full flex-1 overflow-hidden bg-black flex items-center justify-center">
        {viewMode === 'camera' ? (
          <div className="relative w-full h-full flex items-center justify-center bg-black">
            <img
              key={feedKey}
              src={yoloFeedUrl}
              alt="Live Drone USB Optical Feed"
              onError={() => {
                setFeedLoading(false);
                setFeedError(true);
              }}
              onLoad={() => {
                setFeedLoading(false);
                setFeedError(false);
              }}
              className="w-full h-full object-contain"
            />

            {/* Error Overlay */}
            {feedError && (
              <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 backdrop-blur-md p-6 text-center z-10">
                <div className="w-10 h-10 rounded-full border border-red-500/30 bg-red-500/10 flex items-center justify-center text-red-400">
                  <WifiOff size={18} />
                </div>
                <div>
                  <p className="text-xs font-semibold text-white">USB Camera Feed Disconnected</p>
                  <p className="text-[11px] text-gray-400 mt-0.5">
                    Check phone USB cable or switch to Built-in Webcam above.
                  </p>
                </div>
                <button
                  onClick={reconnectFeed}
                  className="flex items-center gap-1.5 text-xs font-bold bg-[#00ffcc] text-[#000814] px-3.5 py-1.5 rounded-lg hover:bg-[#00e6b8] transition-all cursor-pointer"
                >
                  <RefreshCw size={12} /> Reconnect Camera
                </button>
              </div>
            )}
          </div>
        ) : (
          <iframe
            key={selectedDrone?.id || 'none'}
            src={followUrl}
            title="Drone 3D FPV Feed"
            className="w-full h-full border-none block"
            style={{ height: '100%', width: '100%', display: 'block', border: 'none' }}
          />
        )}
      </div>

      {/* Tactical HUD Overlay (Visible on both modes) */}
      <div className="absolute inset-0 z-10 pointer-events-none m-3">
        {/* Crosshair */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-40">
          <div className="w-16 h-[1px] bg-[#00ffcc] absolute top-1/2 -translate-y-1/2 -left-8"></div>
          <div className="w-[1px] h-16 bg-[#00ffcc] absolute left-1/2 -translate-x-1/2 -top-8"></div>
          <div className="w-8 h-8 border border-[#00ffcc]/40 rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
        </div>

        {/* Mode / Optical Tag */}
        <div className="absolute top-14 left-4 flex items-center gap-2">
          <Eye size={12} className="text-[#00ffcc]" />
          <span className="text-[10px] text-[#00ffcc] font-mono uppercase">
            {viewMode === 'camera' ? 'OPTICAL AI • YOLOv8 TARGET TRACKING' : 'FPV 3D CITY SIMULATION'}
          </span>
        </div>

        {/* Telemetry bottom-left */}
        <div className="absolute bottom-4 left-4 text-[#00ffcc] font-mono text-[10px] leading-relaxed bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded border border-white/5">
          ALT: {selectedDrone ? `${selectedDrone.z.toFixed(0)}M` : '42M'} | SPD:{' '}
          {selectedDrone ? `${selectedDrone.speed.toFixed(1)}` : '14.2'} |{' '}
          {selectedDrone?.task?.toUpperCase() || 'SEARCH_PATROL'}
        </div>

        {/* Telemetry bottom-right */}
        <div className="absolute bottom-4 right-4 text-[#00ffcc] font-mono text-[10px] text-right leading-relaxed bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded border border-white/5">
          X:{selectedDrone ? selectedDrone.x.toFixed(1) : '12.97'} Y:{' '}
          {selectedDrone ? selectedDrone.y.toFixed(1) : '77.59'} | BATT:{' '}
          {selectedDrone ? `${selectedDrone.battery.toFixed(0)}%` : '88%'} | SIG:{' '}
          {selectedDrone ? `${selectedDrone.signalStrength.toFixed(0)}%` : '96%'}
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
