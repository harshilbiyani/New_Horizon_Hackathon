import type { AiInsights } from '../types/telemetry';

interface AICommandPanelProps {
  aiInsights: AiInsights | null;
}

export default function AICommandPanel({ aiInsights }: AICommandPanelProps) {
  const healthy = aiInsights?.health?.healthy ?? 0;
  const total = aiInsights?.health?.total_drones ?? 0;
  const healthPct = aiInsights?.health?.health_pct ?? 0;
  const topZones = aiInsights?.topZones ?? [];
  const suggestions = aiInsights?.commandSuggestions ?? [];
  const assignments = aiInsights?.assignments ?? [];

  return (
    <div className="bg-white/5 backdrop-blur-md border border-white/10 rounded-xl p-5 min-h-[300px]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-[#00ffcc]">AI Swarm Coordinator</h2>
        <span className="text-[10px] uppercase tracking-[0.15em] text-gray-400">
          {aiInsights?.source ?? 'Awaiting AI bridge'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-3 mb-4 text-xs">
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="text-gray-400 uppercase tracking-wider">Health</div>
          <div className="text-white text-xl font-bold">{healthPct.toFixed(1)}%</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="text-gray-400 uppercase tracking-wider">Online</div>
          <div className="text-white text-xl font-bold">{healthy}/{total}</div>
        </div>
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="text-gray-400 uppercase tracking-wider">Assignments</div>
          <div className="text-white text-xl font-bold">{assignments.length}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 text-xs">
        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="text-gray-300 font-semibold mb-2 uppercase tracking-wider">Top Zones</div>
          <div className="space-y-1.5 max-h-28 overflow-auto pr-1">
            {topZones.length === 0 ? (
              <p className="text-gray-500">No AI zone ranking available yet.</p>
            ) : (
              topZones.map((zone) => (
                <div key={`${zone.zone}-${zone.rank}`} className="flex items-center justify-between text-gray-300">
                  <span>Z{zone.zone} • {zone.label}</span>
                  <span className="text-[#00ffcc] font-semibold">{zone.score.toFixed(2)}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="text-gray-300 font-semibold mb-2 uppercase tracking-wider">Command Queue</div>
          <div className="space-y-1.5 max-h-28 overflow-auto pr-1">
            {suggestions.length === 0 ? (
              <p className="text-gray-500">No command suggestion yet.</p>
            ) : (
              suggestions.map((suggestion) => (
                <div key={suggestion} className="text-[#ffb4a2]">{suggestion}</div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
