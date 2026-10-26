import { useDispatch } from "react-redux";
import { AppDispatch } from "../lib/redux/store";
import { NotificationResponse } from "@tobomeet/shared/types";
import { notificationsApi } from "../lib/redux/features/notifications/notificationsApi";
import { usersApi } from "../lib/redux/features/users/usersApi";

export function useNotificationCacheManager() {
  const dispatch = useDispatch<AppDispatch>();

  const addNotificationsToCache = (
    newNotifications: NotificationResponse[],
  ) => {
    if (!newNotifications || newNotifications.length === 0) return;

    // Hàm helper dùng chung để xử lý logic ghi đè & xếp lên đầu theo createdAt
    const updateDraftItems = (draft: any, notif: NotificationResponse) => {
      const existingIndex = draft.items.findIndex(
        (item: NotificationResponse) => item._id === notif._id,
      );

      if (existingIndex !== -1) {
        // Đã tồn tại -> Cập nhật trực tiếp
        draft.items[existingIndex] = notif;
      } else {
        // Chưa tồn tại -> Đưa vào danh sách
        draft.items.push(notif);
      }
    };

    const sortByCreatedAt = (items: NotificationResponse[]) => {
      items.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
    };

    // Cập nhật cache chính (Tab "Tất cả" - không có filter type hay isRead)
    dispatch(
      notificationsApi.util.updateQueryData(
        "getNotifications",
        { cursor: undefined },
        (draft) => {
          newNotifications.forEach((notif) => {
            updateDraftItems(draft, notif);
          });
          sortByCreatedAt(draft.items);
        },
      ),
    );

    // Cập nhật cache riêng theo loại (type)
    newNotifications.forEach((notif) => {
      if (!notif.type) return;

      dispatch(
        notificationsApi.util.updateQueryData(
          "getNotifications",
          { cursor: undefined, type: notif.type },
          (draft) => {
            updateDraftItems(draft, notif);
            sortByCreatedAt(draft.items);
          },
        ),
      );
    });
  };

  const updateUnreadNotificationBadge = (state: boolean) => {
    dispatch(
      usersApi.util.updateQueryData("getMe", undefined, (draft) => {
        if (draft) {
          draft.hasUnreadNotifications = state;
        }
      }),
    );
  };

  // Đánh dấu đã đọc trong Cache
  const markNotificationsAsReadInCache = (
    unreadIds: string[],
    type?: string,
    isRead?: boolean | string,
  ) => {
    if (!unreadIds || unreadIds.length === 0) return;

    const unreadSet = new Set(unreadIds);

    // Cập nhật đúng vào tab cache đang mở
    dispatch(
      notificationsApi.util.updateQueryData(
        "getNotifications",
        { cursor: undefined, type, isRead },
        (draft) => {
          draft.items.forEach((item) => {
            if (unreadSet.has(item._id)) {
              item.isRead = true;
            }
          });
        },
      ),
    );

    // Nếu đang ở tab lọc (VD: lọc theo type), cần cập nhật đồng thời cho tab "Tất cả"
    if (type || isRead !== undefined) {
      dispatch(
        notificationsApi.util.updateQueryData(
          "getNotifications",
          { cursor: undefined },
          (draft) => {
            draft.items.forEach((item) => {
              if (unreadSet.has(item._id)) {
                item.isRead = true;
              }
            });
          },
        ),
      );
    }
  };

  return {
    addNotificationsToCache,
    updateUnreadNotificationBadge,
    markNotificationsAsReadInCache,
  };
}
