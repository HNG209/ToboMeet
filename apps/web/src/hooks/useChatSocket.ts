import { useEffect, useRef, useState, useCallback } from "react";
import { socket } from "@/lib/socket";
import { useDispatch } from "react-redux";
import { directChatApi } from "@/lib/redux/api/directChatApi";
import { DirectMessageResponse, PinnedMessageDetail } from "@/types/chat";
import { AppDispatch } from "@/lib/redux/store";

interface UseChatSocketProps {
  conversationId?: string | null;
  currentUserId?: string;
  onNewMessage?: (message: DirectMessageResponse) => void;
  onReactionUpdated?: (data: { messageId: string; reactions: any[] }) => void;
  onMessageDeleted?: (data: {
    messageId: string;
    conversationId: string;
    wasPinned?: boolean;
    pinnedMessages?: PinnedMessageDetail[];
  }) => void;
  onMessagePinned?: (data: {
    conversationId: string;
    message: DirectMessageResponse;
    pinnedMessages: PinnedMessageDetail[];
  }) => void;
  onMessageUnpinned?: (data: {
    conversationId: string;
    messageId: string;
    pinnedMessages: PinnedMessageDetail[];
  }) => void;
}

export function useChatSocket({
  conversationId,
  currentUserId,
  onNewMessage,
  onReactionUpdated,
  onMessageDeleted,
  onMessagePinned,
  onMessageUnpinned,
}: UseChatSocketProps) {
  const dispatch = useDispatch<AppDispatch>();
  const [isRecipientTyping, setIsRecipientTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debounceSendTypingRef = useRef<NodeJS.Timeout | null>(null);

  // ─── Stable Refs: tránh re-register listeners khi component re-render ───
  const conversationIdRef = useRef(conversationId);
  const currentUserIdRef = useRef(currentUserId);
  const onNewMessageRef = useRef(onNewMessage);
  const onReactionUpdatedRef = useRef(onReactionUpdated);
  const onMessageDeletedRef = useRef(onMessageDeleted);
  const onMessagePinnedRef = useRef(onMessagePinned);
  const onMessageUnpinnedRef = useRef(onMessageUnpinned);
  const dispatchRef = useRef(dispatch);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  useEffect(() => {
    currentUserIdRef.current = currentUserId;
  }, [currentUserId]);

  useEffect(() => {
    onNewMessageRef.current = onNewMessage;
  }, [onNewMessage]);

  useEffect(() => {
    onReactionUpdatedRef.current = onReactionUpdated;
  }, [onReactionUpdated]);

  useEffect(() => {
    onMessageDeletedRef.current = onMessageDeleted;
  }, [onMessageDeleted]);

  useEffect(() => {
    onMessagePinnedRef.current = onMessagePinned;
  }, [onMessagePinned]);

  useEffect(() => {
    onMessageUnpinnedRef.current = onMessageUnpinned;
  }, [onMessageUnpinned]);

  useEffect(() => {
    dispatchRef.current = dispatch;
  }, [dispatch]);

  // ─── Tham gia / rời khỏi phòng chat realtime khi conversationId thay đổi ───
  useEffect(() => {
    if (!conversationId) return;

    const joinChat = () => {
      console.log("[ChatSocket] Emitting chat:join for conversation:", conversationId);
      socket.emit("chat:join", { conversationId });
    };

    // Đăng ký connect handler để tự động join lại nếu socket reconnect
    socket.on("connect", joinChat);

    if (socket.connected) {
      joinChat();
    } else {
      socket.connect();
    }

    return () => {
      socket.off("connect", joinChat);
      console.log("[ChatSocket] Emitting chat:leave for conversation:", conversationId);
      socket.emit("chat:leave", { conversationId });
      setIsRecipientTyping(false);
      if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    };
  }, [conversationId]);

  // ─── Đăng ký các sự kiện socket (chỉ đăng ký 1 lần) ───
  useEffect(() => {
    const handleNewMessage = (msg: DirectMessageResponse) => {
      console.log("[ChatSocket] Received chat:new_message:", msg);
      if (msg.conversationId === conversationIdRef.current) {
        onNewMessageRef.current?.(msg);
      }
      // Cập nhật danh sách conversation ngoài sidebar trực tiếp vào cache RTK Query (0 network request)
      dispatchRef.current(
        directChatApi.util.updateQueryData("getConversations", undefined, (draft) => {
          const index = draft.findIndex((c) => c.id === msg.conversationId);
          if (index !== -1) {
            draft[index].lastMessagePreview =
              msg.content || (msg.attachments?.length ? "[Tệp đính kèm]" : "");
            draft[index].lastMessageAt = msg.createdAt;
            if (msg.conversationId !== conversationIdRef.current) {
              draft[index].unreadCount = (draft[index].unreadCount || 0) + 1;
            }
            const [conv] = draft.splice(index, 1);
            draft.unshift(conv);
          }
        }),
      );
    };

    const handleConversationUpdated = (data: {
      conversationId: string;
      previewText: string;
    }) => {
      console.log("[ChatSocket] Received chat:conversation_updated:", data);
      dispatchRef.current(
        directChatApi.util.updateQueryData("getConversations", undefined, (draft) => {
          const index = draft.findIndex((c) => c.id === data.conversationId);
          if (index !== -1) {
            draft[index].lastMessagePreview = data.previewText;
            draft[index].lastMessageAt = new Date().toISOString();
            if (data.conversationId !== conversationIdRef.current) {
              draft[index].unreadCount = (draft[index].unreadCount || 0) + 1;
            }
            const [conv] = draft.splice(index, 1);
            draft.unshift(conv);
          }
        }),
      );
    };

    const handleTypingUpdate = (data: {
      conversationId: string;
      userId: string;
      isTyping: boolean;
    }) => {
      if (
        data.conversationId === conversationIdRef.current &&
        data.userId !== currentUserIdRef.current
      ) {
        setIsRecipientTyping(data.isTyping);

        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
        }

        if (data.isTyping) {
          typingTimeoutRef.current = setTimeout(() => {
            setIsRecipientTyping(false);
          }, 3500);
        }
      }
    };

    const handleReactionUpdated = (data: {
      messageId: string;
      reactions: any[];
    }) => {
      console.log("[ChatSocket] Received chat:reaction_updated:", data);
      onReactionUpdatedRef.current?.(data);
    };

    const handleMessageDeleted = (data: {
      messageId: string;
      conversationId: string;
      wasPinned?: boolean;
      pinnedMessages?: PinnedMessageDetail[];
    }) => {
      console.log("[ChatSocket] Received chat:message_deleted:", data);
      if (data.conversationId === conversationIdRef.current) {
        onMessageDeletedRef.current?.(data);
      }
    };

    const handleMessagePinned = (data: {
      conversationId: string;
      message: DirectMessageResponse;
      pinnedMessages: PinnedMessageDetail[];
    }) => {
      console.log("[ChatSocket] Received chat:message_pinned:", data);
      if (data.conversationId === conversationIdRef.current) {
        onMessagePinnedRef.current?.(data);
      }
      // Cập nhật tag cache RTK Query
      dispatchRef.current(
        directChatApi.util.invalidateTags([
          { type: "DirectMessage", id: `PINS_${data.conversationId}` },
          { type: "DirectConversation", id: "LIST" },
        ]),
      );
    };

    const handleMessageUnpinned = (data: {
      conversationId: string;
      messageId: string;
      pinnedMessages: PinnedMessageDetail[];
    }) => {
      console.log("[ChatSocket] Received chat:message_unpinned:", data);
      if (data.conversationId === conversationIdRef.current) {
        onMessageUnpinnedRef.current?.(data);
      }
      // Cập nhật tag cache RTK Query
      dispatchRef.current(
        directChatApi.util.invalidateTags([
          { type: "DirectMessage", id: `PINS_${data.conversationId}` },
          { type: "DirectConversation", id: "LIST" },
        ]),
      );
    };

    socket.on("chat:new_message", handleNewMessage);
    socket.on("chat:conversation_updated", handleConversationUpdated);
    socket.on("chat:typing_update", handleTypingUpdate);
    socket.on("chat:reaction_updated", handleReactionUpdated);
    socket.on("chat:message_deleted", handleMessageDeleted);
    socket.on("chat:message_pinned", handleMessagePinned);
    socket.on("chat:message_unpinned", handleMessageUnpinned);

    return () => {
      socket.off("chat:new_message", handleNewMessage);
      socket.off("chat:conversation_updated", handleConversationUpdated);
      socket.off("chat:typing_update", handleTypingUpdate);
      socket.off("chat:reaction_updated", handleReactionUpdated);
      socket.off("chat:message_deleted", handleMessageDeleted);
      socket.off("chat:message_pinned", handleMessagePinned);
      socket.off("chat:message_unpinned", handleMessageUnpinned);
    };
  }, []);

  // ─── Hàm phát tín hiệu đang gõ ───
  const emitTyping = useCallback(
    (isTyping: boolean) => {
      const activeConvId = conversationIdRef.current;
      const currentUid = currentUserIdRef.current;
      if (!activeConvId || !currentUid) return;

      if (debounceSendTypingRef.current) {
        clearTimeout(debounceSendTypingRef.current);
      }

      debounceSendTypingRef.current = setTimeout(() => {
        socket.emit("chat:typing", {
          conversationId: activeConvId,
          userId: currentUid,
          isTyping,
        });
      }, 150);
    },
    [],
  );

  return {
    isRecipientTyping,
    emitTyping,
  };
}
