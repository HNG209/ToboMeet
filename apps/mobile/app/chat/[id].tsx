import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  FlatList,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import Animated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Feather } from "@expo/vector-icons";
import {
  useGetConversationByIdQuery,
  useGetMessagesQuery,
  useLazyGetMessagesQuery,
  useSendMessageMutation,
  useMarkAsReadMutation,
  useReactMessageMutation,
  useDeleteMessageMutation,
  usePinMessageMutation,
  useUnpinMessageMutation,
  useGetPinnedMessagesQuery,
} from "../../lib/redux/api/directChatApi";
import { useGetMeQuery } from "../../lib/redux/features/users/usersApi";
import { useChatSocket } from "../../hooks/useChatSocket";
import {
  DirectMessageResponse,
  PinnedMessageDetail,
  ChatAttachment,
} from "../../types/chat";
import MobileUserAvatar from "../../components/chat/MobileUserAvatar";
import MobilePinnedMessagesBar from "../../components/chat/MobilePinnedMessagesBar";
import MobileMessageBubble from "../../components/chat/MobileMessageBubble";
import MobileMessageInput from "../../components/chat/MobileMessageInput";
import MobileMessageActionSheet from "../../components/chat/MobileMessageActionSheet";
import MobileMessageReactionsModal from "../../components/chat/MobileMessageReactionsModal";
import MobileAttachmentViewerModal from "../../components/chat/MobileAttachmentViewerModal";
import MobileConversationDetailsModal from "../../components/chat/MobileConversationDetailsModal";
import * as FileSystem from "expo-file-system/legacy";
import { useTranslation } from "react-i18next";

export default function ConversationScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const conversationId = Array.isArray(id) ? id[0] : id;

  // UI-thread animated keyboard: bám sát native WindowInsets từng frame (60/120fps), triệt tiêu độ trễ
  const keyboard = useAnimatedKeyboard({
    isStatusBarTranslucentAndroid: true,
  });

  const animatedContainerStyle = useAnimatedStyle(() => {
    const h = keyboard.height.value;
    const padding =
      Platform.OS === "ios"
        ? h > 0
          ? Math.max(0, h - insets.bottom)
          : 0
        : h;
    return {
      paddingBottom: padding,
    };
  });

  const { data: currentUser } = useGetMeQuery();
  const currentUserId = currentUser?.supabaseId;

  const { data: conversation, isLoading: isLoadingConv } =
    useGetConversationByIdQuery(conversationId, { skip: !conversationId });

  const { data: initialMessagesData, isLoading: isLoadingMessages } =
    useGetMessagesQuery(
      { conversationId, limit: 30 },
      { skip: !conversationId }
    );

  const [fetchMoreMessages, { isFetching: isLoadingMore }] =
    useLazyGetMessagesQuery();

  const { data: pinnedMessages = [] } = useGetPinnedMessagesQuery(
    conversationId,
    { skip: !conversationId }
  );

  const [sendMessage] = useSendMessageMutation();
  const [markAsRead] = useMarkAsReadMutation();
  const [reactMessage] = useReactMessageMutation();
  const [deleteMessage] = useDeleteMessageMutation();
  const [pinMessage] = usePinMessageMutation();
  const [unpinMessage] = useUnpinMessageMutation();

  const [localMessages, setLocalMessages] = useState<DirectMessageResponse[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [replyTo, setReplyTo] = useState<DirectMessageResponse | null>(null);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  // Modals state
  const [actionSheetMessage, setActionSheetMessage] =
    useState<DirectMessageResponse | null>(null);
  const [reactionsModal, setReactionsModal] = useState<{
    visible: boolean;
    messageId: string;
    initialTab?: string;
  }>({
    visible: false,
    messageId: "",
  });
  const [previewAttachment, setPreviewAttachment] = useState<ChatAttachment | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);

  // Xử lý tải tập tin về thiết bị (độc lập, chỉ khi nhấn Download)
  const handleDownloadAttachment = async (att: ChatAttachment) => {
    if (!att.url) return;
    try {
      const rawName = att.fileName || "attachment_download";
      const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const localUri = `${FileSystem.documentDirectory}${Date.now()}_${safeName}`;

      const downloadResult = await FileSystem.downloadAsync(att.url, localUri);
      if (downloadResult.status !== 200) {
        throw new Error(t("chat.download_error", "Không thể tải tập tin về máy."));
      }

      let Sharing: any = null;
      try {
        Sharing = require("expo-sharing");
      } catch (e) {
        console.warn("expo-sharing is not available:", e);
      }

      if (Sharing && typeof Sharing.isAvailableAsync === "function") {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(downloadResult.uri, {
            mimeType: att.mimeType || "application/octet-stream",
            dialogTitle: att.fileName || "Tải xuống",
            UTI: att.mimeType || "public.data",
          });
          return;
        }
      }

      Alert.alert(
        t("common.notice", "Thông báo"),
        t("chat.file_saved", `Đã lưu tệp vào máy: ${downloadResult.uri}`)
      );
    } catch (err: any) {
      console.error("[ChatScreen] Download error:", err);
      Alert.alert(
        t("common.error", "Lỗi"),
        err?.message || t("chat.download_failed", "Tải file thất bại.")
      );
    }
  };

  const flatListRef = useRef<FlatList | null>(null);
  const isNearBottomRef = useRef(true);

  // Sync initial messages + scroll to end khi load xong lần đầu
  useEffect(() => {
    if (initialMessagesData) {
      setLocalMessages(initialMessagesData.messages || []);
      setHasMore(initialMessagesData.hasMore || false);
      // Scroll xuống cuối sau khi load xong
      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: false });
      }, 150);
    }
  }, [initialMessagesData]);

  // Mark conversation as read on entry
  useEffect(() => {
    if (conversationId) {
      markAsRead(conversationId);
    }
  }, [conversationId, markAsRead]);

  // Socket event callbacks
  const handleSocketNewMessage = useCallback(
    (newMsg: DirectMessageResponse) => {
      setLocalMessages((prev) => {
        const newMsgId = newMsg.id || (newMsg as any)._id;

        // 1. Nếu tin nhắn thật đã có trong danh sách -> bỏ qua không thêm trùng
        const alreadyExists = prev.some(
          (m) =>
            (m.id && m.id === newMsgId) ||
            ((m as any)._id && (m as any)._id === newMsgId)
        );
        if (alreadyExists) return prev;

        // 2. Nếu đây là tin nhắn do chính mình gửi và có tin tạm (optimistic update) đang chờ:
        const isSelf =
          (newMsg.senderId && newMsg.senderId === currentUserId) ||
          (newMsg.sender?.supabaseId && newMsg.sender.supabaseId === currentUserId);

        if (isSelf) {
          // Tìm tin tạm đang chờ để thay thế bằng tin thật từ socket ngay lập tức
          const tempIndex = prev.findIndex(
            (m) =>
              m.id.startsWith("temp_") &&
              (m.content === newMsg.content || m.senderId === currentUserId)
          );

          if (tempIndex !== -1) {
            const updated = [...prev];
            updated[tempIndex] = newMsg;
            return updated;
          }
        }

        // 3. Tin nhắn mới: thêm vào cuối danh sách
        return [...prev, newMsg];
      });

      if (conversationId) {
        markAsRead(conversationId);
      }

      setTimeout(() => {
        flatListRef.current?.scrollToEnd({ animated: true });
      }, 100);
    },
    [conversationId, currentUserId, markAsRead]
  );

  const handleSocketReactionUpdated = useCallback(
    (data: { messageId: string; reactions: any[] }) => {
      setLocalMessages((prev) =>
        prev.map((msg) =>
          msg.id === data.messageId || msg._id === data.messageId
            ? { ...msg, reactions: data.reactions }
            : msg
        )
      );
    },
    []
  );

  const handleSocketMessageDeleted = useCallback(
    (data: { messageId: string; conversationId: string }) => {
      setLocalMessages((prev) =>
        prev.map((msg) =>
          msg.id === data.messageId || msg._id === data.messageId
            ? {
                ...msg,
                deletedAt: new Date().toISOString(),
                content: t("chat.message_deleted", "Tin nhắn đã bị thu hồi"),
                attachments: [],
                isPinned: false,
              }
            : msg
        )
      );
    },
    [t]
  );

  const { isRecipientTyping, emitTyping } = useChatSocket({
    conversationId,
    currentUserId,
    onNewMessage: handleSocketNewMessage,
    onReactionUpdated: handleSocketReactionUpdated,
    onMessageDeleted: handleSocketMessageDeleted,
  });

  // Action: Load more older messages
  const handleLoadMore = async () => {
    if (!conversationId || !hasMore || isLoadingMore || localMessages.length === 0) {
      return;
    }

    try {
      const oldestId = localMessages[0].id || localMessages[0]._id;
      const res = await fetchMoreMessages({
        conversationId,
        before: oldestId,
        limit: 30,
      }).unwrap();

      if (res && res.messages) {
        setLocalMessages((prev) => {
          const existingIds = new Set(
            prev.map((m) => m.id || (m as any)._id).filter(Boolean)
          );
          const newUniqueMessages = res.messages.filter(
            (m: DirectMessageResponse) => !existingIds.has(m.id || (m as any)._id)
          );
          return [...newUniqueMessages, ...prev];
        });
        setHasMore(res.hasMore);
      }
    } catch (err) {
      console.error("[ConversationScreen] Load more error:", err);
    }
  };

  // Action: Send Message với optimistic update và reconciliation chống trùng tin
  const handleSendMessage = async (payload: {
    content?: string;
    type?: "text" | "file" | "video" | "image";
    attachments?: ChatAttachment[];
    replyToId?: string;
  }) => {
    if (!conversationId) return;

    isNearBottomRef.current = true;

    // Optimistic update: hiển thị tin nhắn tạm ngay lập tức
    const tempId = `temp_${Date.now()}`;
    const optimisticMsg: DirectMessageResponse = {
      id: tempId,
      conversationId,
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
      reactions: [],
      isPinned: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setLocalMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(() => {
      flatListRef.current?.scrollToEnd({ animated: true });
    }, 80);

    try {
      const sentMsg = await sendMessage({
        conversationId,
        ...payload,
      }).unwrap();

      const realMsgId = sentMsg.id || (sentMsg as any)._id;

      // Cập nhật state một cách an toàn và chống race condition giữa HTTP và Socket:
      setLocalMessages((prev) => {
        // Nếu socket đã nhanh hơn và chèn tin thật này vào danh sách trước rồi:
        const alreadyHasRealMsg = prev.some(
          (m) =>
            (m.id && m.id === realMsgId) ||
            ((m as any)._id && (m as any)._id === realMsgId)
        );

        if (alreadyHasRealMsg) {
          // Chỉ cần loại bỏ tin tạm tempId (nếu socket chưa thay thế)
          return prev.filter((m) => m.id !== tempId);
        }

        // Nếu socket chưa đến, thay thế tin tạm bằng tin thật từ response
        return prev.map((m) => (m.id === tempId ? { ...sentMsg } : m));
      });
    } catch (err) {
      // Xóa tin tạm nếu gửi thất bại
      setLocalMessages((prev) => prev.filter((m) => m.id !== tempId));
      throw err; // Để MobileMessageInput hiển thị lỗi
    }
  };

  // Action: React
  const handleReact = async (messageId: string, emoji: string) => {
    try {
      await reactMessage({ messageId, emoji }).unwrap();
    } catch (err) {
      console.error("[ConversationScreen] React error:", err);
    }
  };

  // Action: Delete / Recall
  const handleDelete = (messageId: string) => {
    Alert.alert(
      t("chat.delete_confirm_title", "Thu hồi tin nhắn"),
      t("chat.delete_confirm", "Bạn có chắc chắn muốn thu hồi tin nhắn này?"),
      [
        { text: t("chat.cancel", "Hủy"), style: "cancel" },
        {
          text: t("chat.delete_confirm_ok", "Thu hồi"),
          style: "destructive",
          onPress: async () => {
            try {
              await deleteMessage(messageId).unwrap();
            } catch (err) {
              console.error("[ConversationScreen] Delete error:", err);
            }
          },
        },
      ]
    );
  };

  // Action: Pin / Unpin
  const handleTogglePin = async (msg: DirectMessageResponse) => {
    if (!conversationId) return;

    const isCurrentlyPinned = Boolean(
      msg.isPinned || pinnedMessages.some((p) => p.id === msg.id)
    );

    if (isCurrentlyPinned) {
      try {
        await unpinMessage({ messageId: msg.id, conversationId }).unwrap();
      } catch (err) {
        console.error("[ConversationScreen] Unpin error:", err);
      }
    } else {
      if (pinnedMessages.length >= 3) {
        Alert.alert(
          t("chat.pin_limit_title", "Giới hạn ghim tin nhắn"),
          t(
            "chat.pin_limit_error",
            "Cuộc trò chuyện chỉ được ghim tối đa 3 tin nhắn. Vui lòng bỏ ghim một tin nhắn trước khi ghim tin mới."
          )
        );
        return;
      }

      try {
        await pinMessage({ messageId: msg.id, conversationId }).unwrap();
      } catch (err: any) {
        Alert.alert(
          t("chat.error", "Lỗi"),
          err?.data?.message || t("chat.pin_failed", "Không thể ghim tin nhắn")
        );
      }
    }
  };

  // Action: Jump to message
  const handleJumpToMessage = (messageId: string) => {
    const targetIdx = localMessages.findIndex(
      (m) => m.id === messageId || m._id === messageId
    );

    if (targetIdx >= 0) {
      flatListRef.current?.scrollToIndex({
        index: targetIdx,
        animated: true,
        viewPosition: 0.5,
      });
      setHighlightedMessageId(messageId);
      setTimeout(() => setHighlightedMessageId(null), 2500);
    } else {
      Alert.alert(
        t("chat.notice", "Thông báo"),
        t("chat.jump_not_loaded", "Tin nhắn này nằm ở các trang cũ hơn, vui lòng cuộn lên để xem.")
      );
    }
  };

  const recipient = conversation?.recipient;

  return (
    <Animated.View
      style={[{ flex: 1 }, animatedContainerStyle]}
      className="bg-white"
    >
      {/* Header */}
      <View className="flex-row items-center justify-between px-3.5 py-3 border-b border-slate-100 bg-white shadow-2xs">
        <View className="flex-row items-center flex-1 mr-2">
          <TouchableOpacity
            onPress={() => router.back()}
            className="p-1.5 rounded-full mr-1.5"
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="arrow-left" size={22} color="#1E293B" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setShowDetailsModal(true)}
            activeOpacity={0.8}
            className="flex-row items-center flex-1"
          >
            <MobileUserAvatar
              avatarUrl={recipient?.avatarUrl}
              displayName={recipient?.displayName}
              size={38}
            />

            <View className="ml-2.5 flex-1">
              <Text className="text-sm font-bold text-slate-900" numberOfLines={1}>
                {recipient?.displayName || t("chat.user_fallback", "Người dùng")}
              </Text>
              <Text className="text-[11px] text-emerald-600 font-medium">
                {recipient?.status === "ACTIVE"
                  ? t("chat.online", "Đang hoạt động")
                  : t("chat.offline", "Ngoại tuyến")}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Nút xem thông tin cuộc trò chuyện (Conversation Details) */}
        <TouchableOpacity
          onPress={() => setShowDetailsModal(true)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          className="w-9 h-9 rounded-full bg-slate-50 border border-slate-100 items-center justify-center active:bg-slate-100"
        >
          <Feather name="info" size={18} color="#0052FF" />
        </TouchableOpacity>
      </View>

      {/* Pinned Messages Bar */}
      <MobilePinnedMessagesBar
        pinnedMessages={pinnedMessages}
        currentUserId={currentUserId}
        onJumpToMessage={handleJumpToMessage}
        onUnpinMessage={(mId) =>
          unpinMessage({ messageId: mId, conversationId }).unwrap().then(() => {})
        }
      />

      {/* Messages Scroll Area */}
      <View className="flex-1 bg-slate-50/30">
        {isLoadingMessages || isLoadingConv ? (
          <View className="flex-1 items-center justify-center">
            <ActivityIndicator size="small" color="#0052FF" />
            <Text className="text-xs text-slate-400 mt-2">
              {t("chat.loading_messages", "Đang tải tin nhắn...")}
            </Text>
          </View>
        ) : localMessages.length === 0 ? (
          <View className="flex-1 items-center justify-center p-6">
            <Text className="text-sm text-slate-400 text-center">
              {t("chat.no_messages", "Chưa có tin nhắn nào. Hãy gửi lời chào đầu tiên!")}
            </Text>
          </View>
        ) : (
          <FlatList
            ref={flatListRef}
            data={localMessages}
            keyExtractor={(item, index) =>
              item.id || (item as any)._id || `msg_${index}`
            }
            contentContainerStyle={{ paddingVertical: 12 }}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            onLayout={() => {
              if (isNearBottomRef.current) {
                flatListRef.current?.scrollToEnd({ animated: false });
              }
            }}
            onContentSizeChange={() => {
              if (isNearBottomRef.current) {
                flatListRef.current?.scrollToEnd({ animated: false });
              }
            }}
            onScroll={(event) => {
              const { layoutMeasurement, contentOffset, contentSize } = event.nativeEvent;
              const paddingToBottom = 150;
              isNearBottomRef.current =
                layoutMeasurement.height + contentOffset.y >=
                contentSize.height - paddingToBottom;
            }}
            onScrollToIndexFailed={({ index }) => {
              flatListRef.current?.scrollToIndex({ index, animated: true });
            }}
            ListHeaderComponent={
              hasMore ? (
                <TouchableOpacity
                  onPress={handleLoadMore}
                  disabled={isLoadingMore}
                  className="py-2.5 items-center justify-center"
                >
                  {isLoadingMore ? (
                    <ActivityIndicator size="small" color="#0052FF" />
                  ) : (
                    <Text className="text-xs font-semibold text-blue-600">
                      {t("chat.load_older_messages", "Tải tin nhắn cũ hơn")}
                    </Text>
                  )}
                </TouchableOpacity>
              ) : null
            }
            renderItem={({ item }) => {
              const isMsgPinned = Boolean(
                item.isPinned ||
                  pinnedMessages.some(
                    (p) => p.id === item.id || (p._id && p._id === (item as any)._id)
                  )
              );

              return (
                <MobileMessageBubble
                  message={{ ...item, isPinned: isMsgPinned }}
                  currentUserId={currentUserId}
                  isHighlighted={highlightedMessageId === item.id}
                  onLongPress={(m) => setActionSheetMessage(m)}
                  onOpenReactions={(messageId, emoji) =>
                    setReactionsModal({ visible: true, messageId, initialTab: emoji })
                  }
                  onJumpToReply={(replyId) => handleJumpToMessage(replyId)}
                  onPreviewAttachment={(att) => setPreviewAttachment(att)}
                  onDownloadAttachment={handleDownloadAttachment}
                />
              );
            }}
          />
        )}

        {/* Typing indicator */}
        {isRecipientTyping && (
          <View className="flex-row items-center px-4 py-1.5 bg-white/80">
            <ActivityIndicator size="small" color="#0052FF" />
            <Text className="text-xs italic text-slate-400 ml-2">
              {recipient?.displayName || t("chat.user_fallback", "Người dùng")}{" "}
              {t("chat.typing", "đang nhập tin nhắn...")}
            </Text>
          </View>
        )}
      </View>

      {/* Composer Input */}
      <MobileMessageInput
        conversationId={conversationId}
        replyTo={replyTo}
        onCancelReply={() => setReplyTo(null)}
        onSendMessage={handleSendMessage}
        onTyping={emitTyping}
        onFocus={() => {
          if (isNearBottomRef.current) {
            flatListRef.current?.scrollToEnd({ animated: true });
          }
        }}
      />

      {/* Action Sheet (Long press menu) */}
      <MobileMessageActionSheet
        visible={Boolean(actionSheetMessage)}
        message={actionSheetMessage}
        currentUserId={currentUserId}
        onClose={() => setActionSheetMessage(null)}
        onReact={handleReact}
        onReply={(m) => setReplyTo(m)}
        onTogglePin={handleTogglePin}
        onDelete={handleDelete}
      />

      {/* Reactions List Modal */}
      <MobileMessageReactionsModal
        visible={reactionsModal.visible}
        messageId={reactionsModal.messageId}
        initialTab={reactionsModal.initialTab}
        onClose={() => setReactionsModal({ visible: false, messageId: "" })}
      />

      {/* In-App Attachment Viewer Modal (Xem ảnh/PDF trực tiếp, không mở Supabase URL) */}
      <MobileAttachmentViewerModal
        visible={Boolean(previewAttachment)}
        attachment={previewAttachment}
        onClose={() => setPreviewAttachment(null)}
        onDownload={handleDownloadAttachment}
      />

      {/* Conversation Details Modal */}
      <MobileConversationDetailsModal
        visible={showDetailsModal}
        onClose={() => setShowDetailsModal(false)}
        conversation={conversation}
        messages={localMessages}
        onPreviewAttachment={(att) => setPreviewAttachment(att)}
        onDownloadAttachment={handleDownloadAttachment}
      />
    </Animated.View>
  );
}
