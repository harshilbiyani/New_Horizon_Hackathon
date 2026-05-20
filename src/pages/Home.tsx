import { Link } from 'react-router-dom';
import { Hexagon, ShieldAlert, Activity } from 'lucide-react';

export default function Home() {
  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#000814] text-white flex justify-center items-center p-6 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]">
      <div className="max-w-4xl text-center space-y-8">
        
        <div className="inline-flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-full text-sm font-medium text-gray-300">
          <span className="w-2 h-2 rounded-full bg-[#00ffcc] animate-pulse"></span>
          NEW HORIZON HACKATHON 2026
        </div>

        <h1 className="text-5xl md:text-7xl font-extrabold tracking-tight">
          ADVANCED <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00ffcc] to-[#0055ff]">TACTICAL</span> <br/>
          FLOOD RESCUE
        </h1>

        <p className="text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
          Real-time AI-powered drone swarm telemetry and coordination for rapid disaster response, ensuring seamless mapping and survivor detection.
        </p>

        <div className="flex flex-col sm:flex-row justify-center items-center gap-6 pt-8">
          <Link to="/dashboard" className="w-full sm:w-auto px-8 py-4 bg-[#00ffcc]/10 hover:bg-[#00ffcc]/20 border border-[#00ffcc]/50 rounded-lg text-[#00ffcc] font-semibold tracking-wider flex items-center justify-center gap-3 transition-all group">
            <Activity className="group-hover:scale-110 transition-transform" />
            COMMAND CENTER
          </Link>
          
          <Link to="/map" className="w-full sm:w-auto px-8 py-4 bg-white/5 hover:bg-white/10 border border-white/20 rounded-lg text-white font-semibold tracking-wider flex items-center justify-center gap-3 transition-all group">
            <Hexagon className="group-hover:scale-110 transition-transform" />
            3D VISUALIZATION
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-16">
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