import { baseApi } from "./baseApi";
import {
  DirectConversationResponse,
  DirectMessageResponse,
  ChatMessagesPaginationResponse,
  ChatAttachment,
  PinnedMessageDetail,
  ChatMessageReactionUserDetail,
} from "@/types/chat";

export interface SendMessagePayload {
  conversationId: string;
  content?: string;
  type?: "text" | "file" | "video" | "image";
  attachments?: ChatAttachment[];
  replyToId?: string;
}

export interface GetUploadUrlPayload {
  conversationId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}

export interface UploadUrlResponse {
  signedUrl: string;
  url: string;
  fileName: string;
  fileType: "image" | "video" | "file";
  fileSize: number;
  mimeType: string;
}

export const directChatApi = baseApi.injectEndpoints({
  endpoints: (builder) => ({
    getConversations: builder.query<DirectConversationResponse[], void>({
      query: () => ({
        url: "/direct-chat/conversations",
        method: "GET",
      }),
      providesTags: (result) =>
        result
          ? [
              ...result.map(({ id }) => ({
                type: "DirectConversation" as const,
                id,
              })),
              { type: "DirectConversation", id: "LIST" },
            ]
          : [{ type: "DirectConversation", id: "LIST" }],
    }),

    getConversationById: builder.query<DirectConversationResponse, string>({
      query: (id) => ({
        url: `/direct-chat/conversations/${id}`,
        method: "GET",
      }),
      providesTags: (_result, _error, id) => [
        { type: "DirectConversation", id },
      ],
    }),

    getMessages: builder.query<
      ChatMessagesPaginationResponse,
      { conversationId: string; before?: string; limit?: number }
    >({
      query: ({ conversationId, before, limit }) => ({
        url: `/direct-chat/conversations/${conversationId}/messages`,
        method: "GET",
        params: { before, limit },
      }),
      providesTags: (_result, _error, { conversationId }) => [
        { type: "DirectMessage", id: conversationId },
      ],
    }),

    createOrGetConversation: builder.mutation<
      DirectConversationResponse,
      { recipientId: string }
    >({
      query: (data) => ({
        url: "/direct-chat/conversations",
        method: "POST",
        data,
      }),
      invalidatesTags: [{ type: "DirectConversation", id: "LIST" }],
    }),

    sendMessage: builder.mutation<DirectMessageResponse, SendMessagePayload>({
      query: ({ conversationId, ...data }) => ({
        url: `/direct-chat/conversations/${conversationId}/messages`,
        method: "POST",
        data,
      }),
      async onQueryStarted({ conversationId, content, attachments }, { dispatch, queryFulfilled }) {
        let preview = content || "";
        if (attachments && attachments.length > 0) {
          const firstAtt = attachments[0];
          if (firstAtt.fileType === "image") preview = content ? `📷 ${content}` : "📷 [Hình ảnh]";
          else if (firstAtt.fileType === "video") preview = content ? `🎥 ${content}` : "🎥 [Video]";
          else preview = content ? `📎 ${content}` : `📎 [Tệp: ${firstAtt.fileName}]`;
        }

        const now = new Date().toISOString();
        const patchList = dispatch(
          directChatApi.util.updateQueryData("getConversations", undefined, (draft) => {
            const index = draft.findIndex((c) => c.id === conversationId);
            if (index !== -1) {
              draft[index].lastMessagePreview = preview;
              draft[index].lastMessageAt = now;
              const [conv] = draft.splice(index, 1);
              draft.unshift(conv);
            }
          }),
        );
        const patchSingle = dispatch(
          directChatApi.util.updateQueryData("getConversationById", conversationId, (draft) => {
            if (draft) {
              draft.lastMessagePreview = preview;
              draft.lastMessageAt = now;
            }
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patchList.undo();
          patchSingle.undo();
        }
      },
    }),

    markAsRead: builder.mutation<{ success: boolean }, string>({
      query: (conversationId) => ({
        url: `/direct-chat/conversations/${conversationId}/read`,
        method: "PUT",
      }),
      async onQueryStarted(conversationId, { dispatch, queryFulfilled }) {
        const patchList = dispatch(
          directChatApi.util.updateQueryData("getConversations", undefined, (draft) => {
            const conv = draft.find((c) => c.id === conversationId);
            if (conv) conv.unreadCount = 0;
          }),
        );
        const patchSingle = dispatch(
          directChatApi.util.updateQueryData("getConversationById", conversationId, (draft) => {
            if (draft) draft.unreadCount = 0;
          }),
        );
        try {
          await queryFulfilled;
        } catch {
          patchList.undo();
          patchSingle.undo();
        }
      },
    }),

    reactMessage: builder.mutation<
      { messageId: string; reactions: any[] },
      { messageId: string; emoji: string }
    >({
      query: ({ messageId, emoji }) => ({
        url: `/direct-chat/messages/${messageId}/react`,
        method: "POST",
        data: { emoji },
      }),
      invalidatesTags: (_result, _error, { messageId }) => [
        { type: "DirectMessage", id: `REACTIONS_${messageId}` },
      ],
    }),

    getMessageReactions: builder.query<
      ChatMessageReactionUserDetail[],
      string
    >({
      query: (messageId) => ({
        url: `/direct-chat/messages/${messageId}/reactions`,
        method: "GET",
      }),
      providesTags: (_result, _error, messageId) => [
        { type: "DirectMessage", id: `REACTIONS_${messageId}` },
      ],
    }),

    deleteMessage: builder.mutation<
      { messageId: string; deletedAt: string },
      string
    >({
      query: (messageId) => ({
        url: `/direct-chat/messages/${messageId}`,
        method: "DELETE",
      }),
      invalidatesTags: [{ type: "DirectConversation", id: "LIST" }],
    }),

    getChatUploadUrl: builder.mutation<UploadUrlResponse, GetUploadUrlPayload>({
      query: ({ conversationId, ...data }) => ({
        url: `/direct-chat/conversations/${conversationId}/upload`,
        method: "POST",
        data,
      }),
    }),

    getPinnedMessages: builder.query<PinnedMessageDetail[], string>({
      query: (conversationId) => ({
        url: `/direct-chat/conversations/${conversationId}/pinned-messages`,
        method: "GET",
      }),
      providesTags: (_result, _error, conversationId) => [
        { type: "DirectMessage", id: `PINS_${conversationId}` },
      ],
    }),

    pinMessage: builder.mutation<
      {
        success: boolean;
        message: DirectMessageResponse;
        pinnedMessages: PinnedMessageDetail[];
      },
      { messageId: string; conversationId: string }
    >({
      query: ({ messageId }) => ({
        url: `/direct-chat/messages/${messageId}/pin`,
        method: "POST",
      }),
      invalidatesTags: (_result, _error, { conversationId }) => [
        { type: "DirectMessage", id: `PINS_${conversationId}` },
        { type: "DirectConversation", id: "LIST" },
      ],
    }),

    unpinMessage: builder.mutation<
      {
        success: boolean;
        messageId: string;
        pinnedMessages: PinnedMessageDetail[];
      },
      { messageId: string; conversationId: string }
    >({
      query: ({ messageId }) => ({
        url: `/direct-chat/messages/${messageId}/pin`,
        method: "DELETE",
      }),
      invalidatesTags: (_result, _error, { conversationId }) => [
        { type: "DirectMessage", id: `PINS_${conversationId}` },
        { type: "DirectConversation", id: "LIST" },
      ],
    }),
  }),
  overrideExisting: true,
});

export const {
  useGetConversationsQuery,
  useGetConversationByIdQuery,
  useGetMessagesQuery,
  useLazyGetMessagesQuery,
  useCreateOrGetConversationMutation,
  useSendMessageMutation,
  useMarkAsReadMutation,
  useReactMessageMutation,
  useDeleteMessageMutation,
  useGetChatUploadUrlMutation,
  useGetPinnedMessagesQuery,
  useLazyGetPinnedMessagesQuery,
  usePinMessageMutation,
  useUnpinMessageMutation,
  useGetMessageReactionsQuery,
} = directChatApi;
