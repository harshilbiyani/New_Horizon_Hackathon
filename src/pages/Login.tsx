import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { ShieldAlert, Shield } from 'lucide-react';
import { motion } from 'framer-motion';
import DroneSwarmBackground from '../components/DroneSwarmBackground';

export default function Login() {
  const [error, setError] = useState<string | null>(null);
  const [selectedRole, setSelectedRoleState] = useState<string | null>(null);
  const { setRole, signInAsDemo } = useAuth();
  const navigate = useNavigate();

  const handleRoleSelection = async (role: string) => {
    setError(null);
    setSelectedRoleState(role);

    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
      setRole(role);
      navigate('/dashboard');
    } catch (err: any) {
      console.warn("Google Auth popup failed, falling back to local demo operator mode:", err);
      signInAsDemo(role);
      navigate('/dashboard');
    }
  };

  const handleDemoAccess = () => {
    signInAsDemo('Tactical Commander');
    navigate('/dashboard');
  };

  return (
    <div className="min-h-screen bg-[#000814] flex flex-col items-center justify-center p-6 font-sans relative overflow-hidden">
      {/* Animated Hovering Drone Swarm Background */}
      <DroneSwarmBackground />

      <motion.div
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="flex flex-col items-center mb-12 z-10 text-center"
      >
        {/* Official Drone Shield Logo */}
        <img
          src="/logo.png"
          alt="Drone Shield Official Logo"
          className="h-20 md:h-24 w-auto mb-4 object-contain filter drop-shadow-[0_0_25px_#00ffcc]"
        />

        <h1 className="text-4xl md:text-5xl font-extrabold tracking-[0.22em] text-transparent bg-clip-text bg-gradient-to-r from-[#00ffcc] via-white to-[#00e5ff] drop-shadow-[0_0_20px_rgba(0,255,204,0.9)] uppercase font-sans">
          DRONE SHIELD
        </h1>

        <p className="text-cyan-300 mt-2 tracking-[0.3em] font-mono font-bold text-xs md:text-sm uppercase drop-shadow-[0_0_8px_#00ffcc]">
          TACTICAL SWARM INTELLIGENCE & DEFENSE MATRIX
        </p>
      </motion.div>

      <motion.div
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="w-full max-w-4xl z-10"
      >
        <h2 className="text-2xl text-white font-extrabold mb-8 text-center tracking-[0.2em] font-mono uppercase text-[#00ffcc] drop-shadow-[0_0_10px_rgba(0,255,204,0.5)]">
          WHAT IS YOUR ROLE?
        </h2>

        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded mb-6 text-center max-w-md mx-auto font-mono text-xs">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Rescue Team Card */}
          <motion.button
            whileHover={{ scale: 1.03, translateY: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleRoleSelection('Rescue Team')}
            disabled={selectedRole !== null}
            className={`flex flex-col items-center justify-center p-10 rounded-2xl border backdrop-blur-md transition-all duration-300 shadow-2xl cursor-pointer ${selectedRole === 'Rescue Team'
                ? 'bg-[#00ffcc]/20 border-[#00ffcc] shadow-[0_0_30px_rgba(0,255,204,0.4)]'
                : 'bg-black/60 border-white/10 hover:border-[#00ffcc]/60 hover:bg-black/80'
              }`}
          >
            <div className="w-20 h-20 rounded-full bg-blue-500/20 flex items-center justify-center mb-6 border border-blue-400/30">
              <ShieldAlert className="text-blue-400" size={40} />
            </div>
            <h3 className="text-2xl text-white font-extrabold tracking-wider mb-2 font-sans">RESCUE TEAM</h3>
            <p className="text-gray-400 text-center text-sm font-sans">
              Search and rescue operations, medical supply delivery, and survivor detection.
            </p>
            {selectedRole === 'Rescue Team' && (
              <div className="mt-6 text-[#00ffcc] text-sm font-mono font-bold tracking-wider animate-pulse">
                AUTHENTICATING...
              </div>
            )}
          </motion.button>

          {/* Defence Agencies Card */}
          <motion.button
            whileHover={{ scale: 1.03, translateY: -5 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => handleRoleSelection('Defence Agencies')}
            disabled={selectedRole !== null}
            className={`flex flex-col items-center justify-center p-10 rounded-2xl border backdrop-blur-md transition-all duration-300 shadow-2xl cursor-pointer ${selectedRole === 'Defence Agencies'
                ? 'bg-[#00ffcc]/20 border-[#00ffcc] shadow-[0_0_30px_rgba(0,255,204,0.4)]'
                : 'bg-black/60 border-white/10 hover:border-[#00ffcc]/60 hover:bg-black/80'
              }`}
          >
            <div className="w-20 h-20 rounded-full bg-purple-500/20 flex items-center justify-center mb-6 border border-purple-400/30">
              <Shield className="text-purple-400" size={40} />
            </div>
            <h3 className="text-2xl text-white font-extrabold tracking-wider mb-2 font-sans">DEFENCE AGENCIES</h3>
            <p className="text-gray-400 text-center text-sm font-sans">
              Tactical operations, secure perimeter monitoring, and anti-jamming networks.
            </p>
            {selectedRole === 'Defence Agencies' && (
              <div className="mt-6 text-[#00ffcc] text-sm font-mono font-bold tracking-wider animate-pulse">
                AUTHENTICATING...
              </div>
            )}
          </motion.button>
        </div>

        <div className="mt-8 flex justify-center">
          <button
            id="demo-bypass-btn"
            onClick={handleDemoAccess}
            className="text-xs text-gray-400 hover:text-[#00ffcc] tracking-widest uppercase transition-colors py-2.5 px-5 rounded-full border border-white/10 hover:border-[#00ffcc]/50 bg-black/70 backdrop-blur-md font-mono font-bold shadow-lg"
          >
            ⚡ Enter as Tactical Guest (Offline / Demo Mode)
          </button>
        </div>
      </motion.div>
    </div>
  );
}
