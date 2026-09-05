import { Play, Square, RotateCcw, Crosshair, Zap, ShieldAlert } from 'lucide-react';

export default function MissionControls() {
  const triggerEndpoint = async (endpoint: string, method: string = 'POST', body?: any) => {
    try {
      const res = await fetch(`http://localhost:3001/api/mission/${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (!res.ok) {
        console.error(`Failed to trigger ${endpoint}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const addRandomSurvivor = () => {
    // Generate random coordinates between -150 and +150
    const x = (Math.random() - 0.5) * 300;
    const y = (Math.random() - 0.5) * 300;
    triggerEndpoint('add-survivor', 'POST', { x, y, severity: 'critical' });
  };

  const addRandomJammer = () => {
    const cx = (Math.random() - 0.5) * 300;
    const cy = (Math.random() - 0.5) * 300;
    triggerEndpoint('add-jammer', 'POST', { cx, cy, radius: 45 });
  };

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5 min-h-[300px] flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-[#00ffcc]">Mission Command</h2>
        <span className="text-[10px] uppercase tracking-[0.15em] text-gray-400">Tactical Control</span>
      </div>

      <div className="flex flex-col gap-4">
        {/* Core Engine Controls */}
        <div className="grid grid-cols-3 gap-2">
          <button 
            onClick={() => triggerEndpoint('start')}
            className="flex flex-col items-center justify-center gap-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-400 rounded-lg p-3 transition-colors cursor-pointer"
          >
            <Play size={18} />
            <span className="text-[10px] uppercase tracking-wider font-bold">Start</span>
          </button>
          
          <button 
            onClick={() => triggerEndpoint('stop')}
            className="flex flex-col items-center justify-center gap-2 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-500/30 text-rose-400 rounded-lg p-3 transition-colors cursor-pointer"
          >
            <Square size={18} />
            <span className="text-[10px] uppercase tracking-wider font-bold">Stop</span>
          </button>
          
          <button 
            onClick={() => triggerEndpoint('reset')}
            className="flex flex-col items-center justify-center gap-2 bg-gray-500/20 hover:bg-gray-500/30 border border-gray-500/30 text-gray-400 rounded-lg p-3 transition-colors cursor-pointer"
          >
            <RotateCcw size={18} />
            <span className="text-[10px] uppercase tracking-wider font-bold">Reset</span>
          </button>
        </div>

        <div className="h-px w-full bg-white/10 my-1"></div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Chaos Engine</h3>

        {/* Dynamic Chaos Controls */}
        <div className="grid grid-cols-1 gap-3">
          <button 
            onClick={() => triggerEndpoint('kill-drone')}
            className="flex items-center gap-3 bg-[#ff4a1c]/10 hover:bg-[#ff4a1c]/20 border border-[#ff4a1c]/30 text-[#ff4a1c] rounded-lg p-3 transition-colors w-full cursor-pointer text-left"
          >
            <div className="bg-[#ff4a1c]/20 p-2 rounded-md">
              <Zap size={16} />
            </div>
            <div>
              <div className="text-xs font-bold tracking-wide uppercase">Trigger EMP</div>
              <div className="text-[9px] text-[#ff4a1c]/70 uppercase tracking-wider">Simulate Drone Failure</div>
            </div>
          </button>

          <button 
            onClick={addRandomSurvivor}
            className="flex items-center gap-3 bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 rounded-lg p-3 transition-colors w-full cursor-pointer text-left"
          >
            <div className="bg-cyan-500/20 p-2 rounded-md">
              <Crosshair size={16} />
            </div>
            <div>
              <div className="text-xs font-bold tracking-wide uppercase">Deploy Survivor</div>
              <div className="text-[9px] text-cyan-400/70 uppercase tracking-wider">Add dynamic target</div>
            </div>
          </button>

          <button 
            onClick={addRandomJammer}
            className="flex items-center gap-3 bg-purple-500/10 hover:bg-purple-500/20 border border-purple-500/30 text-purple-400 rounded-lg p-3 transition-colors w-full cursor-pointer text-left"
          >
            <div className="bg-purple-500/20 p-2 rounded-md">
              <ShieldAlert size={16} />
            </div>
            <div>
              <div className="text-xs font-bold tracking-wide uppercase">Deploy GPS Jammer</div>
              <div className="text-[9px] text-purple-400/70 uppercase tracking-wider">Create GPS-Denied Zone</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
