import { RoomResponse, RoomMemberResponse } from "@tobomeet/shared/types";
import { baseApi } from "./baseApi";

export const roomsApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getMyRooms: builder.query<RoomResponse[], void>({
      query: () => ({
        url: "/rooms/my",
        method: "GET",
      }),
      providesTags: ["Room"],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          const { data } = await queryFulfilled;
          data.forEach((room) => {
            dispatch(
              roomsApi.util.upsertQueryData("getRoomById", room._id, room),
            );
          });
        } catch {}
      },
    }),

    getRoomMembers: builder.query<RoomMemberResponse[], string>({
      query: (roomId) => ({
        url: `/rooms/${roomId}/members`,
        method: "GET",
      }),
      providesTags: (_result, _error, roomId) => [{ type: "Room", id: roomId }],
    }),

    createRoom: builder.mutation<RoomResponse, { name: string }>({
      query: (body) => ({
        url: "/rooms",
        method: "POST",
        data: body,
      }),
      invalidatesTags: ["Room"],
    }),

    joinRoom: builder.mutation<RoomResponse, { code: string }>({
      query: (body) => ({
        url: "/rooms/join",
        method: "POST",
        data: body,
      }),
      invalidatesTags: ["Room"],
    }),

    getRoomById: builder.query<RoomResponse, string>({
      query: (id) => ({
        url: `/rooms/${id}`,
        method: "GET",
      }),
      keepUnusedDataFor: 300,
      providesTags: (_result, _error, id) => [{ type: "Room", id }],
    }),

    leaveRoom: builder.mutation<void, { roomId: string; newOwnerId?: string }>({
      query: ({ roomId, newOwnerId }) => ({
        url: `/rooms/${roomId}/leave`,
        method: "POST",
        data: { newOwnerId },
      }),
      invalidatesTags: ["Room"],
    }),

    disbandRoom: builder.mutation<void, string>({
      query: (roomId) => ({
        url: `/rooms/${roomId}`,
        method: "DELETE",
      }),
      invalidatesTags: ["Room"],
    }),

    removeMember: builder.mutation<void, { roomId: string; userId: string }>({
      query: ({ roomId, userId }) => ({
        url: `/rooms/${roomId}/members/${userId}`,
        method: "DELETE",
      }),
      invalidatesTags: (result, error, { roomId }) => [
        { type: "Room", id: roomId },
        "Room",
      ],
    }),

    inviteMember: builder.mutation<
      RoomResponse,
      { roomId: string; email?: string; targetUserId?: string }
    >({
      query: ({ roomId, email, targetUserId }) => ({
        url: `/rooms/${roomId}/members/invite`,
        method: "POST",
        data: { email, targetUserId },
      }),
      invalidatesTags: (_result, _error, { roomId }) => [
        { type: "Room", id: roomId },
      ],
    }),

    getRoomByCode: builder.query<
      { _id: string; name: string; type: string; code: string },
      string
    >({
      query: (code) => ({
        url: `/rooms/code/${code}`,
        method: "GET",
      }),
    }),

    /**
     * Kiểm tra trạng thái thành viên bằng ID phòng
     */
    checkMemberById: builder.query<{ isMember: boolean }, string>({
      query: (roomId) => ({
        url: `/rooms/${roomId}/check-member`,
        method: "GET",
      }),
      // Cung cấp tag để có thể tự động gọi lại nếu danh sách phòng thay đổi
      providesTags: (_result, _error, roomId) => [{ type: "Room", id: roomId }],
    }),

    /**
     * Kiểm tra trạng thái thành viên bằng mã code
     */
    checkMemberByCode: builder.query<{ isMember: boolean }, string>({
      query: (code) => ({
        url: `/rooms/code/${code}/check-member`,
        method: "GET",
      }),
    }),

    /**
     * Cập nhật vai trò thành viên (Bổ nhiệm / Thu hồi)
     */
    updateMemberRole: builder.mutation<
      void,
      { roomId: string; memberId: string; role: string }
    >({
      query: ({ roomId, memberId, role }) => ({
        url: `/rooms/${roomId}/members/${memberId}/role`,
        method: "PATCH",
        data: { role },
      }),
      invalidatesTags: (_result, _error, { roomId }) => [
        { type: "Room", id: roomId },
        "Room",
      ],
    }),

    /**
     * Chuyển quyền chủ phòng / Giảng viên / Trưởng nhóm
     */
    transferRoomOwnership: builder.mutation<
      void,
      { roomId: string; newOwnerId: string }
    >({
      query: ({ roomId, newOwnerId }) => ({
        url: `/rooms/${roomId}/transfer-owner`,
        method: "POST",
        data: { newOwnerId },
      }),
      invalidatesTags: (_result, _error, { roomId }) => [
        { type: "Room", id: roomId },
        "Room",
      ],
    }),

    /**
     * Đổi tên phòng họp
     */
    renameRoom: builder.mutation<RoomResponse, { roomId: string; name: string }>({
      query: ({ roomId, name }) => ({
        url: `/rooms/${roomId}/rename`,
        method: "PATCH",
        data: { name },
      }),
      invalidatesTags: (_result, _error, { roomId }) => [
        { type: "Room", id: roomId },
        "Room",
      ],
    }),

    renameChannel: builder.mutation<
      RoomResponse,
      { roomId: string; channelId: string; name: string }
    >({
      query: ({ roomId, channelId, name }) => ({
        url: `/rooms/${roomId}/channels/${channelId}/rename`,
        method: "PATCH",
        data: { name },
      }),
      invalidatesTags: (_result, _error, { roomId }) => [
        { type: "Room", id: roomId },
        "Room",
      ],
    }),

    addChannel: builder.mutation<

      RoomResponse,
      {
        roomId: string;
        name: string;
        isPrivate?: boolean;
        initialMemberIds?: string[];
      }
    >({
      query: ({ roomId, name, isPrivate, initialMemberIds }) => ({
        url: `/rooms/${roomId}/channels`,
        method: "POST",
        data: { name, isPrivate, initialMemberIds },
      }),
      invalidatesTags: (_result, _error, { roomId }) => [
        { type: "Room", id: roomId },
        "Room",
      ],
    }),

    updateChannelMemberRole: builder.mutation<
      RoomResponse,
      {
        roomId: string;
        channelId: string;
        targetUserId: string;
        role: string;
      }
    >({
      query: ({ roomId, channelId, targetUserId, role }) => ({
        url: `/rooms/${roomId}/channels/${channelId}/members/${targetUserId}/role`,
        method: "PUT",
        data: { role },
      }),
      invalidatesTags: (_result, _error, { roomId }) => [
        { type: "Room", id: roomId },
        "Room",
      ],
    }),

    addChannelMember: builder.mutation<
      RoomResponse,
      {
        roomId: string;
        channelId: string;
        targetUserId?: string;
        emailOrUsername?: string;
      }
    >({
      query: ({ roomId, channelId, targetUserId, emailOrUsername }) => ({
        url: `/rooms/${roomId}/channels/${channelId}/members`,
        method: "POST",
        data: { targetUserId, emailOrUsername },
      }),
      invalidatesTags: (_result, _error, { roomId }) => [
        { type: "Room", id: roomId },
        "Room",
      ],
    }),

    removeChannelMember: builder.mutation<
      RoomResponse,
      { roomId: string; channelId: string; targetUserId: string }
    >({
      query: ({ roomId, channelId, targetUserId }) => ({
        url: `/rooms/${roomId}/channels/${channelId}/members/${targetUserId}`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { roomId }) => [
        { type: "Room", id: roomId },
        "Room",
      ],
    }),

    leaveChannel: builder.mutation<
      { success: boolean },
      { roomId: string; channelId: string }
    >({
      query: ({ roomId, channelId }) => ({
        url: `/rooms/${roomId}/channels/${channelId}/leave`,
        method: "POST",
      }),
      // Không invalidate cache ngay — để socket event channel_member_left xử lý
      // nhằm tránh race condition. Chỉ invalidate nếu socket fail.
      invalidatesTags: (_result, _error, { roomId }) => [
        { type: "Room", id: roomId },
        "Room",
      ],
    }),
  }),
  overrideExisting: true,
});

export const {
  useGetMyRoomsQuery,
  useCreateRoomMutation,
  useJoinRoomMutation,
  useGetRoomByIdQuery,
  useAddChannelMutation,
  useGetRoomMembersQuery,
  useLeaveRoomMutation,
  useDisbandRoomMutation,
  useInviteMemberMutation,
  useGetRoomByCodeQuery,
  useRemoveMemberMutation,
  useCheckMemberByIdQuery,
  useCheckMemberByCodeQuery,
  useUpdateMemberRoleMutation,
  useTransferRoomOwnershipMutation,
  useRenameRoomMutation,
  useRenameChannelMutation,
  useUpdateChannelMemberRoleMutation,
  useAddChannelMemberMutation,
  useRemoveChannelMemberMutation,
  useLeaveChannelMutation,
} = roomsApi;
