import { useState, useCallback, useRef } from 'react';
import type { Detection, VLMSearchResult } from '../types/telemetry';

const API_BASE = 'http://localhost:3001';
const HISTORY_KEY = 'vlm_query_history';
const MAX_HISTORY = 8;

function loadHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveHistory(q: string, prev: string[]): string[] {
  const deduped = [q, ...prev.filter((h) => h !== q)].slice(0, MAX_HISTORY);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(deduped));
  return deduped;
}

export interface UseVLMSearchReturn {
  results: Detection[];
  totalIndexed: number;
  query: string;
  loading: boolean;
  error: string | null;
  searchedAt: string | null;
  history: string[];
  search: (q: string, k?: number, threshold?: number, timeRange?: { start: string; end: string }) => Promise<void>;
  clearResults: () => void;
  clearHistory: () => void;
}

export function useVLMSearch(): UseVLMSearchReturn {
  const [results, setResults] = useState<Detection[]>([]);
  const [totalIndexed, setTotalIndexed] = useState(0);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchedAt, setSearchedAt] = useState<string | null>(null);
  const [history, setHistory] = useState<string[]>(loadHistory);
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback(
    async (q: string, k = 6, threshold = 0.0, timeRange?: { start: string; end: string }) => {
      const trimmed = q.trim();
      if (!trimmed) return;

      // Cancel any in-flight request
      abortRef.current?.abort();
      abortRef.current = new AbortController();

      setLoading(true);
      setError(null);
      setQuery(trimmed);

      const params = new URLSearchParams({
        q: trimmed,
        k: String(k),
        threshold: String(threshold),
      });
      if (timeRange?.start) params.set('start_time', timeRange.start);
      if (timeRange?.end) params.set('end_time', timeRange.end);

      try {
        const res = await fetch(`${API_BASE}/api/vlm/search?${params}`, {
          signal: abortRef.current.signal,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `HTTP ${res.status}`);
        }
        const data: VLMSearchResult = await res.json();
        setResults(data.results);
        setTotalIndexed(data.total_indexed ?? 0);
        setSearchedAt(data.searched_at ?? new Date().toISOString());
        setHistory((prev) => saveHistory(trimmed, prev));
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(
          err instanceof Error
            ? err.message
            : 'Search failed — is the VLM service running?'
        );
        setResults([]);
      } finally {
        setLoading(false);
      }
    },
    []
  );

  const clearResults = useCallback(() => {
    setResults([]);
    setQuery('');
    setError(null);
    setSearchedAt(null);
  }, []);

  const clearHistory = useCallback(() => {
    localStorage.removeItem(HISTORY_KEY);
    setHistory([]);
  }, []);

  return {
    results,
    totalIndexed,
    query,
    loading,
    error,
    searchedAt,
    history,
    search,
    clearResults,
    clearHistory,
  };
}
