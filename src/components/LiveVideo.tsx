import { Radio } from 'lucide-react';
import type { Drone } from '../types/telemetry';

interface LiveVideoProps {
  selectedDrone?: Drone;
  connectionState: 'connected' | 'disconnected';
}

export default function LiveVideo({ selectedDrone, connectionState }: LiveVideoProps) {
  const droneLabel = selectedDrone ? selectedDrone.id : 'NO LINK';

  return (
    <div className="flex flex-col h-full w-full bg-black/60 rounded-xl overflow-hidden border border-white/10 relative">
      <div className="absolute top-0 w-full flex justify-between items-center p-3 bg-gradient-to-b from-black/80 to-transparent z-10 pointer-events-none">
        <div className="flex items-center gap-2 text-red-500 font-bold text-xs tracking-widest">
          <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
          LIVE {droneLabel} FPV
        </div>
        <div className="flex items-center gap-2 text-[#00ffcc] text-xs">
          <Radio size={14} className="animate-pulse" />
          LINK: {connectionState.toUpperCase()}
        </div>
      </div>

      {/* Simulated Live Drone Footage - Looping video of terrain from a drone perspective */}
      <video 
        src="https://cdn.pixabay.com/video/2021/04/17/71329-537446549_tiny.mp4" 
        autoPlay 
        loop 
        muted 
        playsInline
        className="w-full h-full object-cover opacity-80 mix-blend-screen"
        style={{ filter: 'grayscale(30%) contrast(120%) brightness(80%) sepia(80%)' }}
      ></video>

      {/* Futuristic Tactical Overlay HUD */}
      <div className="absolute inset-0 z-10 pointer-events-none border-[1px] border-[#00ffcc]/30 m-4 relative">
        <div className="absolute top-0 w-full flex justify-center mt-8">
            <div className="w-[200px] h-[1px] bg-white/20 relative">
                <div className="absolute top-[-4px] left-[50%] w-[1px] h-[8px] bg-[#00ffcc]"></div>
            </div>
        </div>
        
        {/* Crosshair */}
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 opacity-60">
            <div className="w-16 h-[1px] bg-[#00ffcc] absolute top-1/2 -translate-y-1/2 -left-8"></div>
            <div className="w-[1px] h-16 bg-[#00ffcc] absolute left-1/2 -translate-x-1/2 -top-8"></div>
            <div className="w-8 h-8 border border-[#00ffcc] rounded-full absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2"></div>
        </div>
        
        {/* Status bottom corners */}
        <div className="absolute bottom-4 left-4 text-[#00ffcc] font-mono text-[10px]">
          [ ALT: {selectedDrone ? `${selectedDrone.z.toFixed(0)}M` : '--'} ] <br/>
          [ SPD: {selectedDrone ? `${selectedDrone.speed.toFixed(1)} U/S` : '--'} ]
        </div>
        <div className="absolute bottom-4 right-4 text-[#00ffcc] font-mono text-[10px] text-right">
          X: {selectedDrone ? selectedDrone.x.toFixed(2) : '--'} <br/>
          Y: {selectedDrone ? selectedDrone.y.toFixed(2) : '--'}
        </div>

        <div className="absolute top-14 right-4 text-[10px] text-white/70 font-mono text-right">
          HDG {selectedDrone ? `${selectedDrone.heading.toFixed(0)} deg` : '--'} <br />
          BATT {selectedDrone ? `${selectedDrone.battery.toFixed(0)}%` : '--'} <br />
          SIG {selectedDrone ? `${selectedDrone.signalStrength.toFixed(0)}%` : '--'}
        </div>
      </div>
    </div>
  );
}