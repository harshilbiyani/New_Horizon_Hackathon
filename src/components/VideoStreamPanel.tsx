import { useState, useEffect } from 'react';
import {
  Play,
  Square,
  WifiOff,
  MapPin,
  Gauge,
  Radio,
  Clock,
  ChevronDown,
  ChevronUp,
  Zap,
  RefreshCw,
  Video,
} from 'lucide-react';
import type { StreamEvent, StreamStatus } from '../types/telemetry';

const API_BASE = 'http://localhost:3001';

interface AvailableVideo {
  name: string;
  path: string;
  size_mb: number;
  is_camera?: boolean;
}

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

function StatChip({
  icon: Icon,
  label,
  value,
  subtext,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtext?: string;
}) {
  return (
    <div className="flex items-center gap-2.5 bg-white/[0.03] border border-white/5 rounded-xl px-3.5 py-2.5 text-xs">
      <div className="w-7 h-7 rounded-lg bg-[#00ffcc]/10 flex items-center justify-center text-[#00ffcc] flex-shrink-0">
        <Icon size={14} />
      </div>
      <div className="flex flex-col min-w-0">
        <span className="text-[10px] uppercase tracking-wider text-gray-500 font-mono">{label}</span>
        <span className="text-white font-mono font-semibold truncate">{value}</span>
      </div>
      {subtext && (
        <span className="ml-auto text-[9px] font-mono text-[#00ffcc]/60 border border-[#00ffcc]/20 rounded px-1.5 py-0.5">
          {subtext}
        </span>
      )}
    </div>
  );
}

function EventRow({ event, index }: { event: StreamEvent; index: number }) {
  const det = event.detection;
  const isFrame = event.type === 'frame_indexed';
  const isStopped = event.type === 'stopped';

  return (
    <div
      className={`flex items-center gap-2.5 py-2 px-3 rounded-lg text-xs transition-all border ${isFrame
          ? 'border-[#00ffcc]/15 bg-[#00ffcc]/[0.03]'
          : isStopped
            ? 'border-white/10 bg-white/[0.02]'
            : 'border-red-500/20 bg-red-500/5'
        } ${index === 0 ? 'opacity-100' : 'opacity-70'}`}
    >
      <div className="flex-shrink-0">
        {isFrame ? (
          <Zap size={12} className="text-[#00ffcc]" />
        ) : isStopped ? (
          <Square size={12} className="text-gray-400" />
        ) : (
          <WifiOff size={12} className="text-red-400" />
        )}
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {isFrame && det ? (
          <>
            <span className="text-gray-300 font-medium">Frame #{event.total}</span>
            <span className="text-gray-600 font-mono text-[10px]">•</span>
            <span className="text-[#00ffcc] font-mono text-[11px]">{det.drone_id}</span>
            <span className="text-gray-600 font-mono text-[10px]">•</span>
            <span className="font-mono text-gray-400 text-[11px]">
              {det.lat.toFixed(4)}, {det.lon.toFixed(4)}
            </span>
          </>
        ) : isStopped ? (
          <span className="text-gray-400">Stream stopped • {event.total} frames total</span>
        ) : (
          <span className="text-red-300">{event.message || 'Stream notification'}</span>
        )}
      </div>
      <span className="text-gray-500 font-mono text-[10px] ml-auto flex-shrink-0">
        {new Date(event.timestamp).toLocaleTimeString('en-US', {
          hour12: false,
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
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
  const [source, setSource] = useState('webcam');
  const [expanded, setExpanded] = useState(true);
  const [availableVideos, setAvailableVideos] = useState<AvailableVideo[]>([]);
  const [feedKey, setFeedKey] = useState(Date.now());
  const [feedLoading, setFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState(false);

  const reconnectFeed = () => {
    setFeedLoading(true);
    setFeedError(false);
    setFeedKey(Date.now());
  };

  // Auto-dismiss loading overlay for MJPEG streams
  useEffect(() => {
    if (feedLoading) {
      const timer = setTimeout(() => {
        setFeedLoading(false);
      }, 900);
      return () => clearTimeout(timer);
    }
  }, [feedKey, feedLoading]);

  // Fetch available camera/video sources and prioritize USB mobile camera if connected
  useEffect(() => {
    fetch(`${API_BASE}/api/vlm/stream/videos`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.videos) {
          setAvailableVideos(data.videos);
          const hasPhoneCam = data.videos.some((v: AvailableVideo) => v.path === 'cam:1');
          if (hasPhoneCam) {
            setSource('cam:1');
          } else {
            setSource('webcam');
          }
        }
      })
      .catch(() => { });
  }, []);

  // When source changes, trigger feed refresh immediately
  useEffect(() => {
    setFeedKey(Date.now());
  }, [source]);

  const handleStart = () => {
    setFeedError(false);
    setFeedLoading(false);
    onStart(source, 2, 'drone-1');
  };

  const handleSelectSource = (path: string) => {
    setSource(path);
    setFeedLoading(true);
    setFeedError(false);
    setFeedKey(Date.now());
  };

  const yoloFeedUrl = `${API_BASE}/api/vlm/stream/yolo_feed?source=${encodeURIComponent(source)}&fps=24&t=${feedKey}`;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#000d1a]/80 backdrop-blur-md overflow-hidden shadow-2xl">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <Radio size={16} className={`${status.running ? 'text-[#00ffcc] animate-pulse' : 'text-gray-500'}`} />
          <span className="text-sm font-semibold text-white tracking-wide">
            LIVE DRONE OPTICAL FEED & TARGET ACQUISITION
          </span>
          <div className="flex items-center gap-2">
            <LiveDot active={status.running} />
            <span className={`text-xs ${status.running ? 'text-[#00ffcc] font-mono' : 'text-gray-500 font-mono'}`}>
              {status.running ? `STREAMING • ${status.frames_processed} FRAMES INDEXED` : 'STANDBY'}
            </span>
          </div>
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-gray-500 hover:text-white transition-colors p-1"
          aria-label="Toggle panel"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expanded && (
        <div className="p-5 flex flex-col gap-6">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left: Video Viewport Screen (7 Cols) */}
            <div className="lg:col-span-7 flex flex-col gap-3">
              <div className="relative w-full aspect-video bg-black rounded-2xl border border-[#00ffcc]/20 overflow-hidden shadow-[0_0_30px_rgba(0,255,204,0.06)] flex items-center justify-center group">
                {/* Live MJPEG Feed */}
                <img
                  key={feedKey}
                  src={yoloFeedUrl}
                  alt="Real-time Drone Optical Stream"
                  onLoad={() => {
                    setFeedLoading(false);
                    setFeedError(false);
                  }}
                  onError={() => {
                    setFeedLoading(false);
                    setFeedError(true);
                  }}
                  className={`w-full h-full object-contain transition-opacity duration-300 ${feedLoading ? 'opacity-40' : 'opacity-100'
                    }`}
                />

                {/* Loading indicator overlay */}
                {feedLoading && !feedError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/50 backdrop-blur-sm pointer-events-none">
                    <RefreshCw size={24} className="text-[#00ffcc] animate-spin" />
                    <span className="text-xs text-[#00ffcc] font-mono tracking-wider uppercase">
                      Connecting Stream...
                    </span>
                  </div>
                )}

                {/* Error overlay */}
                {feedError && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 backdrop-blur-md p-6 text-center z-10">
                    <div className="w-12 h-12 rounded-full border border-red-500/30 bg-red-500/10 flex items-center justify-center text-red-400">
                      <WifiOff size={22} />
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-white">Camera Feed Disconnected</p>
                      <p className="text-xs text-gray-400 max-w-xs mt-1">
                        Ensure USB camera is plugged in or click below to reconnect.
                      </p>
                    </div>
                    <button
                      onClick={reconnectFeed}
                      className="flex items-center gap-2 text-xs font-bold bg-[#00ffcc] text-[#000814] px-4 py-2 rounded-xl hover:bg-[#00e6b8] transition-all"
                    >
                      <RefreshCw size={13} /> Reconnect Feed
                    </button>
                  </div>
                )}

                {/* Refresh button overlay (top-right) */}
                <button
                  onClick={reconnectFeed}
                  title="Reconnect Video Stream"
                  className="absolute top-3 right-3 p-2 rounded-lg bg-black/60 border border-white/10 text-gray-400 hover:text-white hover:border-[#00ffcc]/40 transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm z-10"
                >
                  <RefreshCw size={14} />
                </button>
              </div>
            </div>

            {/* Right: Clean Ingestion Controls & Telemetry (5 Cols) */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              {/* Source Dropdown Selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-gray-400 uppercase tracking-widest font-mono flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <Video size={12} className="text-[#00ffcc]" />
                    Video Input Source
                  </span>
                  {source === 'cam:1' ? (
                    <span className="text-[10px] text-[#00ffcc] bg-[#00ffcc]/10 border border-[#00ffcc]/30 px-2 py-0.5 rounded-full font-sans font-medium animate-pulse">
                      ● USB Mobile Camera Active
                    </span>
                  ) : (
                    <span className="text-[10px] text-gray-400 bg-white/5 border border-white/10 px-2 py-0.5 rounded-full font-sans font-medium">
                      Built-in Camera Active
                    </span>
                  )}
                </label>
                <div className="relative">
                  <select
                    value={source}
                    onChange={(e) => handleSelectSource(e.target.value)}
                    disabled={status.running}
                    className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-3 text-xs text-white outline-none focus:border-[#00ffcc]/50 disabled:opacity-50 font-medium cursor-pointer appearance-none pr-10"
                  >
                    {availableVideos.length > 0 ? (
                      availableVideos.map((v) => (
                        <option key={v.path} value={v.path} className="bg-[#000d1a] text-white">
                          {v.name}
                        </option>
                      ))
                    ) : (
                      <>
                        <option value="cam:1" className="bg-[#000d1a] text-white">
                          Mobile Phone Camera via USB (Camera 1)
                        </option>
                        <option value="webcam" className="bg-[#000d1a] text-white">
                          Built-in Laptop Camera (Camera 0)
                        </option>
                      </>
                    )}
                  </select>
                  <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400">
                    <ChevronDown size={14} />
                  </div>
                </div>
              </div>

              {/* Start / Stop Button */}
              <div>
                {!status.running ? (
                  <button
                    id="stream-start-btn"
                    onClick={handleStart}
                    disabled={starting}
                    className="w-full flex items-center justify-center gap-2.5 bg-[#00ffcc] text-[#000814] font-bold text-xs tracking-wider uppercase py-3.5 rounded-xl hover:bg-[#00e6b8] disabled:opacity-50 transition-all shadow-[0_0_20px_rgba(0,255,204,0.18)] hover:scale-[1.01] active:scale-[0.99]"
                  >
                    <Play size={14} fill="#000814" />
                    {starting ? 'CONNECTING FEED...' : 'START STREAM INGESTION'}
                  </button>
                ) : (
                  <button
                    id="stream-stop-btn"
                    onClick={onStop}
                    disabled={stopping}
                    className="w-full flex items-center justify-center gap-2.5 bg-red-500/20 text-red-400 border border-red-500/30 font-bold text-xs tracking-wider uppercase py-3.5 rounded-xl hover:bg-red-500/30 disabled:opacity-50 transition-all hover:scale-[1.01] active:scale-[0.99]"
                  >
                    <Square size={14} fill="currentColor" />
                    {stopping ? 'STOPPING...' : 'STOP STREAM INGESTION'}
                  </button>
                )}
              </div>

              {/* Telemetry Metrics Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                <StatChip icon={Zap} label="Indexed Detections" value={status.frames_processed} />
                <StatChip icon={Gauge} label="Processing Rate" value={`${status.fps_estimate} fps`} />
                <StatChip
                  icon={MapPin}
                  label="Drone Latitude"
                  value={status.current_lat ? status.current_lat.toFixed(4) : '12.9716'}
                  subtext="SIM GPS"
                />
                <StatChip
                  icon={MapPin}
                  label="Drone Longitude"
                  value={status.current_lon ? status.current_lon.toFixed(4) : '77.5946'}
                  subtext="SIM GPS"
                />
              </div>

              {/* Real-time Ingestion Event Log */}
              {events.length > 0 && (
                <div className="flex flex-col gap-2 border-t border-white/5 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-400 uppercase tracking-widest font-mono flex items-center gap-1.5">
                      <Clock size={11} className="text-[#00ffcc]" /> Live Indexed Stream
                    </span>
                    <button
                      onClick={onClearEvents}
                      className="text-[10px] text-gray-500 hover:text-gray-300 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto pr-1">
                    {events.slice(0, 6).map((ev, i) => (
                      <EventRow key={`${ev.timestamp}-${i}`} event={ev} index={i} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
