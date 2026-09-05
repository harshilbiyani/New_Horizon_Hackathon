import { useState } from 'react';

export default function Visualization() {
  const [statusMsg, setStatusMsg] = useState<string>('SIMULATION ACTIVE');

  const handleStart = async () => {
    try {
      await fetch('/api/mission/start', { method: 'POST' });
      setStatusMsg('SIMULATION STARTED');
    } catch (e) {
      setStatusMsg('START FAILED');
    }
  };

  const handlePause = async () => {
    try {
      await fetch('/api/mission/pause', { method: 'POST' });
      setStatusMsg('SIMULATION PAUSED');
    } catch (e) {
      setStatusMsg('PAUSE FAILED');
    }
  };

  const handleReset = async () => {
    try {
      await fetch('/api/mission/reset', { method: 'POST' });
      setStatusMsg('RESET TO LAUNCHPAD (0,0)');
    } catch (e) {
      setStatusMsg('RESET FAILED');
    }
  };

  return (
    <div className="fixed inset-0 w-screen h-screen z-[100] bg-black">
      {/* 
        Embeds 3D visualization scene served by Vite.
      */}
      <iframe
        src="/map/index.html"
        title="Drone Terrain Visualization"
        className="w-full h-full border-none m-0 p-0 block absolute inset-0 bg-transparent"
        style={{ height: '100%', width: '100%', display: 'block', border: 'none' }}
        allowFullScreen
      ></iframe>
      
    </div>
  );
}