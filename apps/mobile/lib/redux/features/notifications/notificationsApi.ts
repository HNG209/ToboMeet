import { NotificationResponse, PageResponse } from "@tobomeet/shared/types";
import { baseApi } from "../../api/baseApi";

export type GetNotificationsArgs = {
  cursor?: string;
  limit?: number;
  type?: string;
  isRead?: boolean | string;
};

export const notificationsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getNotifications: builder.query<
      PageResponse<NotificationResponse>,
      GetNotificationsArgs
    >({
      query: (args) => ({
        url: "/notifications",
        params: args,
      }),

      // Chỉ tạo khoá (Cache Key) dựa trên các trường lọc, bỏ qua cursor và limit
      serializeQueryArgs: ({ endpointName, queryArgs }) => {
        const typeKey = queryArgs.type || "all";
        const readKey =
          queryArgs.isRead !== undefined ? queryArgs.isRead : "all";

        // Ví dụ key sinh ra: "getNotifications-MEETING_INVITE-false"
        return `${endpointName}-${typeKey}-${readKey}`;
      },

      // Gộp (Merge) dữ liệu mới vào cache cũ
      merge: (currentCache, newItems, { arg }) => {
        if (!arg.cursor) {
          // Nếu gọi lại không có cursor (ví dụ pull to refresh), ghi đè toàn bộ cache
          return newItems;
        }

        // Nếu gọi các trang tiếp theo, nối (push) thêm dữ liệu vào mảng items cũ
        currentCache.items.push(...newItems.items);

        // Cập nhật lại các thông tin phân trang
        currentCache.nextCursor = newItems.nextCursor;
        currentCache.hasNext = newItems.hasNext;
        currentCache.limit = newItems.limit;
      },

      // Bắt buộc gọi lại API khi cursor hoặc filter thay đổi
      forceRefetch({ currentArg, previousArg }) {
        return (
          currentArg?.cursor !== previousArg?.cursor ||
          currentArg?.type !== previousArg?.type ||
          currentArg?.isRead !== previousArg?.isRead
        );
      },

      providesTags: ["Notification"],
    }),
  }),
  overrideExisting: true,
});

export const { useGetNotificationsQuery } = notificationsApi;
