import { Outlet, Link, useLocation } from 'react-router-dom';
import { LogOut, User, Film } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface LayoutProps {
  onReplayIntro?: () => void;
}

export default function Layout({ onReplayIntro }: LayoutProps) {
  const location = useLocation();
  const path = location.pathname;
  const { role, signOut } = useAuth();

  const navItems = [
    { label: 'HOME', to: '/home' },
    { label: 'ADMIN PANEL', to: '/dashboard' },
    { label: 'VISUALIZATION', to: '/map' },
    { label: 'XAI MATRIX', to: '/xai' },
    { label: 'REPLAY', to: '/replay' },
    { label: 'PERSON SEARCH', to: '/search' },
  ];

  return (
    <div className="min-h-screen bg-[#000814] flex flex-col font-sans">
      <header className="h-16 bg-[#000814] border-b border-white/10 flex items-center justify-between px-4 md:px-8 z-50 sticky top-0 w-full shadow-lg">
        {/* Left: Brand Logo */}
        <div className="flex items-center shrink-0 pr-4">
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <img src="/logo.png" alt="Drone Shield Logo" className="h-9 w-auto object-contain drop-shadow-[0_0_8px_rgba(0,255,204,0.5)]" />
            <h1 className="text-lg md:text-xl font-extrabold tracking-widest text-[#00ffcc] hidden sm:block">
              DRONE<span className="text-white">SHIELD</span>
            </h1>
          </Link>
        </div>

        {/* Center: Navigation Options (Single Row, No Wrap) */}
        <nav className="flex items-center justify-center gap-1.5 md:gap-3 flex-nowrap overflow-x-auto py-1 no-scrollbar">
          {navItems.map((item) => {
            const isActive = path === item.to;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`whitespace-nowrap text-xs font-extrabold tracking-wider px-3.5 py-1.5 rounded-full transition-all duration-300 shrink-0 ${isActive
                    ? 'bg-white text-blue-600 shadow-[0_0_15px_rgba(255,255,255,0.4)] scale-105'
                    : 'bg-transparent text-gray-400 hover:text-white hover:bg-white/10'
                  }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Right: User Status / Replay / Logout */}
        <div className="flex items-center justify-end gap-2 md:gap-3 shrink-0 pl-4">
          {onReplayIntro && (
            <button
              onClick={onReplayIntro}
              className="flex items-center gap-1.5 text-xs font-bold tracking-wider text-[#00ffcc] bg-[#00ffcc]/10 hover:bg-[#00ffcc]/20 border border-[#00ffcc]/30 px-3 py-1.5 rounded-full transition-all duration-300 shadow-[0_0_10px_rgba(0,255,204,0.2)] shrink-0"
              title="Watch Opening Reveal Video"
            >
              <Film size={14} />
              <span className="hidden lg:inline">INTRO REVEAL</span>
            </button>
          )}

          {role && (
            <div className="flex items-center gap-1.5 text-xs font-bold tracking-widest bg-white/5 border border-white/10 px-3 py-1.5 rounded-full text-[#00ffcc] shrink-0">
              <User size={14} />
              <span className="hidden md:inline">{role.toUpperCase()}</span>
            </div>
          )}
          <button
            onClick={signOut}
            className="flex items-center gap-1.5 text-xs font-bold tracking-widest text-red-400 hover:text-red-300 hover:bg-red-900/20 px-3 py-1.5 rounded transition-colors shrink-0"
          >
            <LogOut size={14} />
            <span className="hidden md:inline">LOGOUT</span>
          </button>
        </div>
      </header>

      <main className="flex-grow flex flex-col w-full relative">
        <Outlet />
      </main>
    </div>
  );
}
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
            className={`text-sm font-semibold tracking-wide border-b-2 transition-colors pb-1 ${path === '/home' ? 'border-[#00ffcc] text-white' : 'border-transparent text-gray-500 hover:text-white'
              }`}
          >
            HOME
          </Link>
          <Link
            to="/dashboard"
            className={`text-sm font-semibold tracking-wide border-b-2 transition-colors pb-1 ${path === '/dashboard' ? 'border-[#00ffcc] text-white' : 'border-transparent text-gray-500 hover:text-white'
              }`}
          >
            ADMIN PANEL
          </Link>
          <Link
            to="/map"
            className={`text-sm font-semibold tracking-wide border-b-2 transition-colors pb-1 ${path === '/map' ? 'border-[#00ffcc] text-white' : 'border-transparent text-gray-500 hover:text-white'
              }`}
          >
            VISUALIZATION
          </Link>
          <Link
            to="/xai"
            className={`text-sm font-semibold tracking-wide border-b-2 transition-colors pb-1 ${path === '/xai' ? 'border-[#00ffcc] text-white' : 'border-transparent text-gray-500 hover:text-white'
              }`}
          >
            XAI MATRIX
          </Link>
          <Link
            to="/replay"
            className={`text-sm font-semibold tracking-wide border-b-2 transition-colors pb-1 ${path === '/replay' ? 'border-[#00ffcc] text-white' : 'border-transparent text-gray-500 hover:text-white'
              }`}
          >
            REPLAY
          </Link>
          <Link
            to="/search"
            className={`text-sm font-semibold tracking-wide border-b-2 transition-colors pb-1 ${path === '/search' ? 'border-[#00ffcc] text-white' : 'border-transparent text-gray-500 hover:text-white'
              }`}
          >
            PERSON SEARCH
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
