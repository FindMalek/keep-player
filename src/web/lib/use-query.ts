import { useCallback, useEffect, useState } from "react";

const cache = new Map<string, unknown>();

export interface Query<T> {
  data: T | undefined;
  error: Error | null;
  loading: boolean;
  reload: () => void;
}

/** Fetch once per key, show the cached value instantly on revisits, refresh in the background. */
export function useQuery<T>(key: string | null, load: () => Promise<T>): Query<T> {
  const [data, setData] = useState<T | undefined>(() => (key ? (cache.get(key) as T | undefined) : undefined));
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    setData(cache.get(key) as T | undefined);
    setLoading(true);
    load()
      .then((value) => {
        if (cancelled) return;
        cache.set(key, value);
        setData(value);
        setError(null);
      })
      .catch((reason: unknown) => !cancelled && setError(reason instanceof Error ? reason : new Error(String(reason))))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // `load` is recreated every render; the key identifies the request.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, version]);

  const reload = useCallback(() => setVersion((value) => value + 1), []);
  return { data, error, loading, reload };
}
