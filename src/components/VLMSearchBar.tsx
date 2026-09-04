import { useState, useRef, useEffect, type KeyboardEvent } from 'react';
import { Search, Clock, X, Loader2, Cpu } from 'lucide-react';

const EXAMPLE_QUERIES = [
  'man in white t-shirt near the river',
  'person in red jacket on open field',
  'child in yellow raincoat on road',
  'survivor waving arms in open terrain',
  'woman in blue dress walking through forest',
  'group of people in orange safety vests',
];

interface Props {
  onSearch: (q: string) => void;
  loading: boolean;
  history: string[];
  onClearHistory: () => void;
}

export default function VLMSearchBar({
  onSearch,
  loading,
  history,
  onClearHistory,
}: Props) {
  const [value, setValue] = useState('');
  const [placeholder, setPlaceholder] = useState(EXAMPLE_QUERIES[0]);
  const [showHistory, setShowHistory] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const placeholderIdx = useRef(0);

  // Cycle placeholder every 4s
  useEffect(() => {
    const interval = setInterval(() => {
      placeholderIdx.current = (placeholderIdx.current + 1) % EXAMPLE_QUERIES.length;
      setPlaceholder(EXAMPLE_QUERIES[placeholderIdx.current]);
    }, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleSubmit = () => {
    const q = value.trim();
    if (!q || loading) return;
    setShowHistory(false);
    onSearch(q);
  };

  const handleKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') handleSubmit();
    if (e.key === 'Escape') {
      setShowHistory(false);
      inputRef.current?.blur();
    }
  };

  const pickHistory = (q: string) => {
    setValue(q);
    setShowHistory(false);
    onSearch(q);
  };

  return (
    <div className="relative w-full">
      {/* Search bar wrapper */}
      <div
        className={`relative flex items-center gap-3 rounded-2xl border px-5 py-4 transition-all duration-300 ${
          loading
            ? 'border-[#00ffcc]/80 shadow-[0_0_30px_rgba(0,255,204,0.25)]'
            : 'border-white/15 hover:border-[#00ffcc]/40 focus-within:border-[#00ffcc]/60 focus-within:shadow-[0_0_24px_rgba(0,255,204,0.15)]'
        } bg-white/5 backdrop-blur-md`}
      >
        {/* Icon */}
        <div className="flex-shrink-0">
          {loading ? (
            <Loader2 size={22} className="text-[#00ffcc] animate-spin" />
          ) : (
            <Cpu size={22} className="text-[#00ffcc]/70" />
          )}
        </div>

        {/* Input */}
        <input
          ref={inputRef}
          id="vlm-search-input"
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKey}
          onFocus={() => history.length > 0 && setShowHistory(true)}
          onBlur={() => setTimeout(() => setShowHistory(false), 150)}
          placeholder={placeholder}
          disabled={loading}
          className="flex-1 bg-transparent text-white placeholder-white/25 text-base outline-none disabled:opacity-60 caret-[#00ffcc] transition-all"
          aria-label="Describe the person you're looking for"
          autoComplete="off"
        />

        {/* Clear */}
        {value && !loading && (
          <button
            onClick={() => setValue('')}
            className="text-white/30 hover:text-white/70 transition-colors flex-shrink-0"
            aria-label="Clear input"
          >
            <X size={16} />
          </button>
        )}

        {/* Search button */}
        <button
          id="vlm-search-btn"
          onClick={handleSubmit}
          disabled={!value.trim() || loading}
          className="flex-shrink-0 flex items-center gap-2 bg-[#00ffcc] text-[#000814] font-bold text-sm px-5 py-2 rounded-xl hover:bg-[#00e6b8] disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:scale-[1.03] active:scale-95"
        >
          <Search size={16} />
          SEARCH
        </button>
      </div>

      {/* Scanning pulse when loading */}
      {loading && (
        <div className="absolute bottom-0 left-0 right-0 h-[2px] overflow-hidden rounded-b-2xl">
          <div className="h-full bg-gradient-to-r from-transparent via-[#00ffcc] to-transparent animate-[scan_1.4s_ease-in-out_infinite]" />
        </div>
      )}

      {/* History dropdown */}
      {showHistory && history.length > 0 && (
        <div className="absolute top-full left-0 right-0 mt-2 z-50 rounded-xl border border-white/10 bg-[#000c1a]/95 backdrop-blur-xl shadow-2xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/8">
            <span className="text-[10px] text-gray-500 uppercase tracking-widest flex items-center gap-1.5">
              <Clock size={11} />
              Recent Queries
            </span>
            <button
              onClick={onClearHistory}
              className="text-[10px] text-gray-500 hover:text-red-400 transition-colors"
            >
              Clear
            </button>
          </div>
          {history.map((q, i) => (
            <button
              key={i}
              onClick={() => pickHistory(q)}
              className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-white/8 hover:text-[#00ffcc] transition-all flex items-center gap-3 group"
            >
              <Search size={13} className="text-gray-600 group-hover:text-[#00ffcc] transition-colors" />
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Inline CSS keyframe for scan animation */}
      <style>{`
        @keyframes scan {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}
