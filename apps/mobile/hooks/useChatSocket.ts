import { useEffect, useRef, useState, useCallback } from "react";
import { socket } from "../lib/socket";
import { useDispatch } from "react-redux";
import { directChatApi } from "../lib/redux/api/directChatApi";
import { DirectMessageResponse, PinnedMessageDetail } from "../types/chat";

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
  const dispatch = useDispatch();
  const [isRecipientTyping, setIsRecipientTyping] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const debounceSendTypingRef = useRef<NodeJS.Timeout | null>(null);

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

  // Join và Leave Chat Room — dùng đúng tên event mà server lắng nghe: "chat:join" / "chat:leave"
  useEffect(() => {
    if (!conversationId) return;

    const joinRoom = () => {
      console.log(`[MobileChatSocket] Joining chat room: chat_${conversationId}`);
      // Đúng với server app.gateway.ts @SubscribeMessage("chat:join")
      socket.emit("chat:join", { conversationId });
    };

    if (socket.connected) {
      joinRoom();
    } else {
      socket.connect();
    }

    // Tự động join lại nếu socket reconnect
    socket.on("connect", joinRoom);

    return () => {
      console.log(`[MobileChatSocket] Leaving chat room: chat_${conversationId}`);
      socket.emit("chat:leave", { conversationId });
      socket.off("connect", joinRoom);
    };
  }, [conversationId]);

  // Lắng nghe các sự kiện socket
  useEffect(() => {
    const handleNewMessage = (message: DirectMessageResponse) => {
      console.log("[MobileChatSocket] Received chat:new_message:", message.id);
      dispatchRef.current(
        directChatApi.util.invalidateTags([
          { type: "DirectConversation", id: "LIST" },
        ])
      );

      if (message.conversationId === conversationIdRef.current) {
        onNewMessageRef.current?.(message);
        setIsRecipientTyping(false);
        if (typingTimeoutRef.current) {
          clearTimeout(typingTimeoutRef.current);
          typingTimeoutRef.current = null;
        }
      }
    };

    const handleReactionUpdated = (data: {
      messageId: string;
      reactions: any[];
    }) => {
      console.log("[MobileChatSocket] Received chat:reaction_updated:", data);
      onReactionUpdatedRef.current?.(data);
      dispatchRef.current(
        directChatApi.util.invalidateTags([
          { type: "DirectMessage", id: `REACTIONS_${data.messageId}` },
        ])
      );
    };

    const handleMessageDeleted = (data: {
      messageId: string;
      conversationId: string;
      wasPinned?: boolean;
      pinnedMessages?: PinnedMessageDetail[];
    }) => {
      console.log("[MobileChatSocket] Received chat:message_deleted:", data);
      if (data.conversationId === conversationIdRef.current) {
        onMessageDeletedRef.current?.(data);
      }
    };

    const handleMessagePinned = (data: {
      conversationId: string;
      message: DirectMessageResponse;
      pinnedMessages: PinnedMessageDetail[];
    }) => {
      console.log("[MobileChatSocket] Received chat:message_pinned:", data);
      if (data.conversationId === conversationIdRef.current) {
        onMessagePinnedRef.current?.(data);
      }
      dispatchRef.current(
        directChatApi.util.invalidateTags([
          { type: "DirectMessage", id: `PINS_${data.conversationId}` },
          { type: "DirectConversation", id: "LIST" },
        ])
      );
    };

    const handleMessageUnpinned = (data: {
      conversationId: string;
      messageId: string;
      pinnedMessages: PinnedMessageDetail[];
    }) => {
      console.log("[MobileChatSocket] Received chat:message_unpinned:", data);
      if (data.conversationId === conversationIdRef.current) {
        onMessageUnpinnedRef.current?.(data);
      }
      dispatchRef.current(
        directChatApi.util.invalidateTags([
          { type: "DirectMessage", id: `PINS_${data.conversationId}` },
          { type: "DirectConversation", id: "LIST" },
        ])
      );
    };

    const handleTyping = (data: {
      conversationId: string;
      userId: string;
      isTyping: boolean;
    }) => {
      if (
        data.conversationId === conversationIdRef.current &&
        data.userId !== currentUserIdRef.current
      ) {
        setIsRecipientTyping(data.isTyping);
        if (data.isTyping) {
          if (typingTimeoutRef.current) {
            clearTimeout(typingTimeoutRef.current);
          }
          typingTimeoutRef.current = setTimeout(() => {
            setIsRecipientTyping(false);
          }, 3500);
        }
      }
    };

    socket.on("chat:new_message", handleNewMessage);
    socket.on("chat:reaction_updated", handleReactionUpdated);
    socket.on("chat:message_deleted", handleMessageDeleted);
    socket.on("chat:message_pinned", handleMessagePinned);
    socket.on("chat:message_unpinned", handleMessageUnpinned);
    // Server phát "chat:typing_update" (không phải "chat:typing")
    socket.on("chat:typing_update", handleTyping);

    return () => {
      socket.off("chat:new_message", handleNewMessage);
      socket.off("chat:reaction_updated", handleReactionUpdated);
      socket.off("chat:message_deleted", handleMessageDeleted);
      socket.off("chat:message_pinned", handleMessagePinned);
      socket.off("chat:message_unpinned", handleMessageUnpinned);
      socket.off("chat:typing_update", handleTyping);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      if (debounceSendTypingRef.current) {
        clearTimeout(debounceSendTypingRef.current);
      }
    };
  }, []);

  const emitTyping = useCallback(
    (isTyping: boolean) => {
      if (!conversationIdRef.current || !currentUserIdRef.current) return;

      if (debounceSendTypingRef.current) {
        clearTimeout(debounceSendTypingRef.current);
      }

      debounceSendTypingRef.current = setTimeout(() => {
        socket.emit("chat:typing", {
          conversationId: conversationIdRef.current,
          userId: currentUserIdRef.current,
          isTyping,
        });
      }, 200);
    },
    []
  );

  return {
    isRecipientTyping,
    emitTyping,
  };
}
