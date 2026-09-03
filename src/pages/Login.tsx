import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GoogleAuthProvider, signInWithPopup } from 'firebase/auth';
import { auth } from '../firebase/config';
import { useAuth } from '../context/AuthContext';
import { Network, ShieldAlert, Shield } from 'lucide-react';
import { motion } from 'framer-motion';

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
      // Fallback for local offline demo or unconfigured Firebase credentials
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
      {/* Background decorations */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#00ffcc] opacity-[0.03] rounded-full blur-3xl pointer-events-none"></div>

      <motion.div 
        initial={{ y: -30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6 }}
        className="flex flex-col items-center mb-16 z-10"
      >
        <Network className="text-[#00ffcc] mb-4" size={64} />
        <h1 className="text-4xl md:text-5xl font-bold tracking-[0.2em] text-[#00ffcc]">
          DRONE<span className="text-white">SHIELD</span>
        </h1>
        <p className="text-gray-400 mt-4 tracking-wide text-sm md:text-base">
          TACTICAL SWARM INTELLIGENCE
        </p>
      </motion.div>

      <motion.div 
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.6, delay: 0.2 }}
        className="w-full max-w-4xl z-10"
      >
        <h2 className="text-2xl text-white font-semibold mb-8 text-center tracking-wide">
          WHAT IS YOUR ROLE?
        </h2>
        
        {error && (
          <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded mb-6 text-center max-w-md mx-auto">
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
            className={`flex flex-col items-center justify-center p-10 rounded-2xl border transition-all duration-300 ${
              selectedRole === 'Rescue Team' 
                ? 'bg-[#00ffcc]/20 border-[#00ffcc]' 
                : 'bg-white/5 border-white/10 hover:border-[#00ffcc]/50 hover:bg-white/10'
            }`}
          >
            <div className="w-20 h-20 rounded-full bg-blue-500/20 flex items-center justify-center mb-6">
              <ShieldAlert className="text-blue-400" size={40} />
            </div>
            <h3 className="text-2xl text-white font-bold tracking-wider mb-2">RESCUE TEAM</h3>
            <p className="text-gray-400 text-center text-sm">
              Search and rescue operations, medical supply delivery, and survivor detection.
            </p>
            {selectedRole === 'Rescue Team' && (
              <div className="mt-6 text-[#00ffcc] text-sm font-semibold tracking-wider animate-pulse">
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
            className={`flex flex-col items-center justify-center p-10 rounded-2xl border transition-all duration-300 ${
              selectedRole === 'Defence Agencies' 
                ? 'bg-[#00ffcc]/20 border-[#00ffcc]' 
                : 'bg-white/5 border-white/10 hover:border-[#00ffcc]/50 hover:bg-white/10'
            }`}
          >
            <div className="w-20 h-20 rounded-full bg-purple-500/20 flex items-center justify-center mb-6">
              <Shield className="text-purple-400" size={40} />
            </div>
            <h3 className="text-2xl text-white font-bold tracking-wider mb-2">DEFENCE AGENCIES</h3>
            <p className="text-gray-400 text-center text-sm">
              Tactical operations, secure perimeter monitoring, and anti-jamming networks.
            </p>
            {selectedRole === 'Defence Agencies' && (
              <div className="mt-6 text-[#00ffcc] text-sm font-semibold tracking-wider animate-pulse">
                AUTHENTICATING...
              </div>
            )}
          </motion.button>
        </div>

        <div className="mt-8 flex justify-center">
          <button
            id="demo-bypass-btn"
            onClick={handleDemoAccess}
            className="text-xs text-gray-500 hover:text-[#00ffcc] tracking-widest uppercase transition-colors py-2 px-4 rounded-lg border border-white/5 hover:border-[#00ffcc]/30 bg-white/[0.02]"
          >
            ⚡ Enter as Tactical Guest (Offline / Demo Mode)
          </button>
        </div>
      </motion.div>
    </div>
  );
}
