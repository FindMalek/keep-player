import { useCallback, useState } from "react";

/** A page's view choices (sort, grid or list, filters) kept in this browser, per page: `useState` that survives a reload. */
export function usePageView<T extends object>(page: string, defaults: T): [T, (patch: Partial<T>) => void] {
  const key = `keep-player:view:${page}`;
  const [view, setView] = useState<T>(() => {
    try {
      return { ...defaults, ...(JSON.parse(localStorage.getItem(key) ?? "{}") as Partial<T>) };
    } catch {
      return defaults;
    }
  });
  const change = useCallback(
    (patch: Partial<T>) =>
      setView((current) => {
        const next = { ...current, ...patch };
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // Kept for this visit only.
        }
        return next;
      }),
    [key],
  );
  return [view, change];
}
