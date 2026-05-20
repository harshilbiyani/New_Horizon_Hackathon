import { Outlet, Link, useLocation } from 'react-router-dom';
import { Network } from 'lucide-react';

export default function Layout() {
  const location = useLocation();
  const path = location.pathname;

  return (
    <div className="min-h-screen bg-[#000814] flex flex-col font-sans">
      <nav className="h-16 bg-[#000814] border-b border-white/10 flex items-center justify-between px-6 z-50 sticky top-0 w-full">
        <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
          <Network className="text-[#00ffcc]" size={28} />
          <h1 className="text-xl font-bold tracking-widest text-[#00ffcc]">
            DRONE<span className="text-white">SHIELD</span>
          </h1>
        </Link>
        <div className="flex items-center gap-6">
          <Link
            to="/"
            className={`text-sm font-semibold tracking-wide border-b-2 transition-colors pb-1 ${
              path === '/' ? 'border-[#00ffcc] text-white' : 'border-transparent text-gray-500 hover:text-white'
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
        </div>
      </nav>
      <main className="flex-grow flex flex-col w-full relative">
        <Outlet />
      </main>
    </div>
  );
}
