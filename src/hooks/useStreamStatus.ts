import { useState, useCallback, useEffect, useRef } from 'react';
import type { StreamStatus, StreamEvent } from '../types/telemetry';

const API_BASE = 'http://localhost:3001';

const DEFAULT_STATUS: StreamStatus = {
  running: false,
  source: '',
  frames_processed: 0,
  fps_estimate: 0,
  current_lat: 0,
  current_lon: 0,
  sample_interval_sec: 3,
  drone_id: 'drone-1',
  error: null,
};

export interface UseStreamStatusReturn {
  status: StreamStatus;
  events: StreamEvent[];
  starting: boolean;
  stopping: boolean;
  start: (source: string, sampleInterval: number, droneId: string) => Promise<void>;
  stop: () => Promise<void>;
  clearEvents: () => void;
}

export function useStreamStatus(): UseStreamStatusReturn {
  const [status, setStatus] = useState<StreamStatus>(DEFAULT_STATUS);
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [starting, setStarting] = useState(false);
  const [stopping, setStopping] = useState(false);

  const sseRef = useRef<EventSource | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sseCursorRef = useRef(0);

  // ── Poll status every 2s while stream is running ────────────────────────────
  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch(`${API_BASE}/api/vlm/stream/status`);
        if (r.ok) setStatus(await r.json());
      } catch { /* VLM service may be offline */ }
    };
    poll(); // immediate first check
    pollRef.current = setInterval(poll, 2000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  // ── SSE subscription ────────────────────────────────────────────────────────
  const connectSSE = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close();
    }
    const url = `${API_BASE}/api/vlm/stream/events?since=${sseCursorRef.current}`;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      if (!e.data || e.data.startsWith(':')) return; // keep-alive
      try {
        const event: StreamEvent = JSON.parse(e.data);
        sseCursorRef.current += 1;
        setEvents((prev) => {
          const next = [event, ...prev].slice(0, 50); // keep last 50
          return next;
        });
        // If we got a new frame, bump status counter optimistically
        if (event.type === 'frame_indexed') {
          setStatus((s) => ({
            ...s,
            frames_processed: event.total,
            running: true,
            current_lat: event.detection?.lat ?? s.current_lat,
            current_lon: event.detection?.lon ?? s.current_lon,
          }));
        }
        if (event.type === 'stopped') {
          setStatus((s) => ({ ...s, running: false }));
        }
      } catch { /* ignore malformed events */ }
    };

    es.onerror = () => {
      es.close();
      // Reconnect after 3s if stream is still running
      setTimeout(() => {
        setStatus((s) => {
          if (s.running) connectSSE();
          return s;
        });
      }, 3000);
    };

    sseRef.current = es;
  }, []);

  // Connect SSE when stream starts running
  useEffect(() => {
    if (status.running && !sseRef.current) {
      connectSSE();
    }
    if (!status.running && sseRef.current) {
      sseRef.current.close();
      sseRef.current = null;
    }
  }, [status.running, connectSSE]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      sseRef.current?.close();
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  // ── Actions ─────────────────────────────────────────────────────────────────
  const start = useCallback(
    async (source: string, sampleInterval: number, droneId: string) => {
      setStarting(true);
      try {
        const r = await fetch(`${API_BASE}/api/vlm/stream/start`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ source, sample_interval: sampleInterval, drone_id: droneId }),
        });
        const data = await r.json();
        if (data.status) setStatus(data.status);
        sseCursorRef.current = 0;
        connectSSE();
      } catch (e) {
        console.error('Failed to start stream:', e);
      } finally {
        setStarting(false);
      }
    },
    [connectSSE]
  );

  const stop = useCallback(async () => {
    setStopping(true);
    try {
      await fetch(`${API_BASE}/api/vlm/stream/stop`, { method: 'POST' });
      sseRef.current?.close();
      sseRef.current = null;
      setStatus((s) => ({ ...s, running: false }));
    } catch (e) {
      console.error('Failed to stop stream:', e);
    } finally {
      setStopping(false);
    }
  }, []);

  const clearEvents = useCallback(() => setEvents([]), []);

  return { status, events, starting, stopping, start, stop, clearEvents };
}
