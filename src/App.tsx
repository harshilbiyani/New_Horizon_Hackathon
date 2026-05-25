import { BrowserRouter, Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Visualization from "./pages/Visualization";
import MissionControl from "./pages/MissionControl";
import XAIDecisions from "./pages/XAIDecisions";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Home />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="map" element={<Visualization />} />
          <Route path="mission-control" element={<MissionControl />} />
          <Route path="xai" element={<XAIDecisions />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
