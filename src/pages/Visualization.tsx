export default function Visualization() {
  return (
    <div className="fixed inset-0 w-screen h-screen z-[100] bg-black">
      {/* 
        This iframe embeds the exact vanilla JS 'drone-map' we built earlier for 3D visualization. 
        It is being served from the /public/map directory by Vite.
      */}
      <iframe
        src="/map/index.html"
        title="Drone Terrain Visualization"
        className="w-full h-full border-none m-0 p-0 block absolute inset-0 bg-transparent"
        style={{ height: '100%', width: '100%', display: 'block', border: 'none' }}
        allowFullScreen
      ></iframe>
      
      {/* A back button so the user doesn't get trapped in full-screen mode */}
      <button 
        onClick={() => window.history.back()}
        className="absolute top-4 right-4 z-50 px-4 py-2 bg-gray-900/80 text-white rounded-full text-sm font-medium border border-white/10 hover:bg-gray-800 transition-colors backdrop-blur-md"
      >
        ← Exit Simulation
      </button>
    </div>
  );
}