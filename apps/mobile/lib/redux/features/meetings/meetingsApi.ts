import {
  ActiveMeetingResponse,
  CreateBreakoutRoomDto,
  GetMeetingSessionsArgs,
  MeetingDeviceStatus,
  MeetingJoinResponse,
  MeetingSessionResponse,
  PageResponse,
  PresignedUploadResponse,
  RoomMemberStatus,
  SessionAttendanceItem,
} from "@tobomeet/shared/types";
import { baseApi } from "../../api/baseApi";

interface ExchangeSessionResponse {
  meetingCode: string;
  roomId?: string;
  channelId?: string;
}

export const meetingsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    // Join cuộc họp chung (hỗ trợ cả channel + personal)
    joinMeeting: builder.mutation<
      MeetingJoinResponse,
      {
        meetingCode: string;
        deviceId: string;
        displayName?: string;
        forceSwitch?: boolean;
        allowStart?: boolean;
      }
    >({
      query: (body) => ({
        url: `/meetings/join`,
        method: "POST",
        data: body,
      }),
    }),

    // Kiểm tra quyền start cuộc họp
    canStartMeeting: builder.query<
      { canStart: boolean; reason?: string },
      { meetingCode: string }
    >({
      query: ({ meetingCode }) => ({
        url: `/meetings/${meetingCode}/can-start`,
        method: "GET",
      }),
    }),

    // Lấy hoặc tạo personal meeting
    ensurePersonalMeeting: builder.mutation<{ meetingCode: string }, void>({
      query: () => ({
        url: `/meetings/personal/ensure`,
        method: "POST",
      }),
    }),

    // Lấy hoặc tạo channel meeting
    ensureChannelMeeting: builder.mutation<
      { meetingCode: string },
      { roomId: string; channelId: string }
    >({
      query: ({ roomId, channelId }) => ({
        url: `/rooms/${roomId}/channels/${channelId}/meetings/ensure`,
        method: "POST",
      }),
    }),

    // Lấy trạng thái cuộc họp đang diễn ra trong kênh
    getActiveMeeting: builder.query<
      { isOngoing: boolean; meetingCode: string | null } | ActiveMeetingResponse,
      { roomId: string; channelId: string }
    >({
      query: ({ roomId, channelId }) => ({
        url: `/rooms/${roomId}/channels/${channelId}/meetings/active`,
        method: "GET",
      }),
    }),

    getMemberStatus: builder.query<RoomMemberStatus, { meetingCode: string }>({
      query: ({ meetingCode }) => ({
        url: `/meetings/${meetingCode}/member-status`,
        method: "GET",
      }),
    }),

    // Bật/tắt chat trong cuộc họp
    toggleMeetingChat: builder.mutation<
      void,
      {
        meetingCode: string;
        isChatEnabled: boolean;
      }
    >({
      query: ({ meetingCode, isChatEnabled }) => ({
        url: `/meetings/${meetingCode}/chat-status`,
        method: "PUT",
        data: { isChatEnabled },
      }),
    }),

    // Bật/tắt chế độ phòng chờ
    toggleWaitingRoomStatus: builder.mutation<
      void,
      {
        meetingCode: string;
        isWaitingRoomEnabled: boolean;
      }
    >({
      query: ({ meetingCode, isWaitingRoomEnabled }) => ({
        url: `/meetings/${meetingCode}/waiting-room-status`,
        method: "PATCH",
        data: { isWaitingRoomEnabled },
      }),
    }),

    // Duyệt người dùng từ phòng chờ vào cuộc họp chính
    approveParticipant: builder.mutation<
      void,
      {
        code: string;
        identity: string | "all"; // Hỗ trợ duyệt tất cả người chờ bằng cách truyền 'all'
      }
    >({
      query: ({ code, identity }) => ({
        url: `/meetings/${code}/participants/${identity}/approve`,
        method: "PATCH",
      }),
    }),

    // Thay đổi thiết lập quyền duyệt vào phòng
    updateApprovalPermission: builder.mutation<
      void,
      {
        code: string;
        permission: "admin_only" | "member_and_admin" | "everyone";
      }
    >({
      query: ({ code, permission }) => ({
        url: `/meetings/${code}/approval-permission`,
        method: "PATCH",
        data: { permission },
      }),
    }),

    // Đuổi người tham gia ra khỏi cuộc họp
    removeParticipant: builder.mutation<
      void,
      { code: string; identity: string }
    >({
      query: ({ code, identity }) => ({
        url: `/meetings/${code}/participants/${identity}`,
        method: "DELETE",
      }),
    }),

    // Tắt Mic / Camera của người tham gia
    muteParticipant: builder.mutation<
      void,
      {
        code: string;
        identity: string;
        trackType: "audio" | "video";
      }
    >({
      query: ({ code, identity, trackType }) => ({
        url: `/meetings/${code}/participants/${identity}/mute`,
        method: "PUT",
        data: { trackType },
      }),
    }),

    // Đổi tên người tham gia
    renameParticipant: builder.mutation<
      void,
      {
        code: string;
        name: string;
      }
    >({
      query: ({ code, name }) => ({
        url: `/meetings/${code}/participants/rename`,
        method: "PATCH",
        data: { name },
      }),
    }),

    startScreenShare: builder.mutation<void, { meetingCode: string }>({
      query: ({ meetingCode }) => ({
        url: `/meetings/${meetingCode}/screen-share/start`,
        method: "POST",
      }),
    }),

    stopScreenShare: builder.mutation<void, { meetingCode: string }>({
      query: ({ meetingCode }) => ({
        url: `/meetings/${meetingCode}/screen-share/stop`,
        method: "POST",
      }),
    }),

    generatePresignedUploadUrl: builder.mutation<
      PresignedUploadResponse,
      { fileName: string; meetingCode: string }
    >({
      query: (body) => ({
        url: `/meetings/presigned`,
        method: "POST",
        data: body,
      }),
    }),

    // Gửi lời mời
    sendMeetingInvite: builder.mutation<
      void,
      { meetingCode: string; inviteeId: string }
    >({
      query: ({ meetingCode, inviteeId }) => ({
        url: `/meetings/${meetingCode}/invite`,
        method: "POST",
        data: { inviteeId },
      }),
    }),

    // Đổi sessionId lấy meetingCode
    exchangeSession: builder.query<ExchangeSessionResponse, string>({
      query: (sessionId) => ({
        url: `/meetings/sessions/${sessionId}/exchange`,
        method: "GET",
      }),
    }),

    // ====== Breakout room APIs =======

    // Khởi tạo Breakout Room (Gọi bởi Host)
    startBreakoutSession: builder.mutation<
      void,
      {
        code: string;
        rooms: CreateBreakoutRoomDto[];
        durationMinutes?: number;
      }
    >({
      query: ({ code, rooms, durationMinutes }) => ({
        url: `/meetings/${code}/breakout/start`,
        method: "POST",
        data: { rooms, durationMinutes },
      }),
    }),

    // Kết thúc Breakout Room (Gọi bởi Host)
    endBreakoutSession: builder.mutation<void, { code: string }>({
      query: ({ code }) => ({
        url: `/meetings/${code}/breakout/end`,
        method: "POST",
      }),
    }),

    // Xin vào phòng Breakout (Gọi bởi Participant)
    joinBreakoutRoom: builder.mutation<
      MeetingJoinResponse,
      { code: string; breakoutRoomId: string; deviceId: string }
    >({
      query: ({ code, breakoutRoomId, deviceId }) => ({
        url: `/meetings/${code}/breakout/join`,
        method: "POST",
        data: { breakoutRoomId, deviceId },
      }),
    }),

    // Quay lại phòng họp chính (Gọi bởi Participant)
    returnToMainRoom: builder.mutation<
      MeetingJoinResponse,
      { fullBreakoutRoomName: string; deviceId: string }
    >({
      query: ({ fullBreakoutRoomName, deviceId }) => ({
        url: `/meetings/breakout/${fullBreakoutRoomName}/return`,
        method: "POST",
        data: { deviceId },
      }),
    }),

    // Thêm / gán người dùng vào phòng Breakout (Gọi bởi Host)
    assignUsersToBreakout: builder.mutation<
      { success: boolean; breakoutRoomId: string; assignedUsers: string[] },
      { code: string; breakoutRoomId: string; userIds: string[] }
    >({
      query: ({ code, breakoutRoomId, userIds }) => ({
        url: `/meetings/${code}/breakout/assign-users`,
        method: "POST",
        data: { breakoutRoomId, userIds },
      }),
    }),

    // Lấy số lượng thành viên các phòng breakout
    getBreakoutCounts: builder.query<
      { counts: Record<string, number>; serverTime: number },
      { code: string }
    >({
      query: ({ code }) => ({
        url: `/meetings/${code}/breakout/counts`,
        method: "GET",
      }),
    }),

    // Lấy danh sách các session của meetingCode có phân trang cursor
    getMeetingSessions: builder.query<
      PageResponse<MeetingSessionResponse>,
      GetMeetingSessionsArgs
    >({
      query: ({ meetingCode, cursor, limit = 50 }) => ({
        url: `/meetings/${meetingCode}/sessions`,
        params: { cursor, limit },
      }),

      // Chỉ tạo khoá (Cache Key) dựa trên meetingCode, bỏ qua cursor và limit
      serializeQueryArgs: ({ endpointName, queryArgs }) => {
        const queryKey = queryArgs.meetingCode || "";
        return `${endpointName}-${queryKey}`;
      },

      // Gộp (Merge) dữ liệu mới vào cache cũ khi fetch trang mới
      merge: (currentCache, newItems, { arg }) => {
        if (!arg.cursor) {
          // Nếu gọi lại không có cursor (refresh hoặc đổi mã), ghi đè toàn bộ
          return newItems;
        }

        // Nếu gọi các trang tiếp theo, nối (push) thêm dữ liệu vào mảng items cũ
        currentCache.items.push(...newItems.items);

        // Cập nhật lại các thông tin phân trang
        currentCache.nextCursor = newItems.nextCursor;
        currentCache.hasNext = newItems.hasNext;
        currentCache.limit = newItems.limit;
      },

      // Bắt buộc gọi lại API khi cursor hoặc meetingCode thay đổi
      forceRefetch({ currentArg, previousArg }) {
        return (
          currentArg?.cursor !== previousArg?.cursor ||
          currentArg?.meetingCode !== previousArg?.meetingCode
        );
      },

      providesTags: (result, error, { meetingCode }) => [
        { type: "MeetingSessions", id: meetingCode },
      ],
    }),

    // Lấy thông tin điểm danh / người tham gia của session
    getSessionAttendance: builder.query<
      SessionAttendanceItem[],
      { meetingCode: string; sessionId?: string }
    >({
      query: ({ meetingCode, sessionId }) => ({
        url: `/meetings/${meetingCode}/attendance`,
        params: sessionId ? { sessionId } : undefined,
      }),
    }),
  }),
  overrideExisting: true,
});

export const {
  useJoinMeetingMutation,
  useCanStartMeetingQuery,
  useLazyCanStartMeetingQuery,
  useEnsurePersonalMeetingMutation,
  useEnsureChannelMeetingMutation,
  useGetActiveMeetingQuery,
  useLazyGetActiveMeetingQuery,
  useGetMemberStatusQuery,
  useLazyGetMemberStatusQuery,
  useToggleMeetingChatMutation,
  useToggleWaitingRoomStatusMutation,
  useStartScreenShareMutation,
  useStopScreenShareMutation,
  useApproveParticipantMutation,
  useUpdateApprovalPermissionMutation,
  useRemoveParticipantMutation,
  useMuteParticipantMutation,
  useRenameParticipantMutation,
  useGeneratePresignedUploadUrlMutation,
  useExchangeSessionQuery,
  useLazyExchangeSessionQuery,
  useSendMeetingInviteMutation,

  // Breakout room APIs
  useStartBreakoutSessionMutation,
  useEndBreakoutSessionMutation,
  useAssignUsersToBreakoutMutation,
  useJoinBreakoutRoomMutation,
  useReturnToMainRoomMutation,
  useGetBreakoutCountsQuery,

  // Meeting Sessions APIs
  useGetMeetingSessionsQuery,
  useLazyGetMeetingSessionsQuery,
  useGetSessionAttendanceQuery,
  useLazyGetSessionAttendanceQuery,
} = meetingsApi;


