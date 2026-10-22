"use client";

import React, { useState, useEffect, useCallback } from "react";
import {
  directChatApi,
  useGetConversationsQuery,
  useGetMessagesQuery,
  useLazyGetMessagesQuery,
  useCreateOrGetConversationMutation,
  useSendMessageMutation,
  useMarkAsReadMutation,
  useReactMessageMutation,
  useDeleteMessageMutation,
  useGetPinnedMessagesQuery,
  usePinMessageMutation,
  useUnpinMessageMutation,
} from "@/lib/redux/api/directChatApi";
import { useDispatch } from "react-redux";
import { useGetMeQuery } from "@/lib/redux/api/usersApi";
import { useChatSocket } from "@/hooks/useChatSocket";
import {
  DirectConversationResponse,
  DirectMessageResponse,
  ChatAttachment,
  PinnedMessageDetail,
} from "@/types/chat";
import ConversationList from "./ConversationList";
import MessageThread from "./MessageThread";
import ConversationDetailsDrawer from "./ConversationDetailsDrawer";
import MessageReactionsModal from "./MessageReactionsModal";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

export default function ChatLayout() {
  const t = useTranslations("direct_chat");
  const dispatch = useDispatch();
  const { data: currentUser } = useGetMeQuery();
  const currentUserId = currentUser?.supabaseId;

  const {
    data: conversations = [],
    isLoading: isLoadingConversations,
  } = useGetConversationsQuery();

  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [localMessages, setLocalMessages] = useState<DirectMessageResponse[]>([]);
  const [localPinnedMessages, setLocalPinnedMessages] = useState<PinnedMessageDetail[]>([]);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [pinningMessageId, setPinningMessageId] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [reactionModal, setReactionModal] = useState<{
    isOpen: boolean;
    messageId: string;
    initialTab?: string;
  }>({
    isOpen: false,
    messageId: "",
  });

  // Active conversation object
  const activeConversation = conversations.find((c) => c.id === selectedConvId);

  // RTK Query Mutations
  const [createOrGetConversation] = useCreateOrGetConversationMutation();
  const [sendMessage] = useSendMessageMutation();
  const [markAsRead] = useMarkAsReadMutation();
  const [reactMessage] = useReactMessageMutation();
  const [deleteMessage] = useDeleteMessageMutation();
  const [fetchMoreMessages] = useLazyGetMessagesQuery();
  const [pinMessageMutation] = usePinMessageMutation();
  const [unpinMessageMutation] = useUnpinMessageMutation();

  // Load messages for selected conversation
  const {
    data: initialMessagesData,
    isLoading: isLoadingMessages,
  } = useGetMessagesQuery(
    { conversationId: selectedConvId!, limit: 30 },
    { skip: !selectedConvId },
  );

  // Load pinned messages for selected conversation
  const { data: initialPinnedData } = useGetPinnedMessagesQuery(
    selectedConvId!,
    { skip: !selectedConvId },
  );

  // Sync initial messages to local state
  useEffect(() => {
    if (initialMessagesData) {
      setLocalMessages(initialMessagesData.messages || []);
      setHasMore(initialMessagesData.hasMore || false);
    } else {
      setLocalMessages([]);
      setHasMore(false);
    }
  }, [initialMessagesData, selectedConvId]);

  // Sync initial pinned messages to local state
  useEffect(() => {
    if (initialPinnedData) {
      setLocalPinnedMessages(initialPinnedData);
    } else {
      setLocalPinnedMessages([]);
    }
  }, [initialPinnedData, selectedConvId]);

  // Mark conversation as read when opened
  useEffect(() => {
    if (selectedConvId && activeConversation && activeConversation.unreadCount > 0) {
      markAsRead(selectedConvId).catch(() => {});
    }
  }, [selectedConvId, activeConversation, markAsRead]);

  // Socket handlers
  const handleSocketNewMessage = useCallback(
    (newMsg: DirectMessageResponse) => {
      setLocalMessages((prev) => {
        const realId = newMsg.id || newMsg._id;

        // Nếu là tin nhắn do chính mình gửi, thay thế tin tạm optimistic (nếu có)
        if (newMsg.senderId === currentUserId) {
          const alreadyHasReal = prev.some(
            (m) => (m.id && m.id === realId) || (m._id && m._id === realId),
          );
          if (alreadyHasReal) {
            return prev.filter((m) => !m.id?.startsWith("temp_"));
          }

          const tempIdx = prev.findIndex(
            (m) =>
              m.id?.startsWith("temp_") &&
              m.conversationId === newMsg.conversationId &&
              m.content === newMsg.content,
          );

          if (tempIdx !== -1) {
            const next = [...prev];
            next[tempIdx] = newMsg;
            return next;
          }
        }

        // Tránh trùng tin nhắn nếu đã có trong danh sách
        const alreadyExists = prev.some(
          (m) =>
            (m.id && m.id === realId) ||
            ((m as any)._id && (m as any)._id === realId),
        );
        if (alreadyExists) {
          return prev;
        }

        return [...prev, newMsg];
      });

      // Chỉ tự động đánh dấu đã đọc nếu là tin nhắn từ người khác gửi đến
      if (
        selectedConvId &&
        newMsg.conversationId === selectedConvId &&
        newMsg.senderId !== currentUserId
      ) {
        markAsRead(selectedConvId).catch(() => {});
      }
    },
    [selectedConvId, currentUserId, markAsRead],
  );

  const handleSocketReactionUpdated = useCallback(
    (data: { messageId: string; reactions: any[] }) => {
      setLocalMessages((prev) =>
        prev.map((msg) =>
          msg.id === data.messageId || msg._id === data.messageId
            ? { ...msg, reactions: data.reactions }
            : msg,
        ),
      );
      dispatch(
        directChatApi.util.invalidateTags([
          { type: "DirectMessage", id: `REACTIONS_${data.messageId}` },
        ]),
      );
    },
    [dispatch],
  );

  const handleSocketMessageDeleted = useCallback(
    (data: {
      messageId: string;
      conversationId: string;
      wasPinned?: boolean;
      pinnedMessages?: PinnedMessageDetail[];
    }) => {
      setLocalMessages((prev) =>
        prev.map((msg) =>
          msg.id === data.messageId || msg._id === data.messageId
            ? {
                ...msg,
                deletedAt: new Date().toISOString(),
                content: t("message_deleted"),
                attachments: [],
                isPinned: false,
              }
            : msg,
        ),
      );

      if (data.pinnedMessages) {
        setLocalPinnedMessages(data.pinnedMessages);
      } else {
        setLocalPinnedMessages((prev) =>
          prev.filter((p) => p.id !== data.messageId && p._id !== data.messageId),
        );
      }
    },
    [t],
  );

  const handleSocketMessagePinned = useCallback(
    (data: {
      conversationId: string;
      message: DirectMessageResponse;
      pinnedMessages: PinnedMessageDetail[];
    }) => {
      if (data.conversationId === selectedConvId) {
        setLocalPinnedMessages(data.pinnedMessages || []);
        setLocalMessages((prev) =>
          prev.map((msg) =>
            msg.id === data.message.id || msg._id === data.message.id
              ? {
                  ...msg,
                  isPinned: true,
                  pinnedBy: data.message.pinnedBy,
                  pinnedAt: data.message.pinnedAt,
                }
              : msg,
          ),
        );
      }
    },
    [selectedConvId],
  );

  const handleSocketMessageUnpinned = useCallback(
    (data: {
      conversationId: string;
      messageId: string;
      pinnedMessages: PinnedMessageDetail[];
    }) => {
      if (data.conversationId === selectedConvId) {
        setLocalPinnedMessages(data.pinnedMessages || []);
        setLocalMessages((prev) =>
          prev.map((msg) =>
            msg.id === data.messageId || msg._id === data.messageId
              ? { ...msg, isPinned: false, pinnedBy: null, pinnedAt: null }
              : msg,
          ),
        );
      }
    },
    [selectedConvId],
  );

  const { isRecipientTyping, emitTyping } = useChatSocket({
    conversationId: selectedConvId,
    currentUserId,
    onNewMessage: handleSocketNewMessage,
    onReactionUpdated: handleSocketReactionUpdated,
    onMessageDeleted: handleSocketMessageDeleted,
    onMessagePinned: handleSocketMessagePinned,
    onMessageUnpinned: handleSocketMessageUnpinned,
  });

  // Action: Load more messages (older)
  const handleLoadMore = async () => {
    if (!selectedConvId || !hasMore || isLoadingMore || localMessages.length === 0) {
      return;
    }

    setIsLoadingMore(true);
    try {
      const oldestId = localMessages[0].id || localMessages[0]._id;
      const res = await fetchMoreMessages({
        conversationId: selectedConvId,
        before: oldestId,
        limit: 30,
      }).unwrap();

      if (res && res.messages) {
        setLocalMessages((prev) => {
          const existingIds = new Set(
            prev.map((m) => m.id || (m as any)._id).filter(Boolean),
          );
          const uniqueNewMessages = res.messages.filter(
            (m: DirectMessageResponse) =>
              !existingIds.has(m.id || (m as any)._id),
          );
          return [...uniqueNewMessages, ...prev];
        });
        setHasMore(res.hasMore);
      }
    } catch (err) {
      console.error("Load more error:", err);
    } finally {
      setIsLoadingMore(false);
    }
  };

  // Action: Send message (Optimistic UI - Hiển thị tức thì 0ms)
  const handleSendMessage = async (payload: {
    content?: string;
    type?: "text" | "file" | "video" | "image";
    attachments?: ChatAttachment[];
    replyToId?: string;
  }) => {
    if (!selectedConvId) return;

    // Sinh ID tạm cho tin nhắn optimistic
    const tempId = `temp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    let replyObj: any = null;
    if (payload.replyToId) {
      const found = localMessages.find(
        (m) => m.id === payload.replyToId || (m as any)._id === payload.replyToId,
      );
      if (found) {
        replyObj = {
          _id: found.id || (found as any)._id,
          content: found.content,
          senderId: found.senderId,
          type: found.type,
          attachments: found.attachments || [],
          deletedAt: found.deletedAt,
        };
      }
    }

    const optimisticMsg: DirectMessageResponse = {
      id: tempId,
      _id: tempId,
      conversationId: selectedConvId,
      senderId: currentUserId || "",
      sender: currentUser
        ? {
            supabaseId: currentUser.supabaseId,
            displayName: currentUser.displayName,
            avatarUrl: currentUser.avatarUrl,
            email: currentUser.email,
          }
        : undefined,
      type: payload.type || "text",
      content: payload.content || "",
      attachments: payload.attachments || [],
      replyToId: replyObj,
      reactions: [],
      isPinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 1. Render tin nhắn ngay lập tức trên UI (0ms delay)
    setLocalMessages((prev) => [...prev, optimisticMsg]);

    try {
      const res = await sendMessage({
        conversationId: selectedConvId,
        ...payload,
      }).unwrap();

      if (res) {
        const realId = res.id || res._id;
        setLocalMessages((prev) => {
          // Nếu socket đã chèn tin thật trước
          const alreadyHasReal = prev.some(
            (m) => (m.id && m.id === realId) || (m._id && m._id === realId),
          );

          if (alreadyHasReal) {
            return prev.filter((m) => m.id !== tempId);
          }

          // Thay thế tin tạm bằng dữ liệu thật từ response
          const hasTemp = prev.some((m) => m.id === tempId);
          if (hasTemp) {
            return prev.map((m) => (m.id === tempId ? res : m));
          }

          return [...prev, res];
        });
      }
    } catch (err) {
      console.error("[ChatLayout] Send message error:", err);
      // Xóa tin tạm nếu gửi thất bại
      setLocalMessages((prev) => prev.filter((m) => m.id !== tempId));
      throw err;
    }
  };

  // Action: React to message
  const handleReactMessage = async (messageId: string, emoji: string) => {
    // Optimistic update: áp dụng logic duy nhất 1 reaction ngay lập tức
    if (currentUserId) {
      setLocalMessages((prev) =>
        prev.map((msg) => {
          if (msg.id !== messageId && msg._id !== messageId) return msg;

          const reactions = (msg.reactions || []).map((r) => ({
            emoji: r.emoji,
            userIds: [...(r.userIds || [])],
          }));

          let wasSameEmoji = false;
          for (let i = reactions.length - 1; i >= 0; i--) {
            const r = reactions[i];
            const uIdx = r.userIds.indexOf(currentUserId);
            if (uIdx > -1) {
              if (r.emoji === emoji) {
                wasSameEmoji = true;
              }
              r.userIds.splice(uIdx, 1);
              if (r.userIds.length === 0) {
                reactions.splice(i, 1);
              }
            }
          }

          if (!wasSameEmoji) {
            const targetIndex = reactions.findIndex((r) => r.emoji === emoji);
            if (targetIndex > -1) {
              reactions[targetIndex].userIds.push(currentUserId);
            } else {
              reactions.push({ emoji, userIds: [currentUserId] });
            }
          }

          const cleanReactions = reactions.filter(
            (r) => r.userIds && r.userIds.length > 0,
          );

          return { ...msg, reactions: cleanReactions };
        }),
      );
    }

    try {
      await reactMessage({ messageId, emoji }).unwrap();
    } catch (err) {
      console.error("React error:", err);
    }
  };

  // Action: Delete/Recall message
  const handleDeleteMessage = async (messageId: string) => {
    // Optimistic update trên máy người gửi
    setLocalMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId || msg._id === messageId
          ? {
              ...msg,
              deletedAt: new Date().toISOString(),
              content: t("message_deleted"),
              attachments: [],
            }
          : msg,
      ),
    );

    try {
      await deleteMessage(messageId).unwrap();
      toast.success(t("delete_success"));
    } catch (err) {
      console.error("Delete error:", err);
      toast.error(t("delete_failed"));
    }
  };

  // Action: Pin message
  const handlePinMessage = async (messageId: string) => {
    if (!selectedConvId) return;
    if (localPinnedMessages.length >= 3) {
      toast.error(
        t("pin_limit_error") ||
          "Cuộc trò chuyện chỉ được ghim tối đa 3 tin nhắn. Vui lòng bỏ ghim một tin nhắn trước khi ghim tin mới.",
      );
      return;
    }

    setPinningMessageId(messageId);
    try {
      const res = await pinMessageMutation({
        messageId,
        conversationId: selectedConvId,
      }).unwrap();

      if (res && res.pinnedMessages) {
        setLocalPinnedMessages(res.pinnedMessages);
        setLocalMessages((prev) =>
          prev.map((m) =>
            m.id === messageId || m._id === messageId
              ? {
                  ...m,
                  isPinned: true,
                  pinnedBy: currentUserId,
                  pinnedAt: new Date().toISOString(),
                }
              : m,
          ),
        );
      }
      toast.success(t("pin_success"));
    } catch (err: any) {
      console.warn("[DirectChat] Pin notice:", err?.message || err);
      toast.error(err?.message || err?.data?.message || t("pin_failed"));
    } finally {
      setPinningMessageId(null);
    }
  };

  // Action: Unpin message
  const handleUnpinMessage = async (messageId: string) => {
    if (!selectedConvId) return;
    setPinningMessageId(messageId);
    try {
      const res = await unpinMessageMutation({
        messageId,
        conversationId: selectedConvId,
      }).unwrap();

      if (res && res.pinnedMessages) {
        setLocalPinnedMessages(res.pinnedMessages);
        setLocalMessages((prev) =>
          prev.map((m) =>
            m.id === messageId || m._id === messageId
              ? { ...m, isPinned: false, pinnedBy: null, pinnedAt: null }
              : m,
          ),
        );
      }
      toast.success(t("unpin_success"));
    } catch (err: any) {
      console.warn("[DirectChat] Unpin notice:", err?.message || err);
      toast.error(err?.message || err?.data?.message || t("unpin_failed"));
    } finally {
      setPinningMessageId(null);
    }
  };

  // Action: Jump to pinned message & highlight
  const handleJumpToMessage = async (messageId: string) => {
    if (!selectedConvId) return;

    let element = document.getElementById(`message-${messageId}`);
    if (!element && hasMore) {
      let currentList = localMessages;
      let hasMoreToFetch: boolean = hasMore;
      let found = false;

      for (let i = 0; i < 5 && !found && hasMoreToFetch; i++) {
        const oldestId = currentList[0]?.id || currentList[0]?._id;
        if (!oldestId) break;

        try {
          const res = await fetchMoreMessages({
            conversationId: selectedConvId,
            before: oldestId,
            limit: 30,
          }).unwrap();

          if (!res || !res.messages || res.messages.length === 0) break;

          currentList = [...res.messages, ...currentList];
          setLocalMessages(currentList);
          hasMoreToFetch = res.hasMore;
          setHasMore(res.hasMore);

          if (currentList.some((m) => m.id === messageId || m._id === messageId)) {
            found = true;
            break;
          }
        } catch {
          break;
        }
      }
    }

    setTimeout(() => {
      const targetElement = document.getElementById(`message-${messageId}`);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
        setHighlightedMessageId(messageId);
        setTimeout(() => setHighlightedMessageId(null), 2500);
      }
    }, 150);
  };

  // Action: Select user from search modal to start chat
  const handleSelectUser = async (user: any) => {
    const targetUserId = user.supabaseId || user._id;
    if (!targetUserId) return;

    try {
      const conv = await createOrGetConversation({
        recipientId: targetUserId,
      }).unwrap();

      setSelectedConvId(conv.id);
    } catch (err: any) {
      console.error("Create conversation error:", err);
      toast.error(err?.data?.message || t("create_conversation_failed"));
    }
  };

  // Action: Open reaction details modal
  const handleOpenReactions = useCallback((messageId: string, emoji?: string) => {
    setReactionModal({
      isOpen: true,
      messageId,
      initialTab: emoji || "all",
    });
  }, []);

  return (
    <div className="h-full w-full flex overflow-hidden bg-white">
      {/* ── Column 1: Conversations List ── */}
      <div
        className={`h-full shrink-0 ${
          selectedConvId ? "hidden md:flex" : "flex w-full md:w-auto"
        }`}
      >
        <ConversationList
          conversations={conversations}
          selectedId={selectedConvId}
          currentUserId={currentUserId}
          onSelect={(c) => setSelectedConvId(c.id)}
          onSelectUser={handleSelectUser}
          isLoading={isLoadingConversations}
        />
      </div>

      {/* ── Column 2: Message Thread Area ── */}
      <div
        className={`flex-1 h-full min-w-0 flex flex-col ${
          !selectedConvId ? "hidden md:flex bg-slate-50/40" : "flex"
        }`}
      >
        {activeConversation ? (
          <MessageThread
            conversation={activeConversation}
            currentUserId={currentUserId}
            messages={localMessages}
            pinnedMessages={localPinnedMessages}
            highlightedMessageId={highlightedMessageId}
            pinningMessageId={pinningMessageId}
            hasMore={hasMore}
            isLoadingMessages={isLoadingMessages}
            isLoadingMore={isLoadingMore}
            isRecipientTyping={isRecipientTyping}
            onLoadMore={handleLoadMore}
            onSendMessage={handleSendMessage}
            onReactMessage={handleReactMessage}
            onDeleteMessage={handleDeleteMessage}
            onPinMessage={handlePinMessage}
            onUnpinMessage={handleUnpinMessage}
            onJumpToMessage={handleJumpToMessage}
            onOpenReactions={handleOpenReactions}
            onTyping={emitTyping}
            onBackMobile={() => setSelectedConvId(null)}
            onToggleDetails={() => setShowDetails(!showDetails)}
            showDetails={showDetails}
          />
        ) : (
          <div className="flex-1 h-full w-full bg-slate-50/40" />
        )}
      </div>

      {/* ── Column 3: Conversation Details Drawer (Collapsible) ── */}
      {activeConversation && showDetails && (
        <ConversationDetailsDrawer
          conversation={activeConversation}
          messages={localMessages}
          isOpen={showDetails}
          onClose={() => setShowDetails(false)}
        />
      )}

      {/* ── Reactions List Modal ── */}
      {reactionModal.isOpen && (
        <MessageReactionsModal
          isOpen={reactionModal.isOpen}
          onClose={() =>
            setReactionModal((prev) => ({ ...prev, isOpen: false }))
          }
          messageId={reactionModal.messageId}
          initialTab={reactionModal.initialTab}
        />
      )}
    </div>
  );
}
