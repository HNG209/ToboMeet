import { useState, useEffect, useCallback, useRef } from "react";
import { useGetNotificationsQuery } from "@/lib/redux/api/notificationsApi";
import { useSocket } from "./useSocket";
import { useNotificationCacheManager } from "./useNotificationCacheManager";

interface UseNotificationsOptions {
  limit?: number;
  type?: string;
  isRead?: boolean | string;
  markAsRead?: boolean;
}

// Hook nhận thông báo và xử lý phân trang
export function useNotifications({
  limit = 20,
  type,
  isRead,
  markAsRead,
}: UseNotificationsOptions = {}) {
  const socket = useSocket();
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const { markNotificationsAsReadInCache } = useNotificationCacheManager();

  // ID thông báo chưa đọc
  const unreadIdsRef = useRef<Set<string>>(new Set());

  // Tự động reset cursor mỗi khi các tham số lọc thay đổi
  useEffect(() => {
    setCursor(undefined);
  }, [type, isRead]);

  // Gọi RTK Query với cursor hiện tại và các tham số lọc
  const queryResult = useGetNotificationsQuery(
    {
      cursor,
      limit,
      type,
      isRead,
    },
    { skip: markAsRead },
  );

  const { data, isFetching } = queryResult;
  const notifications = data?.items || [];

  // Gom Id thông báo chưa đọc
  useEffect(() => {
    if (!markAsRead && notifications.length > 0) {
      notifications.forEach((notif) => {
        if (!notif.isRead) {
          unreadIdsRef.current.add(notif._id);
        }
      });
    }
  }, [markAsRead, notifications]);

  // Xả sự kiện và cập nhật cache khi đóng drawer
  useEffect(() => {
    // Nếu markAsRead == true (drawer bị đóng) và có ID trong túi
    if (markAsRead && unreadIdsRef.current.size > 0) {
      const idsToMark = Array.from(unreadIdsRef.current);

      socket.emit("mark_notifications_read", idsToMark);
      markNotificationsAsReadInCache(idsToMark, type, isRead);

      unreadIdsRef.current.clear();
    }
  }, [markAsRead, markNotificationsAsReadInCache, type, isRead]);

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
    ...queryResult, // Trả về tất cả các cờ như isLoading, isFetching, isError,...
    notifications,
    hasNext: data?.hasNext || false,
    nextCursor: data?.nextCursor || null,
    loadMore,
    refresh,
  };
}
