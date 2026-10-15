import { useCallback, useMemo } from "react";

/** Pages of an infinite list as one array, plus a callback that loads the next page once (no duplicate requests). */
export function useAllPages<T>(query: {
  data?: { pages: T[][] };
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => Promise<unknown>;
}) {
  const items = useMemo(() => query.data?.pages.flat() ?? [], [query.data]);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const loadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) void fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  return { items, loadMore };
}
