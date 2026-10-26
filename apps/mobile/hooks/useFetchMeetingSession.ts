import { useGetMeetingSessionsQuery } from "../lib/redux/features/meetings/meetingsApi";
import { useState, useEffect, useCallback } from "react";
import { MeetingSessionResponse } from "@tobomeet/shared/types";

export interface UseFetchMeetingSessionOptions {
  meetingCode?: string;
  limit?: number;
  skip?: boolean;
}

export function useFetchMeetingSession({
  meetingCode = "",
  limit = 50,
  skip = false,
}: UseFetchMeetingSessionOptions) {
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  // Tự động reset cursor mỗi khi meetingCode thay đổi
  useEffect(() => {
    setCursor(undefined);
  }, [meetingCode]);

  // Ngăn chặn gọi API nếu meetingCode rỗng hoặc cờ skip = true
  const trimmedMeetingCode = meetingCode?.trim() || "";
  const shouldSkip = skip || !trimmedMeetingCode;

  // Gọi RTK Query với cursor hiện tại và meetingCode
  const queryResult = useGetMeetingSessionsQuery(
    {
      meetingCode: trimmedMeetingCode,
      cursor,
      limit,
    },
    { skip: shouldSkip },
  );

  const { data, isFetching } = queryResult;
  const sessions: MeetingSessionResponse[] = data?.items || [];

  // Đang tải trang đầu tiên
  const isInitialLoading = !shouldSkip && isFetching && !cursor;

  // Đang tải thêm trang tiếp theo (Load more: có cursor và đang fetch)
  const isLoadingMore = !shouldSkip && isFetching && Boolean(cursor);

  // Hàm gọi trang tiếp theo (Load More)
  const loadMore = useCallback(() => {
    if (data?.hasNext && data?.nextCursor && !isFetching) {
      setCursor(data.nextCursor);
    }
  }, [data?.hasNext, data?.nextCursor, isFetching]);

  // Hàm làm mới danh sách
  const refresh = useCallback(() => {
    setCursor(undefined);
    queryResult.refetch();
  }, [queryResult]);

  return {
    ...queryResult, // Bao gồm isLoading, isError, isSuccess, error, refetch,...
    sessions,
    hasNext: data?.hasNext || false,
    nextCursor: data?.nextCursor || null,
    isInitialLoading,
    isLoadingMore,
    loadMore,
    refresh,
  };
}
