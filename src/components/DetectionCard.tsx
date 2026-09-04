import { useState } from 'react';
import { MapPin, Clock, Compass, Gauge, Radar, Navigation } from 'lucide-react';
import type { Detection } from '../types/telemetry';

const SERVER = 'http://localhost:3001';

function confidenceColor(c: number): string {
  if (c >= 0.8) return '#00ffcc';
  if (c >= 0.5) return '#fbbf24';
  return '#ef4444';
}

function similarityRingColor(s: number): string {
  if (s >= 0.28) return '#00ffcc';
  if (s >= 0.20) return '#fbbf24';
  return '#ef4444';
}

function formatTs(ts: string): string {
  try {
    return new Date(ts).toLocaleString('en-IN', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch {
    return ts;
  }
}

function SimilarityRing({ value }: { value: number }) {
  // value is raw cosine similarity (-1 to 1); normalise to 0-1 display
  const pct = Math.min(1, Math.max(0, (value + 1) / 2));
  const radius = 22;
  const circ = 2 * Math.PI * radius;
  const dash = circ * pct;
  const color = similarityRingColor(value);

  // Display as percentage of range [0, 0.5] → 0–100% for UX
  const displayPct = Math.round(Math.min(100, Math.max(0, (value / 0.5) * 100)));

  return (
    <div className="relative flex items-center justify-center" style={{ width: 56, height: 56 }}>
      <svg width={56} height={56} viewBox="0 0 56 56" className="-rotate-90">
        <circle cx={28} cy={28} r={radius} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={4} />
        <circle
          cx={28}
          cy={28}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 0.6s ease' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[11px] font-bold leading-none" style={{ color }}>
          {displayPct}%
        </span>
        <span className="text-[8px] text-gray-500 leading-none mt-0.5">match</span>
      </div>
    </div>
  );
}

interface Props {
  detection: Detection;
  rank: number;
}

export default function DetectionCard({ detection, rank }: Props) {
  const [imgError, setImgError] = useState(false);
  const imgSrc = detection.image_path.startsWith('http') 
    ? detection.image_path 
    : `${SERVER}/${detection.image_path}`;
  const confColor = confidenceColor(detection.confidence);

  return (
    <div className="group relative rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md overflow-hidden hover:border-[#00ffcc]/40 hover:shadow-[0_0_32px_rgba(0,255,204,0.12)] transition-all duration-300 hover:-translate-y-1 flex flex-col">
      {/* Rank badge */}
      <div className="absolute top-3 left-3 z-10 w-7 h-7 rounded-full bg-[#000814]/80 border border-white/20 flex items-center justify-center text-[11px] font-bold text-[#00ffcc] backdrop-blur-sm">
        #{rank}
      </div>

      {/* Drone ID badge */}
      <div className="absolute top-3 right-3 z-10 px-2.5 py-1 rounded-full bg-[#000814]/80 border border-[#00ffcc]/30 text-[10px] font-mono text-[#00ffcc] backdrop-blur-sm uppercase tracking-widest">
        {detection.drone_id}
      </div>

      {/* Image */}
      <div className="relative h-44 bg-[#000c1a] overflow-hidden flex-shrink-0">
        {!imgError ? (
          <img
            src={imgSrc}
            alt={`Detection ${detection.id}`}
            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
            onError={() => setImgError(true)}
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-gray-600">
            <Radar size={32} className="opacity-40" />
            <span className="text-xs opacity-40">Frame unavailable</span>
          </div>
        )}
        {/* Scan line overlay on hover */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#000814]/60" />
      </div>

      {/* Content */}
      <div className="p-4 flex flex-col gap-3 flex-1">
        {/* Similarity ring + confidence bar */}
        <div className="flex items-center gap-4">
          {detection.similarity !== undefined && (
            <SimilarityRing value={detection.similarity} />
          )}
          <div className="flex-1 flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-[11px] text-gray-400">
              <span className="flex items-center gap-1">
                <Gauge size={11} />
                Detection Confidence
              </span>
              <span style={{ color: confColor }} className="font-bold">
                {Math.round(detection.confidence * 100)}%
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-700"
                style={{
                  width: `${detection.confidence * 100}%`,
                  background: `linear-gradient(90deg, ${confColor}88, ${confColor})`,
                }}
              />
            </div>
          </div>
        </div>

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-2 text-xs text-gray-400">
          {/* Timestamp */}
          <div className="col-span-2 flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
            <Clock size={12} className="text-[#00ffcc]/60 flex-shrink-0" />
            <span className="font-mono truncate">{formatTs(detection.timestamp)}</span>
          </div>

          {/* Coordinates */}
          <div className="col-span-2 flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
            <MapPin size={12} className="text-[#00ffcc]/60 flex-shrink-0" />
            <span className="font-mono">
              {detection.lat.toFixed(5)}, {detection.lon.toFixed(5)}
            </span>
          </div>

          {/* Altitude */}
          <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
            <Navigation size={12} className="text-[#00ffcc]/60" />
            <span>{detection.altitude_m.toFixed(0)} m alt</span>
          </div>

          {/* Heading */}
          <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2">
            <Compass size={12} className="text-[#00ffcc]/60" />
            <span>{detection.heading_deg.toFixed(0)}° hdg</span>
          </div>
        </div>

        {/* Scene description if present */}
        {detection.description && (
          <p className="text-[11px] text-gray-500 italic leading-relaxed border-t border-white/8 pt-2">
            "{detection.description}"
          </p>
        )}
      </div>
    </div>
  );
}
