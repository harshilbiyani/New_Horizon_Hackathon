import type { ReactNode } from 'react';
import { Activity, Map, Target, Hexagon } from 'lucide-react';

interface StatsProps {
  dronesCount: number;
  coverage: number;
  survivorsCount: number;
  scannedCells: number;
  avgBattery: number;
  avgSignal: number;
  missionTimeSec: number;
}

function formatDuration(seconds: number) {
  const hh = String(Math.floor(seconds / 3600)).padStart(2, '0');
  const mm = String(Math.floor((seconds % 3600) / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}

export default function StatsPanel({
  dronesCount,
  coverage,
  survivorsCount,
  scannedCells,
  avgBattery,
  avgSignal,
  missionTimeSec,
}: StatsProps) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <StatCard
        title="Active Drones"
        value={dronesCount}
        icon={<Activity className="text-[#00ffcc]" />}
        meta={`Signal ${avgSignal.toFixed(0)}%`}
      />
      <StatCard
        title="Area Coverage"
        value={`${coverage}%`}
        icon={<Map className="text-[#00ffcc]" />}
        meta={`Mission ${formatDuration(missionTimeSec)}`}
      />
      <StatCard
        title="Survivors Found"
        value={survivorsCount}
        icon={<Target className="text-[#ff4a1c]" />}
        highlight="text-[#ff4a1c]"
        meta="Confirmed Detections"
      />
      <StatCard
        title="Scanned Cells"
        value={scannedCells}
        icon={<Hexagon className="text-gray-400" />}
        meta={`Avg Battery ${avgBattery.toFixed(0)}%`}
      />
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  highlight = 'text-white',
  meta,
}: {
  title: string;
  value: string | number;
  icon: ReactNode;
  highlight?: string;
  meta?: string;
}) {
  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-4 flex items-center shadow-lg">
      <div className="p-3 bg-black/20 rounded-full mr-4">
        {icon}
      </div>
      <div>
        <div className="text-sm font-medium text-gray-400 uppercase tracking-widest">{title}</div>
        <div className={`text-2xl font-bold ${highlight}`}>{value}</div>
        {meta ? <div className="text-[11px] text-gray-500 uppercase tracking-wide mt-1">{meta}</div> : null}
      </div>
    </div>
  );
}