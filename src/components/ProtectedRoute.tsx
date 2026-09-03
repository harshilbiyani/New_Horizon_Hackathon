import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

export default function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-[#000814] flex flex-col items-center justify-center font-sans">
        <div className="w-12 h-12 border-4 border-[#00ffcc] border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-[#00ffcc] font-bold tracking-widest animate-pulse">LOADING SECURE COMMS...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
