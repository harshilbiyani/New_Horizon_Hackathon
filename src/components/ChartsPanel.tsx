import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import type { Drone } from '../types/telemetry';

interface ChartsProps {
  historyData: { time: string; coverage: number }[];
  batteryHistory: { time: string; battery: number }[];
  drones: Drone[];
}

export default function ChartsPanel({ historyData, batteryHistory, drones }: ChartsProps) {
  // Compute summary for drones task allocation
  const exploring = drones.filter(d => d.task === 'exploring').length;
  const returning = drones.filter(d => d.task === 'returning').length;
  const idle = drones.filter(d => d.task === 'idle').length;

  return (
    <div className="flex-1 bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5 flex flex-col gap-4 overflow-hidden h-full">
      <h2 className="text-lg font-semibold text-gray-300">Coverage & Battery Analysis</h2>
      
      {/* Search Area Coverage Chart */}
      <div className="min-h-[120px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={historyData.length > 0 ? historyData : [{ time: '0', coverage: 0 }]} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorCover" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00ffcc" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#00ffcc" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="time" stroke="#ffffff44" tick={{ fontSize: 10, fill: '#888' }} />
            <YAxis stroke="#ffffff44" tick={{ fontSize: 10, fill: '#888' }} domain={[0, 100]} />
            <Tooltip 
              contentStyle={{ backgroundColor: '#000814', borderColor: '#00ffcc33', color: '#00ffcc', fontSize: '12px' }}
              itemStyle={{ color: '#00ffcc' }}
            />
            <Area type="monotone" dataKey="coverage" stroke="#00ffcc" fillOpacity={1} fill="url(#colorCover)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Battery trend chart */}
      <div className="min-h-[100px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={batteryHistory.length > 0 ? batteryHistory : [{ time: '0', battery: 0 }]} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorBattery" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#f97316" stopOpacity={0.7}/>
                <stop offset="95%" stopColor="#f97316" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <XAxis dataKey="time" stroke="#ffffff44" tick={{ fontSize: 10, fill: '#888' }} hide />
            <YAxis stroke="#ffffff44" tick={{ fontSize: 10, fill: '#888' }} domain={[0, 100]} hide />
            <Tooltip
              contentStyle={{ backgroundColor: '#000814', borderColor: '#f9731633', color: '#f97316', fontSize: '12px' }}
              itemStyle={{ color: '#f97316' }}
            />
            <Area type="monotone" dataKey="battery" stroke="#f97316" fillOpacity={1} fill="url(#colorBattery)" isAnimationActive={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Allocation Infographics */}
      <div className="mt-2 text-sm">
        <h3 className="text-gray-400 font-semibold mb-2">Fleet Allocation</h3>
        <div className="w-full bg-white/10 rounded-full h-3 flex overflow-hidden">
           {drones.length > 0 && (
             <>
               <div style={{ width: `${(exploring / drones.length) * 100}%` }} className="bg-[#00ffcc]" title={`Exploring: ${exploring}`}></div>
               <div style={{ width: `${(idle / drones.length) * 100}%` }} className="bg-yellow-400" title={`Idle: ${idle}`}></div>
               <div style={{ width: `${(returning / drones.length) * 100}%` }} className="bg-red-500" title={`Returning: ${returning}`}></div>
             </>
           )}
        </div>
        <div className="flex justify-between text-xs text-gray-500 mt-2">
            <div><span className="inline-block w-2 h-2 bg-[#00ffcc] mr-1"></span>Explore {exploring}</div>
            <div><span className="inline-block w-2 h-2 bg-yellow-400 mr-1"></span>Idle {idle}</div>
            <div><span className="inline-block w-2 h-2 bg-red-500 mr-1"></span>Return {returning}</div>
        </div>
      </div>
    </div>
  );
}