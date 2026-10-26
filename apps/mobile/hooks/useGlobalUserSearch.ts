import { useState, useEffect, useMemo, useCallback } from "react";
import debounce from "lodash/debounce";
import { useSearchUsersQuery } from "../lib/redux/features/users/usersApi";

interface UseGlobalUserSearchOptions {
  q: string;
  limit?: number;
  skip?: boolean;
  debounceMs?: number;
}

export function useGlobalUserSearch({
  q,
  limit = 20,
  skip = false,
  debounceMs = 500,
}: UseGlobalUserSearchOptions) {
  const [debouncedQuery, setDebouncedQuery] = useState(q);
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  // Debounce logic
  const debouncedSetQuery = useMemo(
    () =>
      debounce((query: string) => {
        setDebouncedQuery(query);
      }, debounceMs),
    [debounceMs],
  );

  useEffect(() => {
    debouncedSetQuery(q);
    return () => {
      debouncedSetQuery.cancel();
    };
  }, [q, debouncedSetQuery]);

  // Tự động reset cursor mỗi khi từ khóa tìm kiếm (đã debounce) thay đổi
  useEffect(() => {
    setCursor(undefined);
  }, [debouncedQuery]);

  // Ngăn chặn gọi API nếu từ khóa rỗng hoặc skip được truyền vào
  const trimmedQuery = debouncedQuery?.trim() || "";
  const shouldSkip = skip || !trimmedQuery;

  // Gọi RTK Query với cursor hiện tại và debounced query
  const queryResult = useSearchUsersQuery(
    {
      q: trimmedQuery,
      cursor,
      limit,
    },
    { skip: shouldSkip },
  );

  const { data, isFetching } = queryResult;
  const users = data?.items || [];

  // Trạng thái đang debounce (người dùng vừa gõ nhưng chưa hết thời gian chờ debounce)
  const isDebouncing =
    !skip && q.trim().length > 0 && q.trim() !== debouncedQuery.trim();

  // Đang tìm kiếm từ khóa mới: khi đang debounce hoặc RTK Query đang fetch trang đầu (!cursor)
  const isSearching = !skip && (isDebouncing || (isFetching && !cursor));

  // Đang tải thêm trang tiếp theo (Load more: có cursor và đang fetch)
  const isLoadingMore = !skip && isFetching && Boolean(cursor);

  // Hàm gọi trang tiếp theo (Load More)
  const loadMore = useCallback(() => {
    if (data?.hasNext && data?.nextCursor && !isFetching) {
      setCursor(data.nextCursor);
    }
  }, [data?.hasNext, data?.nextCursor, isFetching]);

  // Hàm làm mới danh sách (Pull to refresh)
  const refresh = useCallback(() => {
    setCursor(undefined);
    queryResult.refetch();
  }, [queryResult]);

  return {
    ...queryResult, // Trả về isLoading, isError,...
    isFetching: isFetching || isDebouncing,
    isSearching,
    isDebouncing,
    isLoadingMore,
    users,
    debouncedQuery,
    hasNext: data?.hasNext || false,
    nextCursor: data?.nextCursor || null,
    loadMore,
    refresh,
  };
}

