import { useState, useCallback, useEffect } from 'react';
import { sessionStart } from '@/lib/api';

interface SessionData {
  story_id: string;
  session_id: string;
  client_session_token: string;
}

const STORAGE_KEY = 'storybook_session';

export function useSession() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setSession(JSON.parse(stored));
    } catch { /* ignore */ }
  }, []);

  const start = useCallback(async (story_id: string) => {
    setLoading(true);
    setError(null);
    try {
      const client_session_token = crypto.randomUUID();
      const res = await sessionStart({ story_id, client_session_token });
      const data: SessionData = { story_id, session_id: res.session_id, client_session_token };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
      setSession(data);
      return data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Session start failed';
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setSession(null);
  }, []);

  return { session, loading, error, start, clear };
}
