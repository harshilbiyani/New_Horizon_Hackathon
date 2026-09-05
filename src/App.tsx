import { useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ConfigProvider } from "./context/ConfigContext";
import { AuthProvider } from "./context/AuthContext";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Visualization from "./pages/Visualization";
import XAIDecisions from "./pages/XAIDecisions";
import Replay from "./pages/Replay";
import PersonSearch from "./pages/PersonSearch";
import OpeningVideo from "./components/OpeningVideo";

export default function App() {
  const [showIntro, setShowIntro] = useState<boolean>(true);

  return (
    <AuthProvider>
      <ConfigProvider>
        {showIntro && (
          <OpeningVideo onComplete={() => setShowIntro(false)} autoCloseOnEnd={true} />
        )}
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />

            {/* Protected Routes */}
            <Route element={<ProtectedRoute />}>
              <Route path="/" element={<Layout onReplayIntro={() => setShowIntro(true)} />}>
                <Route index element={<Navigate to="/dashboard" replace />} />
                <Route path="home" element={<Home />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="map" element={<Visualization />} />
                <Route path="xai" element={<XAIDecisions />} />
                <Route path="replay" element={<Replay />} />
                <Route path="search" element={<PersonSearch />} />
              </Route>
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/login" replace />} />
          </Routes>
        </BrowserRouter>
      </ConfigProvider>
    </AuthProvider>
  );
}
