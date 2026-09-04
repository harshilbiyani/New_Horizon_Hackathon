import { useEffect, useState, useCallback } from 'react';
import { Search, Database, AlertTriangle, RefreshCw, Layers, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useVLMSearch } from '../hooks/useVLMSearch';
import { useStreamStatus } from '../hooks/useStreamStatus';
import VLMSearchBar from '../components/VLMSearchBar';
import DetectionCard from '../components/DetectionCard';
import VideoStreamPanel from '../components/VideoStreamPanel';
import DetectionTimeline from '../components/DetectionTimeline';
import type { Detection, VLMHealth } from '../types/telemetry';

const API_BASE = 'http://localhost:3001';

// ─── Skeleton card ────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-2xl border border-white/8 bg-white/4 overflow-hidden animate-pulse flex flex-col">
      <div className="h-44 bg-white/8" />
      <div className="p-4 flex flex-col gap-3">
        <div className="flex gap-4">
          <div className="w-14 h-14 rounded-full bg-white/10" />
          <div className="flex-1 flex flex-col gap-2 pt-2">
            <div className="h-2.5 rounded bg-white/10 w-3/4" />
            <div className="h-1.5 rounded bg-white/8 w-full" />
          </div>
        </div>
        <div className="h-7 rounded-lg bg-white/8" />
        <div className="h-7 rounded-lg bg-white/8" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-7 rounded-lg bg-white/8" />
          <div className="h-7 rounded-lg bg-white/8" />
        </div>
      </div>
    </div>
  );
}

// ─── Empty state ──────────────────────────────────────────────────────────────
function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-24 gap-5 text-center">
      <div className="relative">
        <div className="w-20 h-20 rounded-full border border-[#00ffcc]/20 flex items-center justify-center">
          <Search size={32} className="text-[#00ffcc]/30" />
        </div>
        <div className="absolute inset-0 rounded-full border border-[#00ffcc]/10 animate-ping" />
      </div>
      {hasQuery ? (
        <>
          <h3 className="text-lg font-semibold text-white/70">No confident matches found</h3>
          <p className="text-sm text-gray-500 max-w-sm">
            Try rephrasing your description, or lower the similarity threshold using the filter options.
          </p>
        </>
      ) : (
        <>
          <h3 className="text-lg font-semibold text-white/50">Describe a person to search</h3>
          <p className="text-sm text-gray-600 max-w-sm">
            Type a natural-language description of the person you're looking for. CLIP will match it
            against captured drone frames using vision-language embeddings.
          </p>
        </>
      )}
    </div>
  );
}

// ─── VLM Status chip ─────────────────────────────────────────────────────────
function VLMStatusChip({ health }: { health: VLMHealth | null; error?: boolean }) {
  if (!health) {
    return (
      <span className="flex items-center gap-2 text-xs text-red-400 bg-red-400/10 border border-red-400/20 px-3 py-1.5 rounded-full">
        <span className="w-2 h-2 rounded-full bg-red-400" />
        VLM Offline
      </span>
    );
  }
  return (
    <span className="flex items-center gap-2 text-xs text-[#00ffcc] bg-[#00ffcc]/10 border border-[#00ffcc]/20 px-3 py-1.5 rounded-full">
      <span className="w-2 h-2 rounded-full bg-[#00ffcc] animate-pulse" />
      CLIP {health.model} · {health.device.toUpperCase()} · {health.indexed} indexed
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function PersonSearch() {
  const {
    results, totalIndexed, query, loading, error,
    searchedAt, history, search, clearResults, clearHistory,
  } = useVLMSearch();

  const {
    status: streamStatus,
    events: streamEvents,
    starting, stopping,
    start: startStream,
    stop: stopStream,
    clearEvents: clearStreamEvents,
  } = useStreamStatus();

  const [topK, setTopK] = useState(6);
  const [threshold, setThreshold] = useState(0.0);
  const [showFilters, setShowFilters] = useState(false);
  const [health, setHealth] = useState<VLMHealth | null>(null);
  const [healthError, setHealthError] = useState(false);
  const [allDetections, setAllDetections] = useState<Detection[]>([]);
  const [viewMode, setViewMode] = useState<'search' | 'gallery'>('search');
  const [resetting, setResetting] = useState(false);
  const [timeRange, setTimeRange] = useState<{ start: string; end: string } | null>(null);

  // Poll VLM health
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/vlm/health`);
        if (r.ok) {
          setHealth(await r.json());
          setHealthError(false);
        } else {
          setHealthError(true);
          setHealth(null);
        }
      } catch {
        setHealthError(true);
        setHealth(null);
      }
    };
    check();
    const t = setInterval(check, 10000);
    return () => clearInterval(t);
  }, []);

  // Load all detections for timeline + gallery
  const loadDetections = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/vlm/detections?per_page=200`);
      const d = await r.json();
      setAllDetections(d.detections ?? []);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadDetections();
  }, [loadDetections, totalIndexed, streamStatus.frames_processed]);

  // Re-load detections when stream produces new frames
  useEffect(() => {
    if (streamEvents.length > 0 && streamEvents[0].type === 'frame_indexed') {
      loadDetections();
    }
  }, [streamEvents, loadDetections]);

  const handleReset = async () => {
    if (!confirm('Clear all indexed detections? This cannot be undone.')) return;
    setResetting(true);
    try {
      await fetch(`${API_BASE}/api/vlm/reset`, { method: 'DELETE' });
      clearResults();
      setAllDetections([]);
      setHealth((h) => (h ? { ...h, indexed: 0 } : null));
      setTimeRange(null);
    } finally {
      setResetting(false);
    }
  };

  // Build search params including time range
  const handleSearch = useCallback(
    (q: string) => {
      search(q, topK, threshold, timeRange ?? undefined);
    },
    [search, topK, threshold, timeRange]
  );

  const displayResults = viewMode === 'gallery' ? allDetections : results;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#000814] text-white font-sans flex flex-col">
      {/* ── Sticky Header ── */}
      <div className="border-b border-white/8 bg-[#000814]/80 backdrop-blur-md sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-6 py-5 flex flex-col gap-4">
          {/* Title row */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex flex-col">
              <h1 className="text-2xl font-bold tracking-widest text-[#00ffcc]">
                PERSON <span className="text-white">SEARCH</span>
                <span className="ml-3 text-xs font-normal text-gray-500 tracking-normal align-middle">
                  VLM · Phase 2
                </span>
              </h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Continuous video stream embedding · Natural-language frame retrieval · CLIP + FAISS
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <VLMStatusChip health={health} error={healthError} />
              {/* View toggle */}
              <div className="flex rounded-lg border border-white/10 overflow-hidden text-xs font-semibold">
                <button
                  onClick={() => setViewMode('search')}
                  className={`px-3 py-1.5 transition-colors ${viewMode === 'search' ? 'bg-[#00ffcc]/15 text-[#00ffcc]' : 'text-gray-500 hover:text-white'}`}
                >
                  Search
                </button>
                <button
                  onClick={() => setViewMode('gallery')}
                  className={`px-3 py-1.5 transition-colors flex items-center gap-1.5 ${viewMode === 'gallery' ? 'bg-[#00ffcc]/15 text-[#00ffcc]' : 'text-gray-500 hover:text-white'}`}
                >
                  <Layers size={12} />
                  Gallery
                </button>
              </div>
              {/* Reset */}
              <button
                id="vlm-reset-btn"
                onClick={handleReset}
                disabled={resetting}
                className="flex items-center gap-1.5 text-xs text-red-400/60 hover:text-red-400 border border-red-400/20 hover:border-red-400/40 px-3 py-1.5 rounded-lg transition-all disabled:opacity-40"
              >
                <Trash2 size={12} />
                Reset Index
              </button>
            </div>
          </div>

          {/* Search bar (only in search mode) */}
          {viewMode === 'search' && (
            <div className="flex flex-col gap-2">
              <VLMSearchBar
                onSearch={handleSearch}
                loading={loading}
                history={history}
                onClearHistory={clearHistory}
              />
              {/* Filters toggle */}
              <div className="flex items-center gap-4">
                <button
                  onClick={() => setShowFilters((f) => !f)}
                  className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-[#00ffcc] transition-colors"
                >
                  <SlidersHorizontal size={12} />
                  {showFilters ? 'Hide filters' : 'Filters'}
                </button>
                {(query || timeRange) && (
                  <button
                    onClick={() => { clearResults(); setTimeRange(null); }}
                    className="text-xs text-gray-600 hover:text-gray-400 transition-colors flex items-center gap-1"
                  >
                    <RefreshCw size={10} /> Clear
                  </button>
                )}
                {timeRange && (
                  <span className="text-xs text-[#00ffcc]/60">
                    ⏱ Time filter active
                  </span>
                )}
              </div>
              {/* Filter panel */}
              {showFilters && (
                <div className="flex items-center gap-8 bg-white/4 rounded-xl px-5 py-3 border border-white/8 flex-wrap gap-y-3">
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-gray-400 whitespace-nowrap">
                      Top K: <span className="text-[#00ffcc] font-bold">{topK}</span>
                    </label>
                    <input
                      type="range" min={1} max={20} value={topK}
                      onChange={(e) => setTopK(Number(e.target.value))}
                      className="w-28 accent-[#00ffcc]"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-gray-400 whitespace-nowrap">
                      Min Similarity: <span className="text-[#00ffcc] font-bold">{threshold.toFixed(2)}</span>
                    </label>
                    <input
                      type="range" min={0} max={0.5} step={0.01} value={threshold}
                      onChange={(e) => setThreshold(Number(e.target.value))}
                      className="w-28 accent-[#00ffcc]"
                    />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Body ── */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-6 py-6 flex flex-col gap-6">

        {/* ── Phase 2: Video Stream Panel ── */}
        <VideoStreamPanel
          status={streamStatus}
          events={streamEvents}
          starting={starting}
          stopping={stopping}
          onStart={startStream}
          onStop={stopStream}
          onClearEvents={clearStreamEvents}
        />

        {/* ── Detection Timeline ── */}
        {allDetections.length > 0 && (
          <DetectionTimeline
            detections={allDetections}
            onTimeRangeChange={setTimeRange}
            activeRange={timeRange}
          />
        )}

        {/* ── Results context row ── */}
        {(query || viewMode === 'gallery') && (
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-3">
              {viewMode === 'search' && query && (
                <p className="text-sm text-gray-400">
                  Query: <span className="text-white font-medium">"{query}"</span>
                  {searchedAt && (
                    <span className="ml-2 text-gray-600 text-xs">
                      · {new Date(searchedAt).toLocaleTimeString()}
                    </span>
                  )}
                  {timeRange && (
                    <span className="ml-2 text-[#00ffcc]/60 text-xs">· time-filtered</span>
                  )}
                </p>
              )}
              {viewMode === 'gallery' && (
                <p className="text-sm text-gray-400 flex items-center gap-2">
                  <Database size={14} className="text-[#00ffcc]/60" />
                  All indexed detections
                </p>
              )}
            </div>
            <span className="text-xs text-gray-600">
              {displayResults.length} result{displayResults.length !== 1 ? 's' : ''} ·{' '}
              {totalIndexed || health?.indexed || 0} total in index
            </span>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/25 rounded-xl px-5 py-4">
            <AlertTriangle size={18} className="text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-400">Search Error</p>
              <p className="text-xs text-red-400/80 mt-0.5">{error}</p>
              <p className="text-xs text-gray-500 mt-1">
                Make sure{' '}
                <code className="bg-white/10 px-1 rounded">python drone_swarm/vlm_service.py</code>{' '}
                is running on port 5001.
              </p>
            </div>
          </div>
        )}

        {/* Results grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {loading ? (
            Array.from({ length: topK }).map((_, i) => <SkeletonCard key={i} />)
          ) : displayResults.length > 0 ? (
            displayResults.map((det, i) => (
              <DetectionCard key={det.id} detection={det} rank={i + 1} />
            ))
          ) : (
            <EmptyState hasQuery={!!query} />
          )}
        </div>
      </div>

      {/* ── Footer ── */}
      <div className="border-t border-white/5 py-4 px-6 text-center">
        <p className="text-[11px] text-gray-600">
          Phase 2 · Continuous video-level CLIP embeddings · FAISS cosine similarity ·
          SSE live stream · Detection timeline filter
        </p>
      </div>
    </div>
  );
}
