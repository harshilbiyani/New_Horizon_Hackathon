import { useMemo, useState, useRef, useCallback } from 'react';
import { Clock, Filter, X } from 'lucide-react';
import type { Detection } from '../types/telemetry';

interface TimeRange {
  start: string; // ISO8601
  end: string;   // ISO8601
}

interface Props {
  detections: Detection[];
  onTimeRangeChange: (range: TimeRange | null) => void;
  activeRange: TimeRange | null;
}

function confidenceColor(c: number): string {
  if (c >= 0.8) return '#00ffcc';
  if (c >= 0.5) return '#fbbf24';
  return '#ef4444';
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString('en-US', {
      hour12: false, hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export default function DetectionTimeline({ detections, onTimeRangeChange, activeRange }: Props) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const railRef = useRef<HTMLDivElement>(null);

  // Sort by timestamp
  const sorted = useMemo(
    () => [...detections].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
    [detections]
  );

  const minTs = useMemo(() => (sorted[0]?.timestamp ? new Date(sorted[0].timestamp).getTime() : Date.now() - 3600000), [sorted]);
  const maxTs = useMemo(() => (sorted.at(-1)?.timestamp ? new Date(sorted.at(-1)!.timestamp).getTime() : Date.now()), [sorted]);
  const span = Math.max(maxTs - minTs, 1);

  const toPct = (iso: string) => ((new Date(iso).getTime() - minTs) / span) * 100;

  // Handle rail click to set brush range
  const handleRailClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!railRef.current || sorted.length === 0) return;
      const rect = railRef.current.getBoundingClientRect();
      const pct = ((e.clientX - rect.left) / rect.width) * 100;
      const ts = new Date(minTs + (pct / 100) * span).toISOString();

      if (!activeRange) {
        onTimeRangeChange({ start: ts, end: ts });
      } else {
        // Extend or move range
        const startDist = Math.abs(toPct(activeRange.start) - pct);
        const endDist = Math.abs(toPct(activeRange.end) - pct);
        if (startDist < endDist) {
          onTimeRangeChange({ ...activeRange, start: ts });
        } else {
          onTimeRangeChange({ ...activeRange, end: ts });
        }
      }
    },
    [activeRange, minTs, span, sorted, onTimeRangeChange, toPct]
  );

  const clearRange = useCallback(() => {
    onTimeRangeChange(null);
  }, [onTimeRangeChange]);

  if (sorted.length === 0) return null;

  const startPct = activeRange ? toPct(activeRange.start) : null;
  const endPct = activeRange ? toPct(activeRange.end) : null;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Clock size={14} className="text-[#00ffcc]/70" />
          DETECTION TIMELINE
          <span className="text-xs font-normal text-gray-500 ml-1">
            {sorted.length} frame{sorted.length !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {activeRange && (
            <>
              <span className="text-xs text-[#00ffcc] bg-[#00ffcc]/10 border border-[#00ffcc]/20 px-2.5 py-1 rounded-full flex items-center gap-1.5">
                <Filter size={10} />
                {formatTime(activeRange.start)} – {formatTime(activeRange.end)}
              </span>
              <button
                id="timeline-clear-btn"
                onClick={clearRange}
                className="text-xs text-gray-500 hover:text-white transition-colors flex items-center gap-1"
              >
                <X size={12} /> Clear filter
              </button>
            </>
          )}
          {!activeRange && (
            <span className="text-[11px] text-gray-600">Click to set time filter</span>
          )}
        </div>
      </div>

      {/* Timeline rail */}
      <div className="relative h-14 flex flex-col justify-center">
        {/* Rail background */}
        <div
          ref={railRef}
          onClick={handleRailClick}
          className="relative h-1.5 bg-white/10 rounded-full cursor-crosshair mx-2"
        >
          {/* Brush highlight */}
          {startPct !== null && endPct !== null && (
            <div
              className="absolute top-0 h-full rounded-full bg-[#00ffcc]/25 border-x border-[#00ffcc]/60"
              style={{
                left: `${Math.min(startPct, endPct)}%`,
                width: `${Math.abs(endPct - startPct)}%`,
              }}
            />
          )}

          {/* Detection dots */}
          {sorted.map((det, i) => {
            const pct = toPct(det.timestamp);
            const isHovered = hoveredIdx === i;
            const color = confidenceColor(det.confidence);
            const inRange =
              !activeRange ||
              (det.timestamp >= activeRange.start && det.timestamp <= activeRange.end);

            return (
              <div
                key={det.id}
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 cursor-pointer group"
                style={{ left: `${pct}%` }}
                onMouseEnter={() => setHoveredIdx(i)}
                onMouseLeave={() => setHoveredIdx(null)}
              >
                {/* Dot */}
                <div
                  className={`w-3 h-3 rounded-full border-2 border-[#000814] transition-all duration-200 ${
                    isHovered ? 'scale-150 ring-2 ring-white/30' : inRange ? 'scale-100' : 'scale-75 opacity-30'
                  }`}
                  style={{ backgroundColor: color }}
                />

                {/* Tooltip */}
                {isHovered && (
                  <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-50 w-52 rounded-xl border border-white/15 bg-[#000c1a]/95 backdrop-blur-xl shadow-2xl p-3 flex flex-col gap-2 pointer-events-none">
                    {det.image_path && (
                      <img
                        src={`http://localhost:3001/${det.image_path}`}
                        alt="detection"
                        className="w-full h-24 object-cover rounded-lg"
                      />
                    )}
                    <div className="text-[10px] text-gray-400 space-y-0.5">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Drone</span>
                        <span className="text-[#00ffcc] font-mono">{det.drone_id}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Time</span>
                        <span className="font-mono">{formatTime(det.timestamp)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Coords</span>
                        <span className="font-mono">{det.lat.toFixed(4)}, {det.lon.toFixed(4)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Conf</span>
                        <span style={{ color }} className="font-mono font-bold">
                          {Math.round(det.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Brush handles */}
          {startPct !== null && (
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-5 bg-[#00ffcc] rounded cursor-ew-resize border border-[#000814]"
              style={{ left: `${startPct}%` }}
            />
          )}
          {endPct !== null && Math.abs(endPct - startPct!) > 1 && (
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3.5 h-5 bg-[#00ffcc] rounded cursor-ew-resize border border-[#000814]"
              style={{ left: `${endPct}%` }}
            />
          )}
        </div>

        {/* Time labels */}
        <div className="flex justify-between mt-2.5 px-2">
          <span className="text-[10px] text-gray-600 font-mono">{formatTime(sorted[0].timestamp)}</span>
          <span className="text-[10px] text-gray-600 font-mono">{formatTime(sorted.at(-1)!.timestamp)}</span>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-[10px] text-gray-600 border-t border-white/8 pt-2">
        {[
          { color: '#00ffcc', label: '≥80% conf' },
          { color: '#fbbf24', label: '50–80%' },
          { color: '#ef4444', label: '<50%' },
        ].map(({ color, label }) => (
          <div key={label} className="flex items-center gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full border border-[#000814]" style={{ backgroundColor: color }} />
            {label}
          </div>
        ))}
        <span className="ml-auto text-gray-700">
          {activeRange ? `${sorted.filter(d => d.timestamp >= activeRange.start && d.timestamp <= activeRange.end).length} in range` : 'All frames shown'}
        </span>
      </div>
    </div>
  );
}
