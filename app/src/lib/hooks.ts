import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError } from './types';

/** Loads on focus, exposes refresh for pull-to-refresh, optional polling while focused. */
export function useLoad<T>(fn: () => Promise<T>, opts: { pollMs?: number } = {}) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const d = await fnRef.current();
      setData(d);
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Try again.');
    } finally {
      if (manual) setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
      if (!opts.pollMs) return;
      const t = setInterval(() => load(), opts.pollMs);
      return () => clearInterval(t);
    }, [load, opts.pollMs]),
  );

  return { data, setData, error, refreshing, refresh: () => load(true), reload: () => load() };
}

/** Re-render every `ms` so relative times ("In 17 minutes") stay fresh. */
export function useNow(ms = 30000) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}
