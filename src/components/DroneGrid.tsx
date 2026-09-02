import type { Drone } from '../types/telemetry';

interface DroneGridProps {
  drones: Drone[];
  selectedDroneId?: string;
  onSelectDrone?: (droneId: string) => void;
}

export default function DroneGrid({ drones, selectedDroneId, onSelectDrone }: DroneGridProps) {
  return (
    <div className="flex-1 overflow-auto rounded-md shadow-inner bg-black/40">
      <table className="w-full text-left text-sm text-gray-300">
        <thead className="text-xs text-gray-400 uppercase bg-white/5 sticky top-0 backdrop-blur-md">
          <tr>
            <th className="px-4 py-3">Drone ID</th>
            <th className="px-4 py-3">Coordinates</th>
            <th className="px-4 py-3">Vector</th>
            <th className="px-4 py-3">GPS Lock / Nav</th>
            <th className="px-4 py-3">Mesh Relay Chain</th>
            <th className="px-4 py-3">Status</th>
            <th className="px-4 py-3">Battery</th>
            <th className="px-4 py-3">Signal</th>
          </tr>
        </thead>
        <tbody>
          {drones.map((drone) => {
            const isDeadReckoning = drone.gpsMode === 'dead-reckoning';
            const uncertainty = drone.positionUncertainty || 0;
            const relayPath = drone.relayPath;

            return (
              <tr
                key={drone.id}
                onClick={() => onSelectDrone?.(drone.id)}
                className={`border-b border-white/5 transition-colors cursor-pointer ${
                  selectedDroneId === drone.id ? 'bg-[#00ffcc]/10' : 'hover:bg-white/5'
                }`}
              >
                <td className="px-4 py-3 font-mono text-[#00ffcc] font-bold">{drone.id}</td>
                <td className="px-4 py-3 font-mono text-xs">
                  [{drone.x.toFixed(1)}, {drone.y.toFixed(1)}, {drone.z.toFixed(0)}m]
                </td>
                <td className="px-4 py-3">
                  <div className="font-mono text-xs text-gray-300">{drone.heading.toFixed(0)}°</div>
                  <div className="text-xs text-gray-500 capitalize">{drone.task} | {drone.speed.toFixed(1)} u/s</div>
                </td>
                {/* GPS / Dead-Reckoning column */}
                <td className="px-4 py-3">
                  {isDeadReckoning ? (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse">
                      DEAD-RECKONING (±{uncertainty.toFixed(1)}m)
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      GPS (LOCKED)
                    </span>
                  )}
                </td>
                {/* Mesh Relay Path column */}
                <td className="px-4 py-3 font-mono text-xs">
                  {relayPath === null || relayPath === undefined ? (
                    <span className="inline-flex items-center gap-1 text-red-400 bg-red-500/10 px-2 py-0.5 rounded text-[11px] border border-red-500/20">
                      UNREACHABLE (QUEUED)
                    </span>
                  ) : Array.isArray(relayPath) && relayPath.length > 0 ? (
                    <span className="inline-flex items-center gap-1 text-cyan-300 bg-cyan-500/10 px-2 py-0.5 rounded text-[11px] border border-cyan-500/20">
                      {relayPath.join(' ➔ ')}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 text-gray-400 text-[11px]">
                      DIRECT ➔ BASE
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {drone.status === 'active' ? (
                    <span className="flex items-center gap-2 text-green-400">
                      <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span> Active
                    </span>
                  ) : (
                    <span className="flex items-center gap-2 text-red-500">
                      <span className="w-2 h-2 rounded-full bg-red-500"></span> Failed
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="w-full bg-gray-700 rounded-full h-2.5 max-w-[80px]">
                    <div
                      className={`h-2.5 rounded-full ${drone.battery > 50 ? 'bg-green-500' : drone.battery > 20 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${drone.battery}%` }}
                    ></div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="w-full bg-gray-700 rounded-full h-2.5 max-w-[80px]">
                    <div
                      className={`h-2.5 rounded-full ${drone.signalStrength > 70 ? 'bg-cyan-400' : drone.signalStrength > 45 ? 'bg-yellow-500' : 'bg-red-500'}`}
                      style={{ width: `${drone.signalStrength}%` }}
                    ></div>
                  </div>
                </td>
              </tr>
            );
          })}
          {drones.length === 0 && (
            <tr>
              <td colSpan={8} className="px-4 py-8 text-center text-gray-500">No active drones connected.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}