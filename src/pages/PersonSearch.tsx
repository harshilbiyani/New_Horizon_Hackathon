import { useEffect, useState, useCallback } from 'react';
import {
  Search,
  AlertTriangle,
  RefreshCw,
  FileText,
  Camera,
  Target,
} from 'lucide-react';
import { useVLMSearch } from '../hooks/useVLMSearch';
import { useStreamStatus } from '../hooks/useStreamStatus';
import VLMSearchBar from '../components/VLMSearchBar';
import VLMImageSearchBar from '../components/VLMImageSearchBar';
import DetectionCard from '../components/DetectionCard';
import VideoStreamPanel from '../components/VideoStreamPanel';
import type { Detection, VLMHealth } from '../types/telemetry';

const API_BASE = 'http://localhost:3001';

// --- Skeleton Card ---
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
      </div>
    </div>
  );
}

// --- Empty State ---
function EmptyState({ hasQuery, searchMode }: { hasQuery: boolean; searchMode: 'description' | 'image' }) {
  return (
    <div className="col-span-full flex flex-col items-center justify-center py-16 gap-4 text-center">
      <div className="relative">
        <div className="w-16 h-16 rounded-2xl border border-[#00ffcc]/20 bg-[#00ffcc]/5 flex items-center justify-center">
          {searchMode === 'image' ? (
            <Camera size={26} className="text-[#00ffcc]" />
          ) : (
            <Search size={26} className="text-[#00ffcc]" />
          )}
        </div>
        <div className="absolute inset-0 rounded-2xl border border-[#00ffcc]/10 animate-ping" />
      </div>
      {hasQuery ? (
        <div className="flex flex-col gap-1 max-w-sm">
          <h3 className="text-base font-semibold text-white/80">No Confident Matches Found</h3>
          <p className="text-xs text-gray-500">
            No surveillance detections matched this query. Try broader keywords or a clearer suspect crop.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1 max-w-md">
          <h3 className="text-base font-semibold text-white/70">
            {searchMode === 'image' ? 'Upload Suspect Reference Image' : 'Search by Person Description'}
          </h3>
          <p className="text-xs text-gray-500">
            {searchMode === 'image'
              ? 'Upload a reference image or photo. CLIP computes 512-D neural embeddings to retrieve matching drone detections.'
              : 'Enter natural-language queries (e.g. "person in black jacket", "red shirt", "carrying backpack") to match surveillance targets.'}
          </p>
        </div>
      )}
    </div>
  );
}

// --- Main Page Component ---
export default function PersonSearch() {
  const {
    results,
    totalIndexed,
    query,
    searchType,
    imagePreview,
    loading,
    error,
    history,
    search,
    searchByImage,
    clearResults,
    clearHistory,
  } = useVLMSearch();

  const {
    status: streamStatus,
    events: streamEvents,
    starting,
    stopping,
    start: startStream,
    stop: stopStream,
    clearEvents: clearStreamEvents,
  } = useStreamStatus();

  // Dual search mode: 'description' vs 'image'
  const [searchMode, setSearchMode] = useState<'description' | 'image'>('description');
  const [topK, setTopK] = useState<number>(8);
  const [lastUploadedFile, setLastUploadedFile] = useState<File | null>(null);
  const [health, setHealth] = useState<VLMHealth | null>(null);
  const [recentDetections, setRecentDetections] = useState<Detection[]>([]);

  // Health check
  useEffect(() => {
    const check = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/vlm/health`);
        if (r.ok) setHealth(await r.json());
      } catch {
        setHealth(null);
      }
    };
    check();
    const t = setInterval(check, 10000);
    return () => clearInterval(t);
  }, []);

  // Fetch recent detections for display when no query is active
  const loadRecentDetections = useCallback(async () => {
    try {
      const r = await fetch(`${API_BASE}/api/vlm/detections?per_page=16`);
      const d = await r.json();
      setRecentDetections(d.detections ?? []);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    loadRecentDetections();
  }, [loadRecentDetections, totalIndexed, streamStatus.frames_processed]);

  useEffect(() => {
    if (streamEvents.length > 0 && streamEvents[0].type === 'frame_indexed') {
      loadRecentDetections();
    }
  }, [streamEvents, loadRecentDetections]);

  // Search handlers with dynamic topK
  const handleTextSearch = useCallback(
    (q: string) => {
      search(q, topK, 0.05);
    },
    [search, topK]
  );

  const handleImageSearch = useCallback(
    (file: File) => {
      setLastUploadedFile(file);
      searchByImage(file, topK, 0.05);
    },
    [searchByImage, topK]
  );

  const handleTopKChange = (newK: number) => {
    setTopK(newK);
    if (query && searchType === 'text') {
      search(query, newK, 0.05);
    } else if (lastUploadedFile && searchType === 'image') {
      searchByImage(lastUploadedFile, newK, 0.05);
    }
  };

  const hasSearch = Boolean(query || imagePreview);
  const displayDetections = hasSearch ? results : recentDetections;

  return (
    <div className="min-h-[calc(100vh-64px)] bg-[#000814] text-white font-sans flex flex-col">
      {/* Sticky Header */}
      <div className="border-b border-white/8 bg-[#000814]/85 backdrop-blur-md sticky top-16 z-30">
        <div className="max-w-7xl mx-auto px-6 py-4 flex flex-col gap-3">
          {/* Title Row */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex flex-col">
              <h1 className="text-xl font-bold tracking-widest text-[#00ffcc] flex items-center gap-2">
                <Target size={20} />
                PERSON <span className="text-white">SEARCH</span>
              </h1>
              <p className="text-xs text-gray-400 mt-0.5">
                AI Target Retrieval & Multi-Modal Search Console
              </p>
            </div>

            {/* VLM Status Badge */}
            <div className="flex items-center gap-2">
              {health ? (
                <span className="flex items-center gap-2 text-xs font-mono text-[#00ffcc] bg-[#00ffcc]/10 border border-[#00ffcc]/20 px-3 py-1.5 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-[#00ffcc] animate-pulse" />
                  VLM Online ({health.indexed} targets indexed)
                </span>
              ) : (
                <span className="flex items-center gap-2 text-xs font-mono text-gray-400 bg-white/5 border border-white/10 px-3 py-1.5 rounded-full">
                  <span className="w-2 h-2 rounded-full bg-gray-500" />
                  VLM Initializing
                </span>
              )}
            </div>
          </div>

          {/* Search Mode Tabs & Input Bar */}
          <div className="flex flex-col gap-2.5">
            {/* Mode Switcher Tabs + Dynamic Top-K Selector */}
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setSearchMode('description')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                    searchMode === 'description'
                      ? 'bg-[#00ffcc]/15 text-[#00ffcc] border border-[#00ffcc]/30 shadow-[0_0_15px_rgba(0,255,204,0.12)]'
                      : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <FileText size={14} />
                  Search with Description
                </button>

                <button
                  onClick={() => setSearchMode('image')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                    searchMode === 'image'
                      ? 'bg-[#00ffcc]/15 text-[#00ffcc] border border-[#00ffcc]/30 shadow-[0_0_15px_rgba(0,255,204,0.12)]'
                      : 'text-gray-400 hover:text-white hover:bg-white/5 border border-transparent'
                  }`}
                >
                  <Camera size={14} />
                  Search from Image (Suspect Upload)
                </button>
              </div>

              {/* Dynamic Top-K Selector Pills */}
              <div className="flex items-center gap-2.5 bg-white/[0.03] border border-white/8 rounded-xl px-3.5 py-1.5 flex-wrap">
                <span className="text-[11px] font-mono text-gray-400 uppercase tracking-wider">
                  Top-K Matches:
                </span>
                <div className="flex items-center gap-1">
                  {[4, 8, 12, 16].map((kVal) => (
                    <button
                      key={kVal}
                      onClick={() => handleTopKChange(kVal)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition-all ${
                        topK === kVal
                          ? 'bg-[#00ffcc] text-[#000814] shadow-[0_0_12px_rgba(0,255,204,0.35)]'
                          : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      {kVal}
                    </button>
                  ))}
                </div>

                {hasSearch && (
                  <button
                    onClick={() => {
                      clearResults();
                      setLastUploadedFile(null);
                    }}
                    className="ml-2 text-xs text-gray-400 hover:text-white transition-colors flex items-center gap-1 bg-white/5 hover:bg-white/10 border border-white/10 px-2.5 py-1 rounded-lg font-mono"
                    title="Clear Search Results"
                  >
                    <RefreshCw size={10} /> Clear
                  </button>
                )}
              </div>
            </div>

            {/* Active Search Bar */}
            {searchMode === 'description' ? (
              <VLMSearchBar
                onSearch={handleTextSearch}
                loading={loading}
                history={history}
                onClearHistory={clearHistory}
              />
            ) : (
              <VLMImageSearchBar
                onSearchImage={handleImageSearch}
                loading={loading}
                onClear={clearResults}
              />
            )}
          </div>
        </div>
      </div>

      {/* Main Content Body */}
      <div className="flex-1 max-w-7xl mx-auto w-full px-6 py-6 flex flex-col gap-6">
        {/* Live Video Stream & Detection Panel */}
        <VideoStreamPanel
          status={streamStatus}
          events={streamEvents}
          starting={starting}
          stopping={stopping}
          onStart={startStream}
          onStop={stopStream}
          onClearEvents={clearStreamEvents}
        />

        {/* Results Context Banner */}
        <div className="flex items-center justify-between flex-wrap gap-3 bg-white/[0.02] border border-white/8 rounded-xl px-4 py-3">
          <div className="flex items-center gap-3">
            {hasSearch ? (
              searchType === 'image' && imagePreview ? (
                <div className="flex items-center gap-3">
                  <img
                    src={imagePreview}
                    alt="Query Suspect"
                    className="w-9 h-9 rounded-lg object-cover border border-[#00ffcc]/40"
                  />
                  <div>
                    <p className="text-xs text-gray-300">
                      Suspect Match Results for:{' '}
                      <span className="text-white font-semibold">{query}</span>
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-gray-300">
                  Search Results for: <span className="text-white font-semibold">"{query}"</span>
                </p>
              )
            ) : (
              <p className="text-xs text-gray-400 flex items-center gap-2 font-medium">
                <span className="w-2 h-2 rounded-full bg-[#00ffcc]" />
                Recent Surveillance Detections
              </p>
            )}
          </div>

          <span className="text-xs text-gray-400 font-mono">
            {hasSearch
              ? `${results.length} match${results.length !== 1 ? 'es' : ''} (Top ${topK})`
              : `${recentDetections.length} recent detections`}
          </span>
        </div>

        {/* Search Error Banner */}
        {error && (
          <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/25 rounded-xl px-5 py-4">
            <AlertTriangle size={18} className="text-red-400 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-red-400">Search Error</p>
              <p className="text-xs text-gray-400 mt-0.5">{error}</p>
            </div>
          </div>
        )}

        {/* Detections Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {loading ? (
            Array.from({ length: Math.min(topK, 8) }).map((_, i) => <SkeletonCard key={i} />)
          ) : displayDetections.length > 0 ? (
            displayDetections.map((det, i) => (
              <DetectionCard key={det.id} detection={det} rank={hasSearch ? i + 1 : undefined} />
            ))
          ) : (
            <EmptyState hasQuery={hasSearch} searchMode={searchMode} />
          )}
        </div>
      </div>
    </div>
  );
}
