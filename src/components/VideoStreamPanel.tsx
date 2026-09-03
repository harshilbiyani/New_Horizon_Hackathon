import { useState } from 'react';
import {
  Play, Square, WifiOff, MapPin, Gauge,
  Radio, Clock, ChevronDown, ChevronUp, Zap,
} from 'lucide-react';
import type { StreamEvent, StreamStatus } from '../types/telemetry';

const DRONE_IDS = ['drone-1', 'drone-2', 'drone-3', 'drone-4', 'drone-5'];

interface Props {
  status: StreamStatus;
  events: StreamEvent[];
  starting: boolean;
  stopping: boolean;
  onStart: (source: string, interval: number, droneId: string) => void;
  onStop: () => void;
  onClearEvents: () => void;
}

function LiveDot({ active }: { active: boolean }) {
  return (
    <span className="relative flex h-2.5 w-2.5">
      {active && (
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#00ffcc] opacity-75" />
      )}
      <span
        className={`relative inline-flex rounded-full h-2.5 w-2.5 ${active ? 'bg-[#00ffcc]' : 'bg-gray-600'}`}
      />
    </span>
  );
}

function StatChip({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 text-xs">
      <Icon size={12} className="text-[#00ffcc]/60 flex-shrink-0" />
      <span className="text-gray-500">{label}</span>
      <span className="text-white font-mono ml-auto">{value}</span>
    </div>
  );
}

function EventRow({ event, index }: { event: StreamEvent; index: number }) {
  const det = event.detection;
  const isFrame = event.type === 'frame_indexed';
  const isStopped = event.type === 'stopped';

  return (
    <div
      className={`flex items-start gap-3 py-2 px-3 rounded-lg text-[11px] transition-all border ${
        isFrame
          ? 'border-[#00ffcc]/10 bg-[#00ffcc]/4'
          : isStopped
          ? 'border-white/10 bg-white/4'
          : 'border-red-500/20 bg-red-500/5'
      } ${index === 0 ? 'opacity-100' : 'opacity-70'}`}
    >
      <div className="flex-shrink-0 mt-0.5">
        {isFrame ? (
          <Zap size={11} className="text-[#00ffcc]" />
        ) : isStopped ? (
          <Square size={11} className="text-gray-400" />
        ) : (
          <WifiOff size={11} className="text-red-400" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        {isFrame && det ? (
          <span className="text-gray-300">
            Frame #{event.total} indexed ·{' '}
            <span className="text-[#00ffcc]/80 font-mono">{det.drone_id}</span>
            {' · '}
            <span className="font-mono text-gray-400">
              {det.lat.toFixed(4)},{det.lon.toFixed(4)}
            </span>
          </span>
        ) : isStopped ? (
          <span className="text-gray-400">Stream stopped · {event.total} frames total</span>
        ) : (
          <span className="text-red-300">{event.message || 'Stream error'}</span>
        )}
      </div>
      <span className="text-gray-600 flex-shrink-0 font-mono">
        {new Date(event.timestamp).toLocaleTimeString('en-US', {
          hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit',
        })}
      </span>
    </div>
  );
}

export default function VideoStreamPanel({
  status,
  events,
  starting,
  stopping,
  onStart,
  onStop,
  onClearEvents,
}: Props) {
  const [source, setSource] = useState('synthetic');
  const [interval, setInterval_] = useState(3);
  const [droneId, setDroneId] = useState('drone-1');
  const [expanded, setExpanded] = useState(true);

  const handleStart = () => onStart(source, interval, droneId);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md overflow-hidden">
      {/* Header */}
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between px-5 py-4 hover:bg-white/5 transition-colors"
      >
        <div className="flex items-center gap-3">
          <Radio size={16} className={`${status.running ? 'text-[#00ffcc] animate-pulse' : 'text-gray-500'}`} />
          <span className="text-sm font-semibold text-white tracking-wide">
            VIDEO STREAM INGESTION
          </span>
          <div className="flex items-center gap-2">
            <LiveDot active={status.running} />
            <span className={`text-xs ${status.running ? 'text-[#00ffcc]' : 'text-gray-500'}`}>
              {status.running ? `LIVE · ${status.frames_processed} frames` : 'IDLE'}
            </span>
          </div>
        </div>
        {expanded ? <ChevronUp size={16} className="text-gray-500" /> : <ChevronDown size={16} className="text-gray-500" />}
      </button>

      {expanded && (
        <div className="px-5 pb-5 flex flex-col gap-4 border-t border-white/8 pt-4">
          {/* Source + controls row */}
          <div className="flex flex-col gap-3">
            {/* Source input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[11px] text-gray-500 uppercase tracking-widest">Video Source</label>
              <input
                id="stream-source-input"
                type="text"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                disabled={status.running}
                placeholder="synthetic | data/videos/drone.mp4 | rtsp://..."
                className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-white/20 outline-none focus:border-[#00ffcc]/40 disabled:opacity-50 font-mono"
              />
              <p className="text-[10px] text-gray-600">
                Use <code className="bg-white/10 px-1 rounded">synthetic</code> for no-video demo, or drop any .mp4 into <code className="bg-white/10 px-1 rounded">data/videos/</code>
              </p>
            </div>

            {/* Interval + Drone ID */}
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-gray-500 uppercase tracking-widest">
                  Sample Interval: <span className="text-[#00ffcc]">{interval}s</span>
                </label>
                <input
                  type="range" min={1} max={10} value={interval}
                  onChange={(e) => setInterval_(Number(e.target.value))}
                  disabled={status.running}
                  className="accent-[#00ffcc] disabled:opacity-50"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-gray-500 uppercase tracking-widest">Drone ID</label>
                <select
                  value={droneId}
                  onChange={(e) => setDroneId(e.target.value)}
                  disabled={status.running}
                  className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none focus:border-[#00ffcc]/40 disabled:opacity-50"
                >
                  {DRONE_IDS.map((id) => (
                    <option key={id} value={id} className="bg-[#000814]">{id}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Start / Stop */}
            <div className="flex gap-3">
              {!status.running ? (
                <button
                  id="stream-start-btn"
                  onClick={handleStart}
                  disabled={starting}
                  className="flex-1 flex items-center justify-center gap-2 bg-[#00ffcc] text-[#000814] font-bold text-sm py-2.5 rounded-xl hover:bg-[#00e6b8] disabled:opacity-50 disabled:cursor-not-allowed transition-all hover:scale-[1.02] active:scale-95"
                >
                  <Play size={15} />
                  {starting ? 'Starting...' : 'START STREAM'}
                </button>
              ) : (
                <button
                  id="stream-stop-btn"
                  onClick={onStop}
                  disabled={stopping}
                  className="flex-1 flex items-center justify-center gap-2 bg-red-500/20 text-red-400 border border-red-500/30 font-bold text-sm py-2.5 rounded-xl hover:bg-red-500/30 disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-95"
                >
                  <Square size={15} />
                  {stopping ? 'Stopping...' : 'STOP STREAM'}
                </button>
              )}
            </div>

            {/* Error */}
            {status.error && (
              <p className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-2 rounded-lg">
                ⚠ {status.error}
              </p>
            )}
          </div>

          {/* Live stats */}
          {(status.running || status.frames_processed > 0) && (
            <div className="grid grid-cols-2 gap-2">
              <StatChip icon={Zap} label="Frames" value={status.frames_processed} />
              <StatChip icon={Gauge} label="Rate" value={`${status.fps_estimate} fps`} />
              <StatChip icon={MapPin} label="Lat" value={status.current_lat.toFixed(4)} />
              <StatChip icon={MapPin} label="Lon" value={status.current_lon.toFixed(4)} />
            </div>
          )}

          {/* Live event feed */}
          {events.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                  <Clock size={11} /> Live Feed
                </span>
                <button
                  onClick={onClearEvents}
                  className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                >
                  Clear
                </button>
              </div>
              <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                {events.slice(0, 12).map((ev, i) => (
                  <EventRow key={`${ev.timestamp}-${i}`} event={ev} index={i} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
