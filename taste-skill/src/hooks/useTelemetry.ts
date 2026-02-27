import { useRef, useCallback, useEffect } from 'react';
import { telemetryReport } from '@/lib/api';
import type { TelemetryEvent, EventType, TelemetryPayload } from '@/types/telemetry';

const FLUSH_INTERVAL_MS = 3000;
const FLUSH_THRESHOLD = 20;
const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export function useTelemetry(session_id: string | null, story_id: string | null) {
  const bufferRef = useRef<TelemetryEvent[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const flush = useCallback(async () => {
    if (bufferRef.current.length === 0) return;
    const batch = bufferRef.current;
    bufferRef.current = [];
    try {
      await telemetryReport({ events: batch });
    } catch {
      bufferRef.current = [...batch, ...bufferRef.current];
    }
  }, []);

  const track = useCallback(
    (event_type: EventType, payload: TelemetryPayload, page_id?: string) => {
      if (!session_id || !story_id) return;
      bufferRef.current.push({
        event_id: crypto.randomUUID(),
        schema_version: 'telemetry-1.0.0',
        ts_client_ms: Date.now(),
        session_id,
        story_id,
        page_id,
        event_type,
        payload,
      });
      if (bufferRef.current.length >= FLUSH_THRESHOLD) flush();
    },
    [session_id, story_id, flush]
  );

  useEffect(() => {
    timerRef.current = setInterval(flush, FLUSH_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      flush();
    };
  }, [flush]);

  useEffect(() => {
    const onUnload = () => {
      if (bufferRef.current.length === 0) return;
      navigator.sendBeacon(
        `${API_BASE}/api/v1/telemetry/report`,
        new Blob([JSON.stringify({ events: bufferRef.current })], { type: 'application/json' })
      );
      bufferRef.current = [];
    };
    window.addEventListener('beforeunload', onUnload);
    return () => window.removeEventListener('beforeunload', onUnload);
  }, []);

  return { track, flush };
}
