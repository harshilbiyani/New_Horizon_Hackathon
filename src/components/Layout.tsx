import { Outlet, Link, useLocation } from 'react-router-dom';
import { Network, LogOut, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export default function Layout() {
  const location = useLocation();
  const path = location.pathname;
  const { role, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-[#000814] flex flex-col font-sans">
      <nav className="h-16 bg-[#000814] border-b border-white/10 flex items-center justify-between px-6 z-50 sticky top-0 w-full">
        <div className="flex items-center gap-6">
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity mr-4">
            <Network className="text-[#00ffcc]" size={28} />
            <h1 className="text-xl font-bold tracking-widest text-[#00ffcc]">
              DRONE<span className="text-white">SHIELD</span>
            </h1>
          </Link>
          <Link
            to="/home"
            className={`text-sm font-semibold tracking-wide border-b-2 transition-colors pb-1 ${
              path === '/home' ? 'border-[#00ffcc] text-white' : 'border-transparent text-gray-500 hover:text-white'
            }`}
          >
            HOME
          </Link>
          <Link
            to="/dashboard"
            className={`text-sm font-semibold tracking-wide border-b-2 transition-colors pb-1 ${
              path === '/dashboard' ? 'border-[#00ffcc] text-white' : 'border-transparent text-gray-500 hover:text-white'
            }`}
          >
            ADMIN PANEL
          </Link>
          <Link
            to="/map"
            className={`text-sm font-semibold tracking-wide border-b-2 transition-colors pb-1 ${
              path === '/map' ? 'border-[#00ffcc] text-white' : 'border-transparent text-gray-500 hover:text-white'
            }`}
          >
            VISUALIZATION
          </Link>
          <Link
            to="/xai"
            className={`text-sm font-semibold tracking-wide border-b-2 transition-colors pb-1 ${
              path === '/xai' ? 'border-[#00ffcc] text-white' : 'border-transparent text-gray-500 hover:text-white'
            }`}
          >
            XAI MATRIX
          </Link>
          <Link
            to="/replay"
            className={`text-sm font-semibold tracking-wide border-b-2 transition-colors pb-1 ${
              path === '/replay' ? 'border-[#00ffcc] text-white' : 'border-transparent text-gray-500 hover:text-white'
            }`}
          >
            REPLAY
          </Link>
        </div>
        
        <div className="flex items-center gap-4">
          {role && (
            <div className="flex items-center gap-2 text-xs font-bold tracking-widest bg-white/5 border border-white/10 px-3 py-1.5 rounded-full text-[#00ffcc]">
              <User size={14} />
              {role.toUpperCase()}
            </div>
          )}
          <button 
            onClick={signOut}
            className="flex items-center gap-2 text-xs font-bold tracking-widest text-red-400 hover:text-red-300 hover:bg-red-900/20 px-3 py-1.5 rounded transition-colors"
          >
            <LogOut size={14} />
            LOGOUT
          </button>
        </div>
      </nav>
      <main className="flex-grow flex flex-col w-full relative">
        <Outlet />
      </main>
    </div>
  );
}
