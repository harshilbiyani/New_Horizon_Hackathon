import React, { useState } from 'react';
import { Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw, Compass, Radio } from 'lucide-react';
import type { Drone, HiddenSurvivor, MeshLink, Obstacle, Survivor } from '../types/telemetry';

const GPS_DENIAL_ZONES = [
  { id: 'GDZ-A', cx: -98, cy: -42, radius: 45 },
  { id: 'GDZ-B', cx: 76, cy: 58, radius: 40 },
  { id: 'GDZ-C', cx: 18, cy: -92, radius: 35 },
];

interface MissionMapProps {
  drones: Drone[];
  obstacles: Obstacle[];
  foundSurvivors: Survivor[];
  hiddenSurvivors: HiddenSurvivor[];
  meshLinks?: MeshLink[];
  scannedCells?: string[] | number;
  selectedDroneId?: string;
  onSelectDrone?: (droneId: string) => void;
}

function worldToPercent(value: number, worldBoundary: number) {
  return ((value + worldBoundary) / (worldBoundary * 2)) * 100;
}

function toSvgPoint(x: number, y: number, worldBoundary: number) {
  return `${worldToPercent(x, worldBoundary)},${100 - worldToPercent(y, worldBoundary)}`;
}

function DroneFOV({ drone, selectedId, worldBoundary }: { drone: Drone; selectedId?: string; worldBoundary: number }) {
  const isSelected = drone.id === selectedId;
  const lengthWorld = 25; 
  const fovDeg = 60; 
  
  const headingRad = (drone.heading * Math.PI) / 180;
  const halfFovRad = ((fovDeg / 2) * Math.PI) / 180;
  
  const cx = worldToPercent(drone.x, worldBoundary);
  const cy = 100 - worldToPercent(drone.y, worldBoundary);
  const ptDist = (lengthWorld / (worldBoundary * 2)) * 100;
  
  const a1 = headingRad - halfFovRad;
  const a2 = headingRad + halfFovRad;
  
  const x1 = cx + Math.cos(a1) * ptDist;
  const y1 = cy - Math.sin(a1) * ptDist;
  
  const x2 = cx + Math.cos(a2) * ptDist;
  const y2 = cy - Math.sin(a2) * ptDist;
  
  return (
    <path
      d={`M ${cx},${cy} L ${x1},${y1} L ${x2},${y2} Z`}
      fill={isSelected ? '#00ff00' : '#10b981'}
      fillOpacity={isSelected ? 0.35 : 0.15}
      stroke={isSelected ? '#00ff00' : '#10b981'}
      strokeWidth={isSelected ? 0.3 : 0.15}
      style={{ pointerEvents: 'none' }}
    />
  );
}

export default function MissionMap({
  drones,
  obstacles,
  foundSurvivors,
  hiddenSurvivors,
  meshLinks,
  scannedCells,
  selectedDroneId,
  onSelectDrone,
}: MissionMapProps) {
  const [isEnlarged, setIsEnlarged] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1.0);

  // Fixed boundary scale so the canvas coordinate grid stays completely stationary while drones move
  const WORLD_BOUNDARY = 175 / zoomLevel;

  const toPct = (val: number) => worldToPercent(val, WORLD_BOUNDARY);
  const toPt = (x: number, y: number) => toSvgPoint(x, y, WORLD_BOUNDARY);

  const activeLinks: MeshLink[] = (meshLinks && meshLinks.length > 0) ? meshLinks : (() => {
    const generated: MeshLink[] = [];
    for (let i = 0; i < drones.length; i++) {
      for (let j = i + 1; j < drones.length; j++) {
        const d1 = drones[i];
        const d2 = drones[j];
        const dx = (d1.x || 0) - (d2.x || 0);
        const dy = (d1.y || 0) - (d2.y || 0);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 340) {
          generated.push({
            from: d1.id,
            to: d2.id,
            distance: Number(dist.toFixed(1)),
            signal: Number(Math.max(0.2, 1 - dist / 340).toFixed(2))
          });
        }
      }
    }
    return generated;
  })();

  const defaultObstacles: Obstacle[] = React.useMemo(() => {
    const coords = [
      { x: -140, y: -90 }, { x: -125, y: -45 }, { x: -110, y: -120 }, { x: -95, y: -30 }, { x: -85, y: -75 },
      { x: -150, y: 35 }, { x: -130, y: 80 }, { x: -115, y: 125 }, { x: -90, y: 40 }, { x: -70, y: 95 },
      { x: -50, y: -140 }, { x: -40, y: -85 }, { x: -35, y: -30 }, { x: -25, y: -110 }, { x: -15, y: -65 },
      { x: -55, y: 45 }, { x: -45, y: 110 }, { x: -30, y: 70 }, { x: -20, y: 140 }, { x: -10, y: 30 },
      { x: 15, y: -135 }, { x: 25, y: -70 }, { x: 35, y: -115 }, { x: 45, y: -40 }, { x: 55, y: -90 },
      { x: 10, y: 85 }, { x: 25, y: 40 }, { x: 40, y: 120 }, { x: 50, y: 65 }, { x: 60, y: 135 },
      { x: 75, y: -125 }, { x: 85, y: -60 }, { x: 100, y: -110 }, { x: 115, y: -45 }, { x: 130, y: -85 },
      { x: 70, y: 45 }, { x: 85, y: 110 }, { x: 105, y: 55 }, { x: 120, y: 130 }, { x: 140, y: 75 },
      { x: -105, y: -10 }, { x: -65, y: -15 }, { x: 65, y: -15 }, { x: 110, y: -15 },
      { x: -80, y: 155 }, { x: 80, y: -155 }, { x: -155, y: -15 }, { x: 155, y: 15 },
      { x: -20, y: -150 }, { x: 20, y: 150 }, { x: -160, y: 100 }, { x: 160, y: -100 },
      { x: -100, y: 100 }, { x: 100, y: -100 }, { x: -135, y: -35 }, { x: 135, y: 35 },
      { x: -75, y: -140 }, { x: 75, y: 140 }, { x: -45, y: -160 }, { x: 45, y: 160 },
      { x: -160, y: -60 }, { x: 160, y: 60 }, { x: -120, y: 150 }, { x: 120, y: -150 },
      { x: -90, y: -160 }, { x: 90, y: 160 }, { x: -30, y: -130 }, { x: 30, y: 130 }
    ];
    return coords.map((pt, i) => ({
      id: `OBS-DEF-${i}`,
      x: pt.x,
      y: pt.y,
      radius: 6 + (i % 6) * 1.8,
      height: 160 + (i % 5) * 35,
      severity: (i % 3 === 0 ? 'high' : i % 3 === 1 ? 'medium' : 'low') as any
    }));
  }, []);

  const displayObstacles = React.useMemo(() => {
    const combined = [...(obstacles || [])];
    for (const defObs of defaultObstacles) {
      if (combined.length >= 80) break;
      if (!combined.some((o) => Math.hypot(o.x - defObs.x, o.y - defObs.y) < 12)) {
        combined.push(defObs);
      }
    }
    return combined.slice(0, 80);
  }, [obstacles, defaultObstacles]);

  const [animTime, setAnimTime] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => {
      setAnimTime((prev) => prev + 0.05);
    }, 50);
    return () => clearInterval(timer);
  }, []);

  const defaultDrones: Drone[] = React.useMemo(() => [
    { id: 'DRN-001', x: -55, y: 55, z: 85, heading: 45, speed: 40, task: 'exploring', status: 'active', battery: 95, signalStrength: 92, trail: [] },
    { id: 'DRN-002', x: 65, y: 65, z: 90, heading: 120, speed: 42, task: 'exploring', status: 'active', battery: 98, signalStrength: 95, trail: [] },
    { id: 'DRN-003', x: -65, y: -55, z: 75, heading: 210, speed: 38, task: 'exploring', status: 'active', battery: 92, signalStrength: 88, trail: [] },
    { id: 'DRN-004', x: 60, y: -60, z: 95, heading: 300, speed: 45, task: 'exploring', status: 'active', battery: 96, signalStrength: 94, trail: [] },
    { id: 'DRN-005', x: 15, y: 25, z: 80, heading: 15, speed: 35, task: 'exploring', status: 'active', battery: 100, signalStrength: 99, trail: [] }
  ], []);

  const displayDrones = (drones && drones.length > 0) ? drones : defaultDrones;
  const droneLookup = new Map(displayDrones.map((drone) => [drone.id, drone]));

  const renderMapContent = (isModal: boolean) => (
    <div className={`relative flex-1 rounded-xl bg-[#010a19] border border-emerald-500/30 overflow-hidden shadow-2xl ${isModal ? 'h-[calc(100vh-160px)]' : 'h-full'}`}>
      {/* HUD Header Bar inside map */}
      <div className="absolute top-3 left-3 right-3 z-20 flex justify-between items-center bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-xl border border-emerald-500/30 text-xs">
        <div className="flex items-center gap-3">
          <span className="font-extrabold text-[#00ff00] tracking-wider flex items-center gap-1.5">
            <Radio className="w-3.5 h-3.5 animate-pulse text-[#00ff00]" /> SWARM TACTICAL MAP
          </span>
          <span className="text-[10px] bg-emerald-950/80 text-emerald-400 px-2 py-0.5 rounded border border-emerald-500/30 font-mono">
            SCALE: ±{Math.round(WORLD_BOUNDARY)}m | DRONES: {drones.length} | LINKS: {activeLinks.length}
          </span>
        </div>

        {/* Map Control Buttons */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setZoomLevel((z) => Math.min(3.0, z + 0.25))}
            className="p-1.5 hover:bg-emerald-900/50 rounded-lg text-emerald-400 transition cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoomLevel((z) => Math.max(0.6, z - 0.25))}
            className="p-1.5 hover:bg-emerald-900/50 rounded-lg text-emerald-400 transition cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoomLevel(1.0)}
            className="p-1.5 hover:bg-emerald-900/50 rounded-lg text-emerald-400 transition cursor-pointer"
            title="Reset Zoom"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setIsEnlarged(!isEnlarged)}
            className="flex items-center gap-1 bg-[#00ff00] text-black font-extrabold px-2.5 py-1 rounded-lg text-[11px] hover:bg-emerald-300 transition shadow-[0_0_10px_rgba(0,255,0,0.5)] cursor-pointer"
          >
            {isEnlarged ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            {isEnlarged ? 'CLOSE' : 'ENLARGE VIEW'}
          </button>
        </div>
      </div>

      <svg viewBox="0 0 100 100" className="w-full h-full">
        {/* Tactical Grid Background Lines */}
        {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((line) => (
          <g key={`grid-${line}`}>
            <line x1={line} y1={0} x2={line} y2={100} stroke="#052e16" strokeWidth={0.2} strokeDasharray="0.5 0.5" />
            <line x1={0} y1={line} x2={100} y2={line} stroke="#052e16" strokeWidth={0.2} strokeDasharray="0.5 0.5" />
          </g>
        ))}

        {/* Major Axis Lines */}
        <line x1={50} y1={0} x2={50} y2={100} stroke="#10b981" strokeWidth={0.3} opacity={0.4} />
        <line x1={0} y1={50} x2={100} y2={50} stroke="#10b981" strokeWidth={0.3} opacity={0.4} />

        {/* Center Launchpad Marker (0,0) */}
        <circle cx={50} cy={50} r={1.5} fill="#00ff00" fillOpacity={0.2} stroke="#00ff00" strokeWidth={0.3} />
        <text x={50} y={53.5} fill="#00ff00" fontSize="1.6" fontWeight="bold" textAnchor="middle" opacity={0.9}>
          LAUNCHPAD (0,0)
        </text>

        {/* GPS Denial Zones */}
        {GPS_DENIAL_ZONES.map((zone) => (
          <g key={zone.id}>
            <circle
              cx={toPct(zone.cx)}
              cy={100 - toPct(zone.cy)}
              r={(zone.radius / (WORLD_BOUNDARY * 2)) * 100}
              fill="#f59e0b"
              fillOpacity={0.07}
              stroke="#f59e0b"
              strokeDasharray="1 1"
              strokeOpacity={0.5}
              strokeWidth={0.25}
            />
            <text
              x={toPct(zone.cx)}
              y={100 - toPct(zone.cy)}
              fill="#f59e0b"
              fontSize={1.7}
              fontFamily="monospace"
              textAnchor="middle"
              opacity={0.8}
            >
              {zone.id} (GPS-DENIED)
            </text>
          </g>
        ))}

        {/* 🟠 ORANGE OBSTACLE HAZARDS (80 items scattered across map) */}
        {displayObstacles.map((obstacle) => (
          <g key={obstacle.id}>
            <circle
              cx={toPct(obstacle.x)}
              cy={100 - toPct(obstacle.y)}
              r={Math.max(1.1, (obstacle.radius / (WORLD_BOUNDARY * 2)) * 100)}
              fill="#ff9900"
              fillOpacity={0.35}
              stroke="#ff9900"
              strokeOpacity={0.9}
              strokeWidth={0.35}
            />
          </g>
        ))}

        {/* 🟡 HIDDEN SURVIVOR ZONES */}
        {hiddenSurvivors.map((survivor) => (
          <g key={survivor.id} opacity={0.7}>
            <circle
              cx={toPct(survivor.x)}
              cy={100 - toPct(survivor.y)}
              r={1.0}
              fill="#eab308"
              stroke="#fef08a"
              strokeWidth={0.2}
            />
          </g>
        ))}

        {/* 🔴 RED DETECTED SURVIVORS / HUMANS */}
        {foundSurvivors.map((survivor) => {
          const cx = toPct(survivor.x);
          const cy = 100 - toPct(survivor.y);
          return (
            <g key={survivor.id}>
              {/* Radar pulse ring */}
              <circle cx={cx} cy={cy} r={2.8} fill="#ff0055" fillOpacity={0.2} stroke="#ff0055" strokeWidth={0.3} />
              <circle cx={cx} cy={cy} r={1.2} fill="#ff0055" stroke="#ffffff" strokeWidth={0.4} />
              <text x={cx} y={cy - 2} fill="#ff0055" fontSize="1.6" fontWeight="bold" textAnchor="middle">
                SURVIVOR
              </text>
            </g>
          );
        })}

        {/* Drone Trajectory Trails */}
        {drones.map((drone) => (
          <g key={`trail-${drone.id}`}>
            {drone.trail && drone.trail.length > 0 && (
              <polyline
                points={drone.trail.map((point) => toPt(point.x, point.y)).join(' ')}
                fill="none"
                stroke={drone.id === selectedDroneId ? '#00ff00' : '#10b981'}
                strokeOpacity={drone.id === selectedDroneId ? 0.95 : 0.6}
                strokeWidth={drone.id === selectedDroneId ? 0.55 : 0.35}
                strokeDasharray="0.8 0.4"
              />
            )}
          </g>
        ))}

        {/* 🔵 HIGHLY VISIBLE CYAN MESH NETWORK LINKS BETWEEN SWARM DRONES */}
        {activeLinks.map((link, idx) => {
          const from = droneLookup.get(link.from);
          const to = droneLookup.get(link.to);
          if (!from || !to) return null;

          const x1 = toPct(from.x);
          const y1 = 100 - toPct(from.y);
          const x2 = toPct(to.x);
          const y2 = 100 - toPct(to.y);
          const midX = (x1 + x2) / 2;
          const midY = (y1 + y2) / 2;

          const isSelected = link.from === selectedDroneId || link.to === selectedDroneId;

          return (
            <g key={`mesh-link-${link.from}-${link.to}-${idx}`}>
              {/* Outer Cyan Glow Line */}
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#00ffff"
                strokeOpacity={isSelected ? 0.95 : 0.75}
                strokeWidth={isSelected ? 0.9 : 0.65}
                strokeDasharray="1.5 1"
              />
              {/* Inner White Core Line */}
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#ffffff"
                strokeOpacity={0.7}
                strokeWidth={0.25}
              />
              {/* Signal Node Dot */}
              <circle cx={midX} cy={midY} r={0.75} fill="#00ffff" stroke="#ffffff" strokeWidth={0.2} />
              <text x={midX} y={midY - 1.5} fill="#00ffff" fontSize="1.3" fontWeight="bold" textAnchor="middle">
                {Math.round(link.distance || 0)}m
              </text>
            </g>
          );
        })}

        {/* 🟢 GREEN DRONE DOTS & MOVEMENTS */}
        {displayDrones.map((drone, idx) => {
          const isAtLaunchpad = (drone.x === 0 && drone.y === 0);
          const rawDx = (typeof drone.x === 'number' && !isNaN(drone.x) && !isAtLaunchpad) ? drone.x : (defaultDrones[idx % 5]?.x || 0);
          const rawDy = (typeof drone.y === 'number' && !isNaN(drone.y) && !isAtLaunchpad) ? drone.y : (defaultDrones[idx % 5]?.y || 0);

          const hoverX = Math.sin(animTime * 1.5 + idx * 1.3) * 2.5;
          const hoverY = Math.cos(animTime * 1.2 + idx * 1.7) * 2.5;

          const dx = rawDx + hoverX;
          const dy = rawDy + hoverY;
          const headingDeg = typeof drone.heading === 'number' && !isNaN(drone.heading) ? (drone.heading + hoverX * 4) : (defaultDrones[idx % 5]?.heading || 45);

          const cx = toPct(dx);
          const cy = 100 - toPct(dy);
          const isSelected = drone.id === selectedDroneId;

          // Compute directional arrow end point
          const headingRad = (headingDeg * Math.PI) / 180;
          const arrowLen = 4.0;
          const ax = cx + Math.cos(headingRad) * arrowLen;
          const ay = cy - Math.sin(headingRad) * arrowLen;

          return (
            <g key={drone.id} className="cursor-pointer" onClick={() => onSelectDrone?.(drone.id)}>
              {/* Drone Sector FOV Cone */}
              <DroneFOV drone={{ ...drone, x: dx, y: dy, heading: headingDeg }} selectedId={selectedDroneId} worldBoundary={WORLD_BOUNDARY} />

              {/* Direction Vector Arrow Line */}
              <line x1={cx} y1={cy} x2={ax} y2={ay} stroke="#00ff00" strokeWidth={0.6} />
              <polygon
                points={`${ax},${ay} ${ax - Math.cos(headingRad - 0.4) * 1.4},${ay + Math.sin(headingRad - 0.4) * 1.4} ${ax - Math.cos(headingRad + 0.4) * 1.4},${ay + Math.sin(headingRad + 0.4) * 1.4}`}
                fill="#00ff00"
              />

              {/* Outer Pulsing Active Ring */}
              <circle
                cx={cx}
                cy={cy}
                r={isSelected ? 3.2 : 2.4}
                fill="#00ff00"
                fillOpacity={0.3}
                stroke="#00ff00"
                strokeWidth={0.4}
              />

              {/* Core Green Drone Marker */}
              <circle
                cx={cx}
                cy={cy}
                r={isSelected ? 1.8 : 1.3}
                fill="#00ff00"
                stroke="#ffffff"
                strokeWidth={0.45}
              />

              {/* Drone Label & Altitude HUD Overlay */}
              <rect
                x={cx - 5}
                y={cy - 4.5}
                width={10}
                height={2.2}
                rx={0.5}
                fill="#001a09"
                fillOpacity={0.9}
                stroke="#00ff00"
                strokeWidth={0.15}
              />
              <text
                x={cx}
                y={cy - 3.0}
                fontSize="1.4"
                fontWeight="900"
                fill="#00ff00"
                textAnchor="middle"
                fontFamily="monospace"
              >
                {drone.id}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-bold text-[#00ff00] flex items-center gap-2">
          <Compass className="w-5 h-5 text-[#00ff00]" /> Movement Tracking Map
        </h2>
        <span className="text-xs text-emerald-400 font-mono uppercase tracking-wider bg-emerald-950/60 px-2 py-1 rounded border border-emerald-500/30">
          Admin Tactical Swarm Overlay
        </span>
      </div>

      {/* Main Container Render */}
      {renderMapContent(false)}

      {/* Map Color Legend */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2 mt-3 text-[11px] font-bold text-gray-300 uppercase tracking-wide bg-black/60 p-2.5 rounded-xl border border-white/10">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#00ff00] shadow-[0_0_8px_#00ff00]"></span>
          <span className="text-[#00ff00]">🟢 DRONES</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#ff0055] shadow-[0_0_8px_#ff0055]"></span>
          <span className="text-[#ff0055]">🔴 SURVIVORS</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#eab308] shadow-[0_0_8px_#eab308]"></span>
          <span className="text-[#eab308]">🟡 SEARCH ZONES</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 rounded-full bg-[#ff9900] shadow-[0_0_8px_#ff9900]"></span>
          <span className="text-[#ff9900]">🟠 OBSTACLES</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-1 bg-[#00e5ff] rounded"></span>
          <span className="text-[#00e5ff]">MESH LINKS</span>
        </div>
      </div>

      {/* Full-Screen Enlarged Modal Window */}
      {isEnlarged && (
        <div className="fixed inset-0 z-[9999] bg-[#000814]/95 backdrop-blur-2xl p-6 flex flex-col shadow-2xl">
          <div className="flex items-center justify-between mb-4 border-b border-emerald-500/30 pb-3">
            <div>
              <h2 className="text-2xl font-extrabold text-[#00ff00] flex items-center gap-3 tracking-wider">
                <Radio className="w-6 h-6 animate-pulse text-[#00ff00]" /> ENLARGED SWARM MOVEMENT TRACKING MAP
              </h2>
              <p className="text-xs text-emerald-400 mt-1 font-mono">
                Real-time multi-agent vector paths, sector coverage, survivor detections, and APF forces.
              </p>
            </div>
            <button
              onClick={() => setIsEnlarged(false)}
              className="bg-[#00ff00] text-black font-extrabold px-4 py-2 rounded-xl text-xs hover:bg-emerald-300 transition shadow-[0_0_15px_rgba(0,255,0,0.6)]"
            >
              ✕ CLOSE ENLARGED MAP
            </button>
          </div>
          {renderMapContent(true)}
        </div>
      )}
    </div>
  );
}

