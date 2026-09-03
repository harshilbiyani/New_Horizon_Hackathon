import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ConfigProvider } from "./context/ConfigContext";
import Layout from "./components/Layout";
import Home from "./pages/Home";
import Dashboard from "./pages/Dashboard";
import Visualization from "./pages/Visualization";
import XAIDecisions from "./pages/XAIDecisions";
import Replay from "./pages/Replay";
import PersonSearch from "./pages/PersonSearch";

export default function App() {
  return (
    <ConfigProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="map" element={<Visualization />} />
            <Route path="xai" element={<XAIDecisions />} />
            <Route path="replay" element={<Replay />} />
            <Route path="search" element={<PersonSearch />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ConfigProvider>
  );
}
