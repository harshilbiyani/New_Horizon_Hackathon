export default function Visualization() {
  return (
    <div className="flex-1 bg-black relative flex flex-col w-full h-[calc(100vh-64px)]">
      {/* 
        This iframe embeds the exact vanilla JS 'drone-map' we built earlier for 3D visualization. 
        It is being served from the /public/map directory by Vite.
      */}
      <iframe
        src="/map/index.html"
        title="Drone Terrain Visualization"
        className="w-full h-full border-none m-0 p-0 block absolute inset-0 z-0 bg-transparent flex-1"
        style={{ height: '100%', width: '100%', display: 'block', border: 'none' }}
        allowFullScreen
      ></iframe>
    </div>
  );
}