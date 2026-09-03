import { useState, useEffect } from 'react';
import {
  Play, Square, WifiOff, MapPin, Gauge,
  Radio, Clock, ChevronDown, ChevronUp, Zap,
  Eye, Film, Crosshair, RefreshCw
} from 'lucide-react';
import type { StreamEvent, StreamStatus } from '../types/telemetry';

const DRONE_IDS = ['drone-1', 'drone-2', 'drone-3', 'drone-4', 'drone-5'];
const API_BASE = 'http://localhost:3001';

interface AvailableVideo {
  name: string;
  path: string;
  size_mb: number;
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
  const [source, setSource] = useState('data/videos/test_video.mp4');
  const [interval, setInterval_] = useState(2);
  const [droneId, setDroneId] = useState('drone-1');
  const [expanded, setExpanded] = useState(true);
  const [availableVideos, setAvailableVideos] = useState<AvailableVideo[]>([]);
  const [showLiveYolo, setShowLiveYolo] = useState(true);
  const [playerMode, setPlayerMode] = useState<'yolo' | 'raw'>('yolo');
  const [feedKey, setFeedKey] = useState(Date.now());

  // Fetch available videos on mount
  useEffect(() => {
    fetch(`${API_BASE}/api/vlm/stream/videos`)
      .then((res) => res.json())
      .then((data) => {
        if (data.ok && data.videos) {
          setAvailableVideos(data.videos);
          if (data.videos.length > 0 && source === 'data/videos/test_video.mp4') {
            setSource(data.videos[0].path);
          }
        }
      })
      .catch(() => {});
  }, []);

  const handleStart = () => {
    setShowLiveYolo(true);
    setFeedKey(Date.now());
    onStart(source, interval, droneId);
  };

  const handleSelectVideo = (path: string) => {
    setSource(path);
    setFeedKey(Date.now());
  };

  // Build MJPEG stream URL
  const yoloFeedUrl = `${API_BASE}/api/vlm/stream/yolo_feed?source=${encodeURIComponent(source)}&fps=24&t=${feedKey}`;
  const rawVideoUrl = `${API_BASE}/data/videos/${source.split('/').pop()}`;

  return (
    <div className="rounded-2xl border border-white/10 bg-[#000d1a]/80 backdrop-blur-md overflow-hidden shadow-2xl">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-white/8 bg-white/[0.02]">
        <div className="flex items-center gap-3">
          <Radio size={16} className={`${status.running ? 'text-[#00ffcc] animate-pulse' : 'text-gray-500'}`} />
          <span className="text-sm font-semibold text-white tracking-wide">
            LIVE DRONE OPTICAL FEED & YOLOv8 TARGET ACQUISITION
          </span>
          <div className="flex items-center gap-2">
            <LiveDot active={status.running || showLiveYolo} />
            <span className={`text-xs ${status.running ? 'text-[#00ffcc] font-mono' : 'text-gray-500 font-mono'}`}>
              {status.running ? `LIVE INGESTION · ${status.frames_processed} FRAMES` : showLiveYolo ? 'LIVE YOLO MONITOR' : 'STANDBY'}
            </span>
          </div>
        </div>
        <button
          onClick={() => setExpanded((e) => !e)}
          className="text-gray-500 hover:text-white transition-colors"
        >
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>

      {expanded && (
        <div className="p-5 flex flex-col gap-6">
          {/* ── Visual Feed Viewport + Controls Layout ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* Left/Main Column: Live Tactical YOLO Feed (7 Cols) */}
            <div className="lg:col-span-7 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Eye size={14} className="text-[#00ffcc]" />
                  <span className="text-xs font-bold tracking-widest text-[#00ffcc] uppercase">
                    Optical Camera Sensor (YOLOv8 Active)
                  </span>
                </div>
                
                {/* Mode Selector (YOLO HUD vs Raw Video) */}
                <div className="flex rounded-lg border border-white/10 overflow-hidden text-[11px] font-semibold">
                  <button
                    onClick={() => { setPlayerMode('yolo'); setShowLiveYolo(true); setFeedKey(Date.now()); }}
                    className={`px-3 py-1 flex items-center gap-1.5 transition-colors ${
                      playerMode === 'yolo' ? 'bg-[#00ffcc]/20 text-[#00ffcc]' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Crosshair size={11} />
                    Live YOLO Detection
                  </button>
                  <button
                    onClick={() => setPlayerMode('raw')}
                    className={`px-3 py-1 flex items-center gap-1.5 transition-colors ${
                      playerMode === 'raw' ? 'bg-[#00ffcc]/20 text-[#00ffcc]' : 'text-gray-400 hover:text-white'
                    }`}
                  >
                    <Film size={11} />
                    HTML5 Player
                  </button>
                </div>
              </div>

              {/* Viewport Screen */}
              <div className="relative w-full aspect-video bg-black rounded-2xl border border-[#00ffcc]/20 overflow-hidden shadow-[0_0_30px_rgba(0,255,204,0.06)] flex items-center justify-center group">
                {showLiveYolo && playerMode === 'yolo' ? (
                  <>
                    {/* Live MJPEG Feed from Python YOLOv8 */}
                    <img
                      key={feedKey}
                      src={yoloFeedUrl}
                      alt="YOLO Real-time Detection Feed"
                      className="w-full h-full object-contain"
                    />

                    {/* Refresh overlay button */}
                    <button
                      onClick={() => setFeedKey(Date.now())}
                      title="Reconnect / Restart Video Stream"
                      className="absolute top-3 right-3 p-1.5 rounded-lg bg-black/60 border border-white/20 text-white/80 hover:text-[#00ffcc] hover:border-[#00ffcc]/40 transition-all opacity-0 group-hover:opacity-100 backdrop-blur-sm"
                    >
                      <RefreshCw size={13} />
                    </button>
                  </>
                ) : playerMode === 'raw' ? (
                  <video
                    key={source}
                    src={rawVideoUrl}
                    controls
                    autoPlay
                    loop
                    className="w-full h-full object-contain"
                  />
                ) : (
                  <div className="flex flex-col items-center justify-center p-8 text-center gap-4">
                    <div className="w-16 h-16 rounded-full border border-[#00ffcc]/30 flex items-center justify-center bg-[#00ffcc]/5">
                      <Crosshair size={28} className="text-[#00ffcc]/60 animate-pulse" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <h4 className="text-sm font-semibold text-white/90">Camera Standby</h4>
                      <p className="text-xs text-gray-500 max-w-xs">
                        Start the stream or click below to launch real-time YOLO human bounding box detection.
                      </p>
                    </div>
                    <button
                      onClick={() => setShowLiveYolo(true)}
                      className="flex items-center gap-2 text-xs font-bold bg-[#00ffcc] text-[#000814] px-4 py-2 rounded-xl hover:bg-[#00e6b8] transition-all"
                    >
                      <Play size={12} /> Launch YOLO Video Preview
                    </button>
                  </div>
                )}
              </div>

              {/* Quick source selector pills */}
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] text-gray-500 uppercase tracking-wider">Detected Videos:</span>
                {availableVideos.map((v) => (
                  <button
                    key={v.path}
                    onClick={() => handleSelectVideo(v.path)}
                    className={`text-xs px-2.5 py-1 rounded-lg border font-mono transition-all ${
                      source === v.path
                        ? 'border-[#00ffcc] bg-[#00ffcc]/15 text-[#00ffcc]'
                        : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20 hover:text-white'
                    }`}
                  >
                    📹 {v.name} ({v.size_mb} MB)
                  </button>
                ))}
                <button
                  onClick={() => handleSelectVideo('synthetic')}
                  className={`text-xs px-2.5 py-1 rounded-lg border font-mono transition-all ${
                    source === 'synthetic'
                      ? 'border-[#00ffcc] bg-[#00ffcc]/15 text-[#00ffcc]'
                      : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/20 hover:text-white'
                  }`}
                >
                  ⚡ Synthetic Sim
                </button>
              </div>
            </div>

            {/* Right Column: Ingestion Controls & Live Event Feed (5 Cols) */}
            <div className="lg:col-span-5 flex flex-col gap-4">
              
              {/* Source Input */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] text-gray-400 uppercase tracking-widest flex items-center justify-between">
                  <span>Selected Video Path</span>
                  <span className="text-[10px] text-[#00ffcc] font-mono">OpenCV + YOLOv8</span>
                </label>
                <input
                  id="stream-source-input"
                  type="text"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  disabled={status.running}
                  placeholder="data/videos/test_video.mp4 | synthetic"
                  className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-white/20 outline-none focus:border-[#00ffcc]/50 disabled:opacity-50 font-mono"
                />
              </div>

              {/* Interval + Drone ID */}
              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] text-gray-400 uppercase tracking-widest">
                    VLM Sample: <span className="text-[#00ffcc] font-bold">{interval}s</span>
                  </label>
                  <input
                    type="range" min={1} max={10} value={interval}
                    onChange={(e) => setInterval_(Number(e.target.value))}
                    disabled={status.running}
                    className="accent-[#00ffcc] disabled:opacity-50"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <label className="text-[11px] text-gray-400 uppercase tracking-widest">Drone ID</label>
                  <select
                    value={droneId}
                    onChange={(e) => setDroneId(e.target.value)}
                    disabled={status.running}
                    className="bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white outline-none focus:border-[#00ffcc]/50 disabled:opacity-50"
                  >
                    {DRONE_IDS.map((id) => (
                      <option key={id} value={id} className="bg-[#000814]">{id}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Action Buttons: START INGESTION vs STOP */}
              <div className="flex gap-3">
                {!status.running ? (
                  <button
                    id="stream-start-btn"
                    onClick={handleStart}
                    disabled={starting}
                    className="flex-1 flex items-center justify-center gap-2 bg-[#00ffcc] text-[#000814] font-bold text-xs tracking-wider uppercase py-3 rounded-xl hover:bg-[#00e6b8] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-[0_0_20px_rgba(0,255,204,0.15)] hover:scale-[1.02] active:scale-95"
                  >
                    <Play size={14} />
                    {starting ? 'Initializing Feed...' : 'START STREAM INGESTION'}
                  </button>
                ) : (
                  <button
                    id="stream-stop-btn"
                    onClick={onStop}
                    disabled={stopping}
                    className="flex-1 flex items-center justify-center gap-2 bg-red-500/20 text-red-400 border border-red-500/30 font-bold text-xs tracking-wider uppercase py-3 rounded-xl hover:bg-red-500/30 disabled:opacity-50 transition-all hover:scale-[1.02] active:scale-95"
                  >
                    <Square size={14} />
                    {stopping ? 'Halting Feed...' : 'STOP STREAM INGESTION'}
                  </button>
                )}
              </div>

              {/* Live Telemetry Chips */}
              <div className="grid grid-cols-2 gap-2">
                <StatChip icon={Zap} label="Frames Indexed" value={status.frames_processed} />
                <StatChip icon={Gauge} label="Ingestion Rate" value={`${status.fps_estimate} fps`} />
                <StatChip icon={MapPin} label="Drone Lat" value={status.current_lat ? status.current_lat.toFixed(4) : '12.9716'} />
                <StatChip icon={MapPin} label="Drone Lon" value={status.current_lon ? status.current_lon.toFixed(4) : '77.5946'} />
              </div>

              {/* Real-time Ingestion Event Log */}
              {events.length > 0 && (
                <div className="flex flex-col gap-1.5 border-t border-white/5 pt-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
                      <Clock size={11} /> Real-time Frame Feed
                    </span>
                    <button
                      onClick={onClearEvents}
                      className="text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                  <div className="flex flex-col gap-1 max-h-36 overflow-y-auto">
                    {events.slice(0, 8).map((ev, i) => (
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
