import type { Drone, HiddenSurvivor, Obstacle, Survivor } from '../types/telemetry';

interface MissionMapProps {
  drones: Drone[];
  obstacles: Obstacle[];
  foundSurvivors: Survivor[];
  hiddenSurvivors: HiddenSurvivor[];
  selectedDroneId?: string;
  onSelectDrone?: (droneId: string) => void;
}

const WORLD_BOUNDARY = 140;

function worldToPercent(value: number) {
  return ((value + WORLD_BOUNDARY) / (WORLD_BOUNDARY * 2)) * 100;
}

function toSvgPoint(x: number, y: number) {
  return `${worldToPercent(x)},${100 - worldToPercent(y)}`;
}

function obstacleColor(severity: Obstacle['severity']) {
  if (severity === 'high') return '#ef4444';
  if (severity === 'medium') return '#f59e0b';
  return '#22c55e';
}

function DroneFOV({ drone, selectedId }: { drone: Drone; selectedId?: string }) {
  const isSelected = drone.id === selectedId;
  const lengthWorld = 20; 
  const fovDeg = 60; 
  
  const headingRad = (drone.heading * Math.PI) / 180;
  const halfFovRad = ((fovDeg / 2) * Math.PI) / 180;
  
  const cx = worldToPercent(drone.x);
  const cy = 100 - worldToPercent(drone.y);
  const ptDist = (lengthWorld / (WORLD_BOUNDARY * 2)) * 100;
  
  const a1 = headingRad - halfFovRad;
  const a2 = headingRad + halfFovRad;
  
  const x1 = cx + Math.cos(a1) * ptDist;
  const y1 = cy - Math.sin(a1) * ptDist;
  
  const x2 = cx + Math.cos(a2) * ptDist;
  const y2 = cy - Math.sin(a2) * ptDist;
  
  return (
    <path
      d={`M ${cx},${cy} L ${x1},${y1} L ${x2},${y2} Z`}
      fill={isSelected ? '#00ffcc' : '#facc15'}
      fillOpacity={isSelected ? 0.3 : 0.1}
      stroke={isSelected ? '#00ffcc' : 'none'}
      strokeWidth={isSelected ? 0.2 : 0}
      style={{ pointerEvents: 'none' }}
    />
  );
}

export default function MissionMap({
  drones,
  obstacles,
  foundSurvivors,
  hiddenSurvivors,
  selectedDroneId,
  onSelectDrone,
}: MissionMapProps) {
  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-300">Movement Tracking Map</h2>
        <span className="text-xs text-gray-500 uppercase tracking-wider">Admin Tactical Overlay</span>
      </div>

      <div className="relative flex-1 rounded-lg bg-[#020714] border border-white/10 overflow-hidden">
        <svg viewBox="0 0 100 100" className="w-full h-full">
          {[10, 20, 30, 40, 50, 60, 70, 80, 90].map((line) => (
            <g key={`grid-${line}`}>
              <line x1={line} y1={0} x2={line} y2={100} stroke="#1f2937" strokeWidth={0.15} />
              <line x1={0} y1={line} x2={100} y2={line} stroke="#1f2937" strokeWidth={0.15} />
            </g>
          ))}

          <line x1={50} y1={0} x2={50} y2={100} stroke="#334155" strokeWidth={0.3} />
          <line x1={0} y1={50} x2={100} y2={50} stroke="#334155" strokeWidth={0.3} />

          {obstacles.map((obstacle) => (
            <circle
              key={obstacle.id}
              cx={worldToPercent(obstacle.x)}
              cy={100 - worldToPercent(obstacle.y)}
              r={(obstacle.radius / (WORLD_BOUNDARY * 2)) * 100}
              fill={obstacleColor(obstacle.severity)}
              fillOpacity={0.18}
              stroke={obstacleColor(obstacle.severity)}
              strokeOpacity={0.8}
              strokeWidth={0.25}
            />
          ))}

          {hiddenSurvivors.map((survivor) => (
            <g key={survivor.id} opacity={0.55}>
              <circle
                cx={worldToPercent(survivor.x)}
                cy={100 - worldToPercent(survivor.y)}
                r={0.7}
                fill="#facc15"
              />
            </g>
          ))}

          {foundSurvivors.slice(0, 24).map((survivor) => (
            <g key={survivor.id}>
              <line
                x1={worldToPercent(survivor.x) - 0.8}
                y1={100 - worldToPercent(survivor.y) - 0.8}
                x2={worldToPercent(survivor.x) + 0.8}
                y2={100 - worldToPercent(survivor.y) + 0.8}
                stroke="#fb7185"
                strokeWidth={0.35}
              />
              <line
                x1={worldToPercent(survivor.x) - 0.8}
                y1={100 - worldToPercent(survivor.y) + 0.8}
                x2={worldToPercent(survivor.x) + 0.8}
                y2={100 - worldToPercent(survivor.y) - 0.8}
                stroke="#fb7185"
                strokeWidth={0.35}
              />
            </g>
          ))}

          {drones.map((drone) => (
            <g key={`trail-${drone.id}`}>
              <polyline
                points={drone.trail.map((point) => toSvgPoint(point.x, point.y)).join(' ')}
                fill="none"
                stroke={drone.id === selectedDroneId ? '#00ffcc' : '#38bdf8'}
                strokeOpacity={drone.id === selectedDroneId ? 0.95 : 0.5}
                strokeWidth={drone.id === selectedDroneId ? 0.45 : 0.25}
              />
            </g>
          ))}

          {drones.map((drone) => (
            <g key={drone.id}>
              <DroneFOV drone={drone} selectedId={selectedDroneId} />
              <circle
                cx={worldToPercent(drone.x)}
                cy={100 - worldToPercent(drone.y)}
                r={drone.id === selectedDroneId ? 1.1 : 0.85}
                fill={drone.status === 'active' ? '#22d3ee' : '#ef4444'}
                stroke={drone.id === selectedDroneId ? '#ffffff' : '#0f172a'}
                strokeWidth={0.25}
                onClick={() => onSelectDrone?.(drone.id)}
                className="cursor-pointer"
              />
              <text
                x={worldToPercent(drone.x) + 1.1}
                y={100 - worldToPercent(drone.y) - 0.9}
                fontSize="1.6"
                fill="#cbd5e1"
              >
                {drone.id}
              </text>
            </g>
          ))}
        </svg>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3 text-[11px] text-gray-400 uppercase tracking-wide">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-cyan-400"></span> Drones
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-rose-400"></span> Detected Survivors
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-yellow-400"></span> Hidden Survivor Zones
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-red-500"></span> High-Risk Obstacles
        </div>
      </div>
    </div>
  );
}
