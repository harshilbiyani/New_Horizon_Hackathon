import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Hexagon, ShieldAlert, Activity, Play, Square, RotateCcw, Battery, Users, Zap } from 'lucide-react';
import DroneSwarmBackground from '../components/DroneSwarmBackground';

interface SimStatus {
  simulationRunning: boolean;
  config: { droneCount: number; battery: number };
}

export default function Home() {
  const navigate = useNavigate();
  const [droneCount, setDroneCount] = useState(5);
  const [battery, setBattery] = useState(100);
  const [simRunning, setSimRunning] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch('http://localhost:3001/api/mission/status')
      .then(r => r.json())
      .then((data: SimStatus) => {
        setSimRunning(data.simulationRunning);
        setDroneCount(data.config.droneCount);
        setBattery(data.config.battery);
      })
      .catch(() => {});
  }, []);

  const configure = async () => {
    await fetch('http://localhost:3001/api/mission/configure', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ droneCount, battery }),
    });
  };

  const startSim = async () => {
    setLoading(true);
    setMessage('');
    await configure();
    const res = await fetch('http://localhost:3001/api/mission/start', { method: 'POST' });
    const data = await res.json();
    setLoading(false);
    if (res.ok) {
      setSimRunning(true);
      setMessage('Mission launched! Redirecting...');
      setTimeout(() => navigate('/dashboard'), 800);
    } else {
      setMessage(data.error || 'Failed to start');
    }
  };

  const stopSim = async () => {
    setLoading(true);
    await fetch('http://localhost:3001/api/mission/stop', { method: 'POST' });
    setSimRunning(false);
    setMessage('Mission stopped.');
    setLoading(false);
  };

  const resetSim = async () => {
    setLoading(true);
    await fetch('http://localhost:3001/api/mission/reset', { method: 'POST' });
    setSimRunning(false);
    setMessage('Simulation reset.');
    setLoading(false);
  };

  return (
    <div className="relative min-h-[calc(100vh-64px)] bg-[#000814] text-white flex justify-center items-center p-6 overflow-hidden">
      {/* Animated Hovering Swarm Background */}
      <DroneSwarmBackground />

      <div className="relative z-10 max-w-5xl w-full text-center space-y-8">
        
        <div className="inline-flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-sm font-medium text-gray-300">
          <span className={`w-2 h-2 rounded-full ${simRunning ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`}></span>
          {simRunning ? 'SIMULATION ACTIVE' : 'SIMULATION IDLE'}
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight">
          ADVANCED <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00ffcc] to-[#0055ff]">TACTICAL</span> <br/>
          FLOOD RESCUE
        </h1>

        <p className="text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
          Configure your drone swarm parameters below, then launch the mission.
        </p>

        {/* --- Mission Configuration Panel --- */}
        <div className="max-w-2xl mx-auto bg-white/[0.03] border border-white/10 rounded-2xl p-8 backdrop-blur-md space-y-6">
          <h2 className="text-lg font-bold text-[#00ffcc] tracking-wider flex items-center justify-center gap-2">
            <Zap size={18} />
            MISSION CONFIGURATION
          </h2>

          {/* Drone Count Slider */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <Users size={14} className="text-[#00ffcc]" />
                Number of Drones
              </label>
              <span className="text-2xl font-bold text-[#00ffcc] tabular-nums w-12 text-right">{droneCount}</span>
            </div>
            <input
              type="range"
              min={1}
              max={10}
              value={droneCount}
              onChange={(e) => setDroneCount(Number(e.target.value))}
              disabled={simRunning}
              className="w-full h-2 rounded-full appearance-none cursor-pointer
                         bg-white/10 accent-[#00ffcc]
                         disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <div className="flex justify-between text-[10px] text-gray-500 px-0.5">
              <span>1</span><span>3</span><span>5</span><span>7</span><span>10</span>
            </div>
          </div>

          {/* Battery Slider */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <label className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <Battery size={14} className="text-[#00ffcc]" />
                Starting Battery
              </label>
              <span className="text-2xl font-bold text-[#00ffcc] tabular-nums w-16 text-right">{battery}%</span>
            </div>
            <input
              type="range"
              min={10}
              max={100}
              step={5}
              value={battery}
              onChange={(e) => setBattery(Number(e.target.value))}
              disabled={simRunning}
              className="w-full h-2 rounded-full appearance-none cursor-pointer
                         bg-white/10 accent-[#00ffcc]
                         disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <div className="flex justify-between text-[10px] text-gray-500 px-0.5">
              <span>10%</span><span>25%</span><span>50%</span><span>75%</span><span>100%</span>
            </div>
          </div>

          {/* Start Position Info */}
          <div className="bg-white/[0.03] border border-white/5 rounded-lg p-4">
            <p className="text-xs text-gray-400">
              <span className="text-[#00ffcc] font-semibold">Starting Positions:</span> Drones will be evenly distributed around the terrain perimeter in a circular pattern, heading inward for maximum coverage.
            </p>
          </div>

          {/* Control Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 pt-2">
            {!simRunning ? (
              <button
                onClick={startSim}
                disabled={loading}
                className="flex-1 px-6 py-4 bg-[#00ffcc]/10 hover:bg-[#00ffcc]/20 border border-[#00ffcc]/50 
                           rounded-lg text-[#00ffcc] font-bold tracking-wider flex items-center justify-center gap-3 
                           transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed
                           hover:shadow-[0_0_30px_rgba(0,255,204,0.15)]"
              >
                <Play size={20} />
                {loading ? 'LAUNCHING...' : 'LAUNCH MISSION'}
              </button>
            ) : (
              <>
                <button
                  onClick={stopSim}
                  disabled={loading}
                  className="flex-1 px-6 py-4 bg-red-500/10 hover:bg-red-500/20 border border-red-500/50 
                             rounded-lg text-red-400 font-bold tracking-wider flex items-center justify-center gap-3 
                             transition-all cursor-pointer disabled:opacity-50"
                >
                  <Square size={18} />
                  STOP MISSION
                </button>
                <button
                  onClick={resetSim}
                  disabled={loading}
                  className="flex-1 px-6 py-4 bg-white/5 hover:bg-white/10 border border-white/20 
                             rounded-lg text-gray-300 font-bold tracking-wider flex items-center justify-center gap-3
                             transition-all cursor-pointer disabled:opacity-50"
                >
                  <RotateCcw size={18} />
                  RESET
                </button>
              </>
            )}
          </div>

          {/* Status Message */}
          {message && (
            <p className={`text-sm font-medium ${message.includes('launched') || message.includes('started') ? 'text-green-400' : message.includes('Failed') ? 'text-red-400' : 'text-gray-400'}`}>
              {message}
            </p>
          )}
        </div>

        {/* Quick Nav */}
        <div className="flex flex-col sm:flex-row justify-center items-center gap-6 pt-4">
          <Link to="/dashboard" className="w-full sm:w-auto px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-white font-semibold tracking-wider flex items-center justify-center gap-3 transition-all group">
            <Activity className="group-hover:scale-110 transition-transform" />
            COMMAND CENTER
          </Link>
          
          <Link to="/map" className="w-full sm:w-auto px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-white font-semibold tracking-wider flex items-center justify-center gap-3 transition-all group">
            <Hexagon className="group-hover:scale-110 transition-transform" />
            3D VISUALIZATION
          </Link>
        </div>

        {/* Feature Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-8">
          <div className="bg-white/5 p-6 rounded-xl border border-white/5">
            <ShieldAlert size={32} className="text-[#ff4a1c] mb-4 mx-auto" />
            <h3 className="text-lg font-bold mb-2">Threat Detection</h3>
            <p className="text-gray-400 text-sm">Automated optical analysis of live terrain.</p>
          </div>
          <div className="bg-white/5 p-6 rounded-xl border border-white/5">
            <Activity size={32} className="text-[#00ffcc] mb-4 mx-auto" />
            <h3 className="text-lg font-bold mb-2">Live Telemetry</h3>
            <p className="text-gray-400 text-sm">Millisecond sync across the entire UAV swarm.</p>
          </div>
          <div className="bg-white/5 p-6 rounded-xl border border-white/5">
            <Hexagon size={32} className="text-blue-400 mb-4 mx-auto" />
            <h3 className="text-lg font-bold mb-2">Grid Scanning</h3>
            <p className="text-gray-400 text-sm">Methodical partitioning of risk zones.</p>
          </div>
        </div>

      </div>
    </div>
  );
}